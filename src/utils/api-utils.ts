import { ZeplinApi, type Asset, type Layer } from "@zeplin/sdk";
import { Configuration } from "@zeplin/sdk";
import { preProcess, preProcessDesignTokens } from "../util.js";
import type { DesignTokensData } from "../types.js";

/**
 * Initialize the Zeplin API client
 */
export const api = new ZeplinApi(
  new Configuration({ accessToken: process.env.ZEPLIN_ACCESS_TOKEN }),
);

/**
 * Recursively searches for a component with the given name in the layer tree
 * and returns the layer, its parent, and path to the component
 * @param layers Array of layers to search through
 * @param targetComponentName Name of the component to find
 * @param parentLayer Optional parent layer reference
 * @param path Optional path to the current position in the tree
 * @returns Object containing found status, layer, parent layer, and path
 */
export function findComponentInLayers(
  layers: Layer[],
  targetComponentName: string,
  parentLayer: Layer | null = null,
  path: Layer[] = []
): { found: boolean; layer: Layer | null; parentLayer: Layer | null; path: Layer[] } {
  if (!layers || !Array.isArray(layers)) {
    return { found: false, layer: null, parentLayer: null, path: [] };
  }

  for (const layer of layers) {
    if (layer.componentName === targetComponentName || layer.name === targetComponentName) {
      return { found: true, layer, parentLayer, path: [...path, layer] };
    }

    if (layer.layers && Array.isArray(layer.layers)) {
      const result = findComponentInLayers(
        layer.layers,
        targetComponentName,
        layer,
        [...path, layer]
      );

      if (result.found) {
        return result;
      }
    }
  }

  return { found: false, layer: null, parentLayer: null, path: [] };
}

/**
 * Prunes layers data to only include the target component, its immediate parent, and all of its children.
 * @param layers The full layers array from a screen version.
 * @param targetComponentName The name of the component to find and keep.
 * @returns Pruned layer array containing only relevant layers
 */
export function pruneLayersForComponent(layers: Layer[], targetComponentName: string): Layer[] {
  if (!targetComponentName) {
    return layers;
  }

  if (!Array.isArray(layers)) {
    return [];
  }

  const { found, layer: targetLayer, parentLayer } = findComponentInLayers(layers, targetComponentName);

  if (!found || !targetLayer) {
    return [];
  }

  if (parentLayer) {
    // Return just the parent with all its children intact
    return [parentLayer];
  } else {
    // If no parent (top-level component), return just the target
    return [targetLayer];
  }
}

/**
 * Fetches design tokens for a project
 * @param projectId The ID of the project
 * @returns The design tokens data
 */
export async function fetchProjectDesignTokens(projectId: string): Promise<DesignTokensData> {
  const designTokens = await api.designTokens.getProjectDesignTokens(projectId, { includeLinkedStyleguides: true });

  return {
    designTokens: preProcessDesignTokens(designTokens.data),
  };
}

/**
 * Fetches design tokens for a styleguide
 * @param styleguideId The ID of the styleguide
 * @returns The design tokens data
 */
export async function fetchStyleguideDesignTokens(styleguideId: string): Promise<DesignTokensData> {
  const designTokens = await api.designTokens.getStyleguideDesignTokens(styleguideId, { includeLinkedStyleguides: true });

  return {
    designTokens: preProcessDesignTokens(designTokens.data),
  };
}

/**
 * Processes screen versions and annotations to create screen variants
 * @param projectId The project ID
 * @param screenIds Array of screen IDs
 * @param variantNames Array of variant names
 * @param targetComponentName Optional component name to extract
 * @returns Array of processed screen variants
 */
export async function processScreenVersionsAndAnnotations(
  projectId: string,
  screenIds: string[],
  variantNames: string[],
  targetComponentName?: string
) {
  // Fetch all screen versions in parallel
  const screenVersionResponses = await Promise.all(
    screenIds.map(async (screenId) => {
      const response = await api.screens.getLatestScreenVersion(projectId, screenId);
      const processedData = preProcess(response.data);
      return {
        ...response,
        data: processedData
      };
    }),
  );

  // Fetch all screen annotations in parallel
  const screenAnnotationsResponse = await Promise.all(
    screenIds.map((screenId) =>
      api.screens.getScreenAnnotations(projectId, screenId),
    ),
  );

  // Process the annotations
  const screenAnnotations = screenAnnotationsResponse.map(
    (response, index) => {
      const annotations = response.data;
      const screenVersion = screenVersionResponses[index];

      return annotations.map((annotation) => ({
        type: annotation.type.name,
        text: annotation.content,
        position: {
          x: annotation.position.x * (screenVersion.data.width || 0),
          y: annotation.position.y * (screenVersion.data.height || 0),
        },
      }));
    },
  );

  // Map the screen versions to the final format
  return screenVersionResponses.map((response, index) => {
    const screenVersion = response.data;

    // If targetComponentName is provided, prune the layers.
    // Otherwise, use all layers from the screenVersion.
    const layersToInclude = targetComponentName
      ? pruneLayersForComponent(screenVersion.layers || [], targetComponentName)
      : screenVersion.layers || [];

    return {
      name: variantNames[index],
      annotations: screenAnnotations[index],
      layers: layersToInclude,
      assets: screenVersion.assets,
    };
  });
}