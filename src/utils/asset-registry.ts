import type { Asset } from "@zeplin/sdk";
import type { AssetRecord } from "../types.js";

/**
 * Registry for assets that can be looked up by layerSourceId
 */
class AssetRegistry {
  private assetRecords: Map<string, AssetRecord> = new Map();

  /**
   * Resets the asset registry
   */
  reset(): void {
    this.assetRecords.clear();
  }

  /**
   * Registers an asset in the registry
   * @param asset The asset to register
   */
  registerAsset(asset: Asset): void {
    if (!asset.layerSourceId || !asset.contents) {
      return;
    }

    const record: AssetRecord = {
      displayName: asset.displayName,
      layerName: asset.layerName,
      contents: asset.contents.map(content => ({
        format: content.format,
        url: content.url
      }))
    };

    this.assetRecords.set(asset.layerSourceId, record);
  }

  /**
   * Registers multiple assets in the registry
   * @param assets The assets to register
   */
  registerAssets(assets: Asset[]): void {
    assets.forEach(asset => this.registerAsset(asset));
  }

  /**
   * Gets an asset record by its layer source ID
   * @param layerSourceId The layer source ID
   * @returns The asset record or undefined if not found
   */
  getAssetRecord(layerSourceId: string): AssetRecord | undefined {
    return this.assetRecords.get(layerSourceId);
  }

  /**
   * Gets the URL for a specific format of an asset
   * @param layerSourceId The layer source ID
   * @param format The desired format
   * @returns The URL or undefined if not found
   */
  getAssetUrl(layerSourceId: string, format: string): string | undefined {
    const record = this.assetRecords.get(layerSourceId);
    if (!record) return undefined;

    const content = record.contents.find(c => c.format === format);
    return content?.url;
  }

  /**
   * Extracts asset information from component, screen, or variant data
   * @param data The data containing assets
   */
  extractAssetsFromData(data: any): void {
    if (!data) return;

    // Extract from variants
    if (Array.isArray(data.variants)) {
      data.variants.forEach((variant: any) => {
        if (variant.assets && Array.isArray(variant.assets)) {
          this.registerAssets(variant.assets.filter((asset: Asset) => asset.contents));
        }
      });
    }

    // Extract from component
    if (data.component?.latestVersion?.assets) {
      this.registerAssets(
        data.component.latestVersion.assets.filter((asset: Asset) => asset.contents)
      );
    }
  }
}

export const assetRegistry = new AssetRegistry();