import * as fs from "fs/promises";
import fetch from "node-fetch";
import * as path from "path";

import type { ApiResponse } from "../types.js";

import { assetRegistry } from "./asset-registry.js";
import { createErrorResponse, createResponse } from "./response-utils.js";



/**
 * Finds an asset by its source ID from the asset registry
 * @param sourceId The source ID to search for
 * @returns Object containing the asset URL and information or undefined
 */
export function findAssetById(sourceId: string): { url?: string, format?: string, displayName?: string } | undefined {
  const record = assetRegistry.getAssetRecord(sourceId);
  if (!record || record.contents.length === 0) return undefined;

  return {
    url: record.contents[0].url,
    format: record.contents[0].format,
    displayName: record.displayName
  };
}

/**
 * Gets a downloadable asset URL for the specified format
 * @param sourceId The source ID of the asset
 * @param format The desired file format
 * @returns The URL or undefined if not available
 */
export function getAssetUrl(sourceId: string, format: string): string | undefined {
  return assetRegistry.getAssetUrl(sourceId, format);
}

/**
 * Removes assets from response data to reduce payload size
 * @param data The data to sanitize
 * @returns The data with assets removed
 */
export function sanitizeResponse(data: any): any {
  if (!data) return data;

  assetRegistry.extractAssetsFromData(data);

  const result = JSON.parse(JSON.stringify(data));

  if (Array.isArray(result.variants)) {
    result.variants.forEach((variant: any) => {
      delete variant.assets;
    });
  }

  if (result.component?.latestVersion) {
    delete result.component.latestVersion.assets;
  }

  return result;
}

/**
 * Downloads an asset from a URL and saves it to the specified local directory
 * @param assetUrl The URL of the asset to download
 * @param localDir The local directory path to save the asset
 * @returns Response with download status or error message
 */
export async function downloadAsset(assetUrl: string, localDir: string): Promise<ApiResponse<unknown>> {
  try {
    const url = new URL(assetUrl);
    const urlPath = url.pathname;
    const fileExtension = path.extname(urlPath) || ".png";
    const assetId = path.basename(urlPath, fileExtension);

    await fs.mkdir(localDir, { recursive: true });

    const fileName = assetId + fileExtension;
    const filePath = path.join(localDir, fileName);

    const response = await fetch(assetUrl);
    if (!response.ok) {
      return createErrorResponse(`Failed to download asset: Server responded with ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(buffer));

    return createResponse({
      message: `Asset successfully downloaded to ${filePath}`
    });
  } catch (error) {
    return createErrorResponse(`Failed to download asset: ${error instanceof Error ? error.message : String(error)}`);
  }
}
