import type { DesignTokens, Screen } from "@zeplin/sdk";

export async function resolveUrl(url: string): Promise<string> {
  if (!url.startsWith("https://zpl.io/")) {
    return url;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    },
  });

  const data: any = await response.json();
  return data.url;
}

type ProcessedScreen = Omit<Screen, "created" | "creator" | "thumbnails" | "id">;

export function preProcess<T>(data: T): Partial<T> {
  if (Array.isArray(data)) {
    return data
      .map(item => preProcess(item))
      .filter(item => {
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      }) as unknown as Partial<T>;
  } else if (data !== null && typeof data === "object") {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data as Record<string, any>)) {
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
            return (originalContentItem as { density?: any }).density === 1;
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

export function preProcessScreen(screen: Screen): Partial<ProcessedScreen> {
  return preProcess<Screen>(screen);
}

export function preProcessDesignTokens(designTokens: DesignTokens) {
  const processedTokens = preProcess(designTokens);

  function removeMetadata(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(removeMetadata);
    } else if (obj !== null && typeof obj === "object") {
      const result: Record<string, any> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (key === "metadata") continue;

        result[key] = removeMetadata(value);
      }

      return result;
    } else {
      return obj;
    }
  }

  return removeMetadata(processedTokens);
}