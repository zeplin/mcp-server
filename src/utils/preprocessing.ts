import type { DesignTokens, Screen } from "@zeplin/sdk";

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

    // Skip unnecessary properties
    const propsToSkip = new Set(["created", "creator", "thumbnails", "id"]);
    const defaultValues = new Map<string, unknown>([
      ["opacity", 1],
      ["blend_mode", "normal"],
      ["rotation", 0]
    ]);

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (propsToSkip.has(key)) continue;
      if (defaultValues.has(key) && defaultValues.get(key) === value) continue;

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
