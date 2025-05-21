import * as path from "path";
import * as fs from "fs/promises";
import fetch from "node-fetch";
import type { Asset } from "@zeplin/sdk";
import { createErrorResponse, createResponse } from "./response-utils.js";
import type { ApiResponse } from "../types.js";

/**
 * Finds an asset by its source ID
 * @param sourceId The source ID to search for
 * @param assets The collection of assets to search in
 * @returns The matching asset or undefined if not found
 */
export function findAssetById(sourceId: string, assets: Asset[]): Asset | undefined {
  return assets.find(asset => asset.layerSourceId === sourceId);
}

/**
 * Finds a downloadable asset URL for the specified format
 * @param asset The asset to get the URL from
 * @param format The desired file format
 * @returns The URL or undefined if not available
 */
export function getAssetUrl(asset: Asset, format: string): string | undefined {
  return asset.contents?.find(content => content.format === format)?.url;
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