import { ZeplinApi, Configuration } from "@zeplin/sdk";

import type { DesignTokensData } from "../types.js";
import { pruneLayersForTargetLayer } from "../utils/api-utils.js";
import { preProcess, preProcessDesignTokens } from "../utils/preprocessing.js";

/**
 * Initialize the Zeplin API client
 */
export const api = new ZeplinApi(
  new Configuration({ accessToken: process.env.ZEPLIN_ACCESS_TOKEN }),
);

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
 * @param targetLayerName Optional layer name to extract
 * @returns Array of processed screen variants
 */
export async function processScreenVersionsAndAnnotations(
  projectId: string,
  screenIds: string[],
  variantNames: string[],
  targetLayerName?: string
) {
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

  const screenAnnotationsResponse = await Promise.all(
    screenIds.map((screenId) =>
      api.screens.getScreenAnnotations(projectId, screenId),
    ),
  );

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

  return screenVersionResponses.map((response, index) => {
    const screenVersion = response.data;

    // If targetLayerName is provided, prune the layers.
    // Otherwise, use all layers from the screenVersion.
    const layersToInclude = targetLayerName
      ? pruneLayersForTargetLayer(screenVersion.layers || [], targetLayerName)
      : screenVersion.layers || [];

    return {
      name: variantNames[index],
      annotations: screenAnnotations[index],
      layers: layersToInclude,
      assets: screenVersion.assets,
    };
  });
}
