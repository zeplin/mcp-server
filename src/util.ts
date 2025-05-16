import type { Screen } from "@zeplin/sdk";

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

type ProcessedScreen = Omit<Screen, 'created' | 'creator' | 'thumbnails' | 'id'>;

export function preProcess<T>(data: T): Partial<T> {
  if (Array.isArray(data)) {
    return data
      .map(item => preProcess(item))
      .filter(item => {
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      }) as unknown as Partial<T>;
  } else if (data !== null && typeof data === 'object') {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (key === 'created') continue;
      if (key === 'creator') continue;
      if (key === 'thumbnails') continue;
      if (key === 'id') continue;
      if (key === 'opacity' && value === 1) continue;
      if (key === 'blend_mode' && value === 'normal') continue;
      if (key === 'rotation' && value === 0) continue;

      const processedValue = preProcess(value);

      if (Array.isArray(processedValue) && processedValue.length === 0) continue;

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