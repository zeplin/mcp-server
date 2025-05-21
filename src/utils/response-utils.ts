import type { Asset } from "@zeplin/sdk";
import type { ApiResponse, ResponseContent, ResponseOptions } from "../types.js";

/**
 * Creates an error response with consistent formatting
 * @param message Error message to display
 * @returns Formatted error response
 */
export function createErrorResponse(message: string): ApiResponse<never> {
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

/**
 * Creates a success response with consistent formatting
 * @param data The data to include in the response
 * @param instructionsTemplate The template for instructions to include
 * @returns Formatted success response
 */
export function createSuccessResponse<T>(data: T, instructionsTemplate: string): ApiResponse<T> {
  return {
    content: [
      {
        type: "text" as const,
        text: `${instructionsTemplate}

              ${typeof data === 'string' ? data : `${(data as any).type || ''} data in JSON format:
              ${JSON.stringify(data, null, 2)}`}`,
      },
    ],
  };
}

/**
 * Creates a generic response based on provided options
 * @param options Response options including message, error status, and data
 * @returns Formatted API response
 */
export function createResponse(options: ResponseOptions): ApiResponse<unknown> {
  const content: ResponseContent[] = [];
  
  if (options.message) {
    content.push({
      type: "text",
      text: options.message
    });
  }
  
  if (options.data && typeof options.data !== 'string' && !options.isError) {
    content.push({
      type: "text",
      text: JSON.stringify(options.data, null, 2)
    });
  }
  
  return {
    content,
    isError: options.isError
  };
}

/**
 * Collects assets from response data for later download
 * @param responseData The response data containing assets
 * @param assetCollection The collection to add assets to
 */
export function collectAssets(
  responseData: any, 
  assetCollection: Asset[]
): void {
  // Reset the assets collection if needed
  if (assetCollection.length === 0) {
    // No need to reset if already empty
  }

  // Extract assets from variants
  if (Array.isArray(responseData.variants)) {
    responseData.variants.forEach((variant: any) => {
      if (variant.assets && Array.isArray(variant.assets)) {
        variant.assets.forEach((asset: Asset) => {
          if (asset.contents) {
            assetCollection.push(asset);
          }
        });
      }
    });
  }

  // Extract assets from component
  if (responseData.component?.latestVersion?.assets) {
    responseData.component.latestVersion.assets.forEach((asset: Asset) => {
      if (asset.contents) {
        assetCollection.push(asset);
      }
    });
  }
}