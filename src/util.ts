import type { DesignTokens, Screen } from "@zeplin/sdk";
import type { UrlResolverResponse } from "./types.js";

/**
 * Preprocess a screen object to remove unnecessary information
 * @param screen The screen object to preprocess
 * @returns The processed screen object
 */
export function preProcessScreen(screen: Screen): Partial<Omit<Screen, "created" | "creator" | "thumbnails" | "id">> {
  return preProcess<Screen>(screen);
}

/**
 * Preprocess a design tokens object to remove metadata
 * @param designTokens The design tokens to preprocess
 * @returns The processed design tokens
 */
export function preProcessDesignTokens(designTokens: DesignTokens) {
  const processedTokens = preProcess(designTokens);
  return removeMetadata(processedTokens);
}

/**
 * Generic preprocessing function that removes unnecessary properties from objects
 * @param data The data to preprocess
 * @returns Processed data with unnecessary properties removed
 */
export function preProcess<T>(data: T): Partial<T> {
  if (Array.isArray(data)) {
    return data
      .map(item => preProcess(item))
      .filter(item => {
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      }) as unknown as Partial<T>;
  } else if (data !== null && typeof data === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Skip unnecessary properties
      if (key === "created") continue;
      if (key === "creator") continue;
      if (key === "thumbnails") continue;
      if (key === "id") continue;
      if (key === "opacity" && value === 1) continue;
      if (key === "blend_mode" && value === "normal") continue;
      if (key === "rotation" && value === 0) continue;

      let processedValue;
      if (key === "contents" && Array.isArray(value)) {
        const itemsToKeep = value.filter(originalContentItem => {
          if (originalContentItem && typeof originalContentItem === "object" && originalContentItem !== null && "density" in originalContentItem) {
            return (originalContentItem as { density?: number }).density === 1;
          }
          if (Array.isArray(originalContentItem) && originalContentItem.length === 0) {
            return false;
          }
          return true;
        });

        processedValue = itemsToKeep.map(keptItem => preProcess(keptItem))
          .filter(processedItem => {
            if (Array.isArray(processedItem) && processedItem.length === 0) {
              return false;
            }
            return true;
          });
      } else {
        processedValue = preProcess(value);
      }

      if (Array.isArray(processedValue) && processedValue.length === 0) {
        continue;
      }

      result[key] = processedValue;
    }

    return result as Partial<T>;
  } else {
    return data as Partial<T>;
  }
}

/**
 * Removes metadata from design tokens
 * @param obj Object containing design tokens
 * @returns Object with metadata removed
 */
function removeMetadata<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeMetadata) as unknown as T;
  } else if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "metadata") continue;
      result[key] = removeMetadata(value);
    }

    return result as unknown as T;
  } else {
    return obj;
  }
}

/**
 * Resolves a Zeplin shortlink to its full URL
 * @param url The URL or shortlink to resolve
 * @returns The resolved URL
 */
export async function resolveUrl(url: string): Promise<string> {
  if (!url.startsWith("https://zpl.io/")) {
    return url;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to resolve URL: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as UrlResolverResponse;
    return data.url;
  } catch (error) {
    throw new Error(`Failed to resolve URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}