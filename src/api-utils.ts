import { ZeplinApi, type Asset } from "@zeplin/sdk";
import { Configuration } from "@zeplin/sdk";
import { preProcess, preProcessDesignTokens } from "./util.js";

export const api = new ZeplinApi(
    new Configuration({ accessToken: process.env.ZEPLIN_ACCESS_TOKEN }),
);

export let assets: Asset[] = [];

export function errorResponse(message: string) {
    return {
        content: [
            {
                type: "text" as const,
                text: message,
            },
        ],
        isError: true,
    };
}

export function formatSuccessResponse(data: any, instructionsTemplate: string) {
    return {
        content: [
            {
                type: "text" as const,
                text: `${instructionsTemplate}

                ${typeof data === 'string' ? data : `${data.type || ''} data in JSON format:
                ${JSON.stringify(data, null, 2)}`}`,
            },
        ],
    };
}

export function collectAssets(responseData: any): void {
    assets = [];

    if (Array.isArray(responseData.variants)) {
        responseData.variants.forEach((variant: any) => {
            if (variant.assets && Array.isArray(variant.assets)) {
                variant.assets.forEach((asset: Asset) => {
                    if (asset.contents) {
                        assets.push(asset);
                    }
                });
            }
        });
    }

    if (responseData.component?.latestVersion?.assets) {
        responseData.component.latestVersion.assets.forEach((asset: Asset) => {
            if (asset.contents) {
                assets.push(asset);
            }
        });
    }
}

/**
 * Recursively searches for a component with the given name in the layer tree
 * and returns the layer, its parent, and path to the component
 */
function findComponentInLayers(
    layers: any[],
    targetComponentName: string,
    parentLayer: any = null,
    path: any[] = []
): { found: boolean; layer: any; parentLayer: any; path: any[] } {
    if (!layers || !Array.isArray(layers)) {
        return { found: false, layer: null, parentLayer: null, path: [] };
    }

    for (const layer of layers) {
        if (layer.componentName === targetComponentName) {
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
 */
function pruneLayersForComponent(layers: any[], targetComponentName: string): any[] {
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
        const prunedParent = { ...parentLayer };
        prunedParent.layers = [targetLayer];

        return [prunedParent];
    } else {
        return [targetLayer];
    }
}

export async function processScreenVersionsAndAnnotations(
    projectId: string,
    screenIds: string[],
    variantNames: string[],
    targetComponentName?: string
) {
    const screenVersionResponses = await Promise.all(
        screenIds.map(async (screenId) => {
            const response = await api.screens.getLatestScreenVersion(projectId, screenId);
            const processedData = preProcess(response.data);
            return {
                ...response,
                data: processedData as typeof response.data
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
                    x: annotation.position.x * screenVersion.data.width,
                    y: annotation.position.y * screenVersion.data.height,
                },
            }));
        },
    );

    return screenVersionResponses.map((response, index) => {
        const screenVersion = response.data;

        if (screenVersion.assets && screenVersion.assets.length > 0) {
            screenVersion.assets.forEach(asset => {
                if (asset.contents) {
                    assets.push(asset);
                }
            });
        }

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

export async function getProjectDesignTokens(projectId: string) {
    const designTokens = await api.designTokens.getProjectDesignTokens(projectId, { includeLinkedStyleguides: true });

    return {
        designTokens: preProcessDesignTokens(designTokens.data),
    }
}

export async function getStyleguideDesignTokens(styleguideId: string) {
    const designTokens = await api.designTokens.getStyleguideDesignTokens(styleguideId, { includeLinkedStyleguides: true });

    return {
        designTokens: preProcessDesignTokens(designTokens.data),
    }
}