#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Asset } from "@zeplin/sdk";

import { resolveUrl, URL_PATTERNS } from "./utils/url-utils.js";
import { INSTRUCTIONS } from "./constants.js";
import {
  findAssetById,
  getAssetUrl,
  downloadAsset
} from "./utils/asset-utils.js";
import {
  createErrorResponse,
  createSuccessResponse,
  collectAssets
} from "./utils/response-utils.js";
import {
  api,
  fetchProjectDesignTokens,
  fetchStyleguideDesignTokens,
  processScreenVersionsAndAnnotations
} from "./utils/api-utils.js";
import type {
  ScreenData,
  ComponentData,
  ApiResponse
} from "./types.js";

// Collection of assets for download
const assets: Asset[] = [];

/**
 * Fetches and processes screen data from Zeplin
 * @param url The resolved Zeplin screen URL
 * @param includeVariants Whether to include variants in the response
 * @param targetComponentName Optional name of component to extract layer data for
 * @returns Formatted response object with screen data or error message
 */
export async function getScreenData(
  url: string,
  includeVariants: boolean,
  targetComponentName?: string
): Promise<ApiResponse<ScreenData>> {
  const match = url.match(URL_PATTERNS.SCREEN);
  if (!match) {
    return createErrorResponse("Screen link is not valid — here's the expected format: https://app.zeplin.io/project/{projectId}/screen/{screenId}");
  }

  const [_, projectId, screenId] = match;

  try {
    const screenResponse = await api.screens.getScreen(projectId, screenId);
    const screen = screenResponse.data;

    let name: string;
    let screenIds: string[];
    let variantNames: string[];

    if (screen.variant && includeVariants) {
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
      variantNames,
      targetComponentName
    );

    // Reset asset collection
    assets.length = 0;

    // Collect assets from variants
    variants.forEach(variant => {
      if (variant.assets && variant.assets.length > 0) {
        variant.assets.forEach(asset => {
          if (asset.contents) {
            assets.push(asset);
          }
        });
      }
    });

    const designTokens = await fetchProjectDesignTokens(projectId);

    const screenData: ScreenData = {
      type: "Screen",
      name,
      variants,
      designTokens: designTokens.designTokens
    };

    return createSuccessResponse(screenData, INSTRUCTIONS);
  } catch (error) {
    return createErrorResponse(`Failed to fetch screen data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetches and processes component data from Zeplin
 * @param url The resolved Zeplin component URL
 * @returns Formatted response object with component data or error message
 */
export async function getComponentData(url: string): Promise<ApiResponse<ComponentData>> {
  let match = url.match(URL_PATTERNS.COMPONENT);
  let isProjectComponent = false;

  if (!match) {
    match = url.match(URL_PATTERNS.PROJECT_STYLEGUIDE_COMPONENT);
    isProjectComponent = true;
  }

  if (!match) {
    return createErrorResponse("Component link is not valid. Expected formats: https://app.zeplin.io/styleguide/{styleguideId}/component/{componentId} or https://app.zeplin.io/project/{projectId}/styleguide/component/{componentId}");
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
      ? await fetchProjectDesignTokens(projectId)
      : styleguideId
        ? await fetchStyleguideDesignTokens(styleguideId)
        : undefined;

    const component = componentResponse.data;
    const sectionId = component.section?.id;

    // Reset asset collection
    assets.length = 0;

    // If no section information is available, return the component directly
    if (!sectionId || !styleguideId) {
      const response: ComponentData = { component };
      collectAssets(response, assets);
      return createSuccessResponse(response, INSTRUCTIONS);
    }

    const sectionsResponse = await api.components.getStyleguideComponentSections(styleguideId);
    const sections = sectionsResponse.data;
    const section = sections.find((s) => s.id === sectionId);

    if (!section) {
      const response: ComponentData = { component };
      collectAssets(response, assets);
      return createSuccessResponse(response, INSTRUCTIONS);
    }

    const sectionComponentsResponse = await api.components.getStyleguideComponents(
      styleguideId,
      {
        sectionId,
        includeLatestVersion: true,
      }
    );

    const sectionComponents = sectionComponentsResponse.data;

    const componentData: ComponentData = {
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

    return createSuccessResponse(componentData, INSTRUCTIONS);
  } catch (error) {
    return createErrorResponse(`Failed to fetch component data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Initialize the MCP server
const server = new McpServer({
  name: "Zeplin MCP Server",
  version: "0.1.0",
});

// Register the get_component tool
server.tool(
  "get_component",
  "Get design data of a component in Zeplin.",
  {
    url: z.string().url(),
  },
  async ({ url }) => {
    try {
      const resolvedUrl = await resolveUrl(url.trim());
      return await getComponentData(resolvedUrl);
    } catch (error) {
      return createErrorResponse(`Error resolving or processing URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);

// Register the get_screen tool
server.tool(
  "get_screen",
  "Get design data of a screen in Zeplin.",
  {
    url: z.string().url(),
    includeVariants: z.boolean().default(true)
      .describe(
        "Whether to include variants in the response. If true, the response will contain all variants of the screen. This is better to cover all cases however it takes more context window length.",
      ),
    targetComponentName: z.string().optional()
      .describe(
        "The name of the component you want to extract the layer data from the screen. If user mentions a specific component name, use this to fetch only a subset of layer data from the screen. If not provided, all layers will be fetched.",
      ),
  },
  async ({ url, includeVariants, targetComponentName }) => {
    try {
      const resolvedUrl = await resolveUrl(url.trim());
      return await getScreenData(resolvedUrl, includeVariants, targetComponentName);
    } catch (error) {
      return createErrorResponse(`Error resolving or processing URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);

// Register the download_layer_asset tool
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
        "The absolute path to the directory where images/assets are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
      ),
    assetType: z.enum(["svg", "png", "pdf", "jpg"])
      .describe(
        "The type of asset you want to download. This can be either 'svg', 'jpg', 'png' or 'pdf'. Check which content type is preferred in the codebase context and set this accordingly.",
      ),
  },
  async ({ sourceId, localPath, assetType }) => {
    const relevantAsset = findAssetById(sourceId, assets);

    if (!relevantAsset) {
      return createErrorResponse(`No asset found with layer source ID: ${sourceId}`);
    }

    const assetUrl = getAssetUrl(relevantAsset, assetType);

    if (!assetUrl) {
      return createErrorResponse(`Asset found but no downloadable content available for the selected asset type ${assetType} or layer source ID: ${sourceId}`);
    }

    return await downloadAsset(assetUrl, localPath);
  },
);

// Start the server
try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  console.error(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}