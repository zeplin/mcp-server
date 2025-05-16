import { ZeplinApi, type Asset } from "@zeplin/sdk";
import { Configuration } from "@zeplin/sdk";
import { preProcess } from "./util.js";

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

export async function processScreenVersionsAndAnnotations(
    projectId: string,
    screenIds: string[],
    variantNames: string[]
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

        return {
            name: variantNames[index],
            annotations: screenAnnotations[index],
            layers: screenVersion.layers,
            assets: screenVersion.assets,
        };
    });
}