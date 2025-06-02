#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  api,
  fetchProjectDesignTokens,
  fetchStyleguideDesignTokens,
  processScreenVersionsAndAnnotations
} from "./clients/zeplinApi.js";
import { INSTRUCTIONS } from "./constants.js";
import type {
  ScreenData,
  ComponentData,
  ApiResponse
} from "./types.js";
import { assetRegistry } from "./utils/asset-registry.js";
import {
  getAssetUrl,
  downloadAsset
} from "./utils/asset-utils.js";
import {
  createErrorResponse,
  createSuccessResponse
} from "./utils/response-utils.js";
import { resolveUrl, URL_PATTERNS } from "./utils/url-utils.js";

/**
 * Fetches and processes screen data from Zeplin
 * @param url The resolved Zeplin screen URL
 * @param includeVariants Whether to include variants in the response
 * @param targetLayerName Optional name of layer to extract layer data for
 * @returns Formatted response object with screen data or error message
 */
export async function getScreenData(
  url: string,
  includeVariants: boolean,
  targetLayerName?: string
): Promise<ApiResponse<ScreenData>> {
  const match = url.match(URL_PATTERNS.SCREEN);
  if (!match) {
    return createErrorResponse("Screen link is not valid — here's the expected format: https://app.zeplin.io/project/{projectId}/screen/{screenId}");
  }

  const [_, projectId, screenId] = match;

  try {
    // Reset the asset registry to clear any previous assets
    assetRegistry.reset();

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
      targetLayerName
    );

    // Register assets for future lookups but don't include them in the response
    variants.forEach(variant => {
      if (variant.assets && variant.assets.length > 0) {
        assetRegistry.registerAssets(variant.assets.filter(asset => asset.contents));
      }
    });

    const designTokens = await fetchProjectDesignTokens(projectId);

    const screenData: ScreenData = {
      type: "Screen",
      name,
      variants: variants.map(variant => ({
        name: variant.name,
        annotations: variant.annotations,
        layers: variant.layers
        // Assets are intentionally omitted
      })),
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
    assetRegistry.reset();

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

    const designTokens = isProjectComponent && projectId
      ? await fetchProjectDesignTokens(projectId)
      : styleguideId
        ? await fetchStyleguideDesignTokens(styleguideId)
        : undefined;

    const component = componentResponse.data;
    const sectionId = component.section?.id;

    // Register assets for future lookups but don't include them in the response
    if (component.latestVersion?.assets) {
      assetRegistry.registerAssets(component.latestVersion.assets.filter(asset => asset.contents));
    }

    if (!sectionId || !styleguideId) {
      const sanitizedComponent = JSON.parse(JSON.stringify(component));

      if (sanitizedComponent.latestVersion && "assets" in sanitizedComponent.latestVersion) {
        delete sanitizedComponent.latestVersion.assets;
      }

      const response: ComponentData = { component: sanitizedComponent };
      return createSuccessResponse(response, INSTRUCTIONS);
    }

    const sectionsResponse = await api.components.getStyleguideComponentSections(styleguideId);
    const sections = sectionsResponse.data;
    const section = sections.find((s) => s.id === sectionId);

    if (!section) {
      const sanitizedComponent = JSON.parse(JSON.stringify(component));

      if (sanitizedComponent.latestVersion && "assets" in sanitizedComponent.latestVersion) {
        delete sanitizedComponent.latestVersion.assets;
      }

      const response: ComponentData = { component: sanitizedComponent };
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

    sectionComponents.forEach(componentVariant => {
      if (componentVariant.latestVersion?.assets) {
        assetRegistry.registerAssets(
          componentVariant.latestVersion.assets.filter(asset => asset.contents)
        );
      }
    });

    const componentData: ComponentData = {
      name: section.name,
      variants: sectionComponents.map((componentVariant) => {
        return {
          name: componentVariant.name,
          props: componentVariant.variantProperties?.map((property) => ({
            name: property.name,
            value: property.value,
          })),
          layers: componentVariant.latestVersion?.layers,
          // Assets are intentionally omitted
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
  "Fetches detailed design specifications for a specific Zeplin component, including its properties, variants, layers, and associated design tokens. Use this when you need to understand the structure and styling of a single, reusable UI element from Zeplin.",
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
  "Fetches detailed design data for a specific screen from Zeplin. This includes screen variants, layer information (structure, position, styling), annotations, and project-level design tokens. Use this to understand screen layout, content, and interactions for development or review.",
  {
    url: z.string().url(),
    includeVariants: z.boolean().default(true)
      .describe(
        "Set to `true` (default) to retrieve all variants of the screen (e.g., different states or sizes). Set to `false` if only the specific screen version linked in the URL is needed, or to conserve tokens if variants are not relevant to the user's query. Fetching all variants provides a complete picture but uses more tokens.",
      ),
    targetLayerName: z.string().optional()
      .describe(
        "Optional. If the user's query refers to a specific named layer or element on the screen (e.g., 'the submit button', 'user profile image'), provide that layer's exact name here. This will focus the returned data on that specific layer and its children, making the response more concise and relevant. If omitted or the layer name is not found, data for all layers on the screen will be returned.",
      ),
  },
  async ({ url, includeVariants, targetLayerName }) => {
    try {
      const resolvedUrl = await resolveUrl(url.trim());
      return await getScreenData(resolvedUrl, includeVariants, targetLayerName);
    } catch (error) {
      return createErrorResponse(`Error resolving or processing URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
);

// Register the download_layer_asset tool
server.tool(
  "download_layer_asset",
  "Downloads a specific visual asset (e.g., SVG icon, PNG image) for a given layer from Zeplin and saves it to a local path. Use this tool when an asset referenced in the design (obtained from `get_screen` or `get_component`) is missing from the codebase and needs to be fetched directly from Zeplin.",
  {
    layerSourceId: z.string()
      .describe(
        "The unique source ID of the layer for which the asset should be downloaded. This ID is obtained from the `layers` array in the response of `get_screen` or `get_component` calls, from a `sourceId` or similar field associated with a specific layer that has exportable assets",
      ),
    localPath: z.string()
      .describe(
        "The absolute path to the directory where images/assets are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
      ),
    assetType: z.enum(["svg", "png", "pdf", "jpg"])
      .describe(
        "The desired format of the asset to download. Must be one of 'svg', 'png', 'jpg', or 'pdf'. Choose the format most suitable for the project's needs or as indicated by design specifications. If unsure, 'svg' is often preferred for vector graphics and 'png' for bitmaps.",
      ),
  },
  async ({ layerSourceId, localPath, assetType }) => {
    const assetUrl = getAssetUrl(layerSourceId, assetType);

    if (!assetUrl) {
      return createErrorResponse(`No asset found with layer source ID: ${layerSourceId} and format ${assetType}`);
    }

    return await downloadAsset(assetUrl, localPath);
  },
);

server.tool(
  "get_design_tokens",
  "Download design tokens for a project or styleguide",
  {
    resourceId: z.string()
      .describe(
        "The ID of the project or styleguide for which the design tokens should be downloaded.",
      ),
  },
  async ({ resourceId }) => {
    let projectDesignTokens = null;
    let styleguideDesignTokens = null;
    let projectError = null;
    let styleguideError = null;

    try {
      projectDesignTokens = await fetchProjectDesignTokens(resourceId);
    } catch (error) {
      projectError = error;
    }

    try {
      styleguideDesignTokens = await fetchStyleguideDesignTokens(resourceId);
    } catch (error) {
      styleguideError = error;
    }

    // If both failed, return an error
    if (!projectDesignTokens && !styleguideDesignTokens) {
      const errorMessage = `No design tokens found for project or styleguide with ID: ${resourceId}`;
      if (projectError && styleguideError) {
        return createErrorResponse(`${errorMessage}. Project error: ${projectError instanceof Error ? projectError.message : String(projectError)}. Styleguide error: ${styleguideError instanceof Error ? styleguideError.message : String(styleguideError)}`);
      }
      return createErrorResponse(errorMessage);
    }

    return createSuccessResponse({
      projectDesignTokens,
      styleguideDesignTokens,
    }, INSTRUCTIONS);
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
