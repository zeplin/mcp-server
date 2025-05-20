#!/usr/bin/env node
import * as path from "path";
import * as fs from "fs/promises";
import fetch from "node-fetch";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { resolveUrl } from "./util.js";
import { URL_PATTERNS, INSTRUCTIONS } from "./constants.js";
import {
    api,
    assets,
    errorResponse,
    formatSuccessResponse,
    collectAssets,
    processScreenVersionsAndAnnotations,
    getProjectDesignTokens,
    getStyleguideDesignTokens
} from "./api-utils.js";

/**
 * Fetches and processes screen data from Zeplin
 * @param url The resolved Zeplin screen URL
 * @returns Formatted response object with screen data or error message
 */
export async function getScreenData(url: string) {
    const match = url.match(URL_PATTERNS.SCREEN);
    if (!match) {
        return errorResponse("Screen link is not valid — here's the expected format: https://app.zeplin.io/project/{projectId}/screen/{screenId}");
    }

    const [_, projectId, screenId] = match;

    try {
        const screenResponse = await api.screens.getScreen(projectId, screenId);
        const screen = screenResponse.data;

        let name: string;
        let screenIds: string[];
        let variantNames: string[];

        if (screen.variant) {
            const variantGroupId = screen.variant.group.id;
            const variantGroupResponse = await api.screens.getScreenVariant(
                projectId,
                variantGroupId,
            );
            const variantGroup = variantGroupResponse.data;

            name = variantGroup.name;
            screenIds = variantGroup.variants
                .map((variant) => variant.screenId)
                .filter((id): id is string => id !== undefined);

            variantNames = variantGroup.variants
                .map((variant) => variant.value)
                .filter((name): name is string => name !== undefined);
        } else {
            name = screen.name || "Unnamed Screen";
            screenIds = [screenId];
            variantNames = [screen.name || "Unnamed Screen"];
        }

        const variants = await processScreenVersionsAndAnnotations(
            projectId,
            screenIds,
            variantNames
        );

        const designTokens = await getProjectDesignTokens(projectId);

        const response = { name, variants, designTokens };

        return formatSuccessResponse({
            type: "Screen",
            ...response
        }, INSTRUCTIONS);
    } catch (error) {
        return errorResponse(`Failed to fetch screen data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Fetches and processes component data from Zeplin
 * @param url The resolved Zeplin component URL
 * @returns Formatted response object with component data or error message
 */
export async function getComponentData(url: string) {
    let match = url.match(URL_PATTERNS.COMPONENT);
    let isProjectComponent = false;

    if (!match) {
        match = url.match(URL_PATTERNS.PROJECT_STYLEGUIDE_COMPONENT);
        isProjectComponent = true;
    }

    if (!match) {
        return errorResponse("Component link is not valid. Expected formats: https://app.zeplin.io/styleguide/{styleguideId}/component/{componentId} or https://app.zeplin.io/project/{projectId}/styleguide/component/{componentId}");
    }

    try {
        let componentResponse;
        let styleguideId: string | undefined;
        let projectId: string | undefined;
        let componentId: string;

        if (isProjectComponent) {
            [, projectId, componentId] = match;
            componentResponse = await api.components.getProjectComponent(
                projectId,
                componentId,
                { includeLatestVersion: true },
            );
        } else {
            [, styleguideId, componentId] = match;
            componentResponse = await api.components.getStyleguideComponent(
                styleguideId!,
                componentId,
                { includeLatestVersion: true },
            );
        }

        // Fetch design tokens based on component type
        const designTokens = isProjectComponent && projectId
            ? await getProjectDesignTokens(projectId)
            : styleguideId
              ? await getStyleguideDesignTokens(styleguideId)
              : undefined;

        const component = componentResponse.data;
        const sectionId = component.section?.id;

        // If no section information is available, return the component directly
        if (!sectionId || !styleguideId) {
            const response = { component };
            collectAssets(response);
            return formatSuccessResponse(response, INSTRUCTIONS);
        }

        const sectionsResponse = await api.components.getStyleguideComponentSections(styleguideId);
        const sections = sectionsResponse.data;
        const section = sections.find((s) => s.id === sectionId);

        if (!section) {
            const response = { component };
            collectAssets(response);
            return formatSuccessResponse(response, INSTRUCTIONS);
        }

        const sectionComponentsResponse = await api.components.getStyleguideComponents(
            styleguideId,
            {
                sectionId,
                includeLatestVersion: true,
            }
        );

        const sectionComponents = sectionComponentsResponse.data;

        const response = {
            name: section.name,
            variants: sectionComponents.map((componentVariant) => {
                if (componentVariant.latestVersion?.assets && componentVariant.latestVersion.assets.length > 0) {
                    componentVariant.latestVersion.assets.forEach(asset => {
                        if (asset.contents) {
                            assets.push(asset);
                        }
                    });
                }

                return {
                    name: componentVariant.name,
                    props: componentVariant.variantProperties?.map((property) => ({
                        name: property.name,
                        value: property.value,
                    })),
                    layers: componentVariant.latestVersion?.layers,
                    assets: componentVariant.latestVersion?.assets,
                };
            }),
            designTokens: designTokens?.designTokens,
        };

        return formatSuccessResponse(response, INSTRUCTIONS);
    } catch (error) {
        return errorResponse(`Failed to fetch component data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Downloads an asset from a Zeplin URL and saves it to the specified local directory
 * @param assetUrl The URL of the asset to download
 * @param localDir The local directory path to save the asset
 * @returns Formatted response object with download status or error message
 */
async function downloadAsset(assetUrl: string, localDir: string) {
    try {
        const url = new URL(assetUrl);
        const urlPath = url.pathname;
        const fileExtension = path.extname(urlPath) || ".png";
        const assetId = path.basename(urlPath, fileExtension);

        await fs.mkdir(localDir, { recursive: true });

        const fileName = assetId + fileExtension;
        const filePath = path.join(localDir, fileName);

        const response = await fetch(assetUrl);
        const buffer = await response.arrayBuffer();
        await fs.writeFile(filePath, Buffer.from(buffer));

        return {
            content: [
                {
                    type: "text" as const,
                    text: `Asset successfully downloaded to ${filePath}`,
                },
            ],
        };
    } catch (error) {
        return errorResponse(`Failed to download asset: ${error instanceof Error ? error.message : String(error)}`);
    }
}

const server = new McpServer({
    name: "Zeplin MCP Server",
    version: "0.1.0",
});

server.tool(
    "get_component",
    "Get design data of a component in Zeplin.",
    {
        url: z.string().url(),
    },
    async ({ url }) => {
        const resolvedUrl = await resolveUrl(url.trim());
        return await getComponentData(resolvedUrl);
    },
);

server.tool(
    "get_screen",
    "Get design data of a screen in Zeplin.",
    {
        url: z.string().url(),
    },
    async ({ url }) => {
        const resolvedUrl = await resolveUrl(url.trim());
        return await getScreenData(resolvedUrl);
    },
);

server.tool(
    "download_layer_asset",
    "Download SVG, PNG asset from Zeplin. Use if you couldn't find the assets in the codebase context.",
    {
        sourceId: z.string()
        .describe(
            "The source ID of the asset you want to download. This ID is used to identify the specific asset in Zeplin.",
        ),
        localPath: z.string()
        .describe(
          "The absolute path to the directory where images are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
        ),
        assetType: z.enum(["svg", "png", "pdf", "jpg"])
        .describe(
            "The type of asset you want to download. This can be either 'svg', 'jpg', 'png' or 'pdf'. Check which content type is preferred in the codebase context and set this accordingly.",
        ),
    },
    async ({ sourceId, localPath, assetType }) => {
        const relevantAsset = assets.find(
            (asset) => asset.layerSourceId === sourceId,
        );

        if (!relevantAsset) {
            return errorResponse(`No asset found with layer source ID: ${sourceId}`);
        }

        let assetUrl = relevantAsset.contents.find(content => content.format === assetType)?.url;

        if (!assetUrl) {
            return errorResponse(`Asset found but no downloadable content available for the selected asset type ${assetType} or layer source ID: ${sourceId}`);
        }

        return await downloadAsset(assetUrl, localPath);
    },
);

try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
} catch (error) {
    console.error(error);
    process.exit(1);
}