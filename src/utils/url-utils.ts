import type { UrlResolverResponse } from "../types.js";

/**
 * URL patterns for different Zeplin resource types
 */
export const URL_PATTERNS = {
  COMPONENT: /^https:\/\/app\.zeplin\.io\/styleguide\/([^/]+)\/component\/([^/]+)/,
  PROJECT_STYLEGUIDE_COMPONENT: /^https:\/\/app\.zeplin\.io\/project\/([^/]+)\/styleguide\/component\/([^/]+)/,
  SCREEN: /^https:\/\/app\.zeplin\.io\/project\/([^/]+)\/screen\/([^/]+)/
};

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
