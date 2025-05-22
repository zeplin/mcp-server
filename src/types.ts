import type { Layer, Component } from "@zeplin/sdk";

/**
 * Response structure for API responses
 */
export interface ApiResponse<T> {
  content: ResponseContent[];
  isError?: boolean;
  [key: string]: unknown;
}

export interface ResponseContent {
  type: "text";
  text: string;
  [key: string]: unknown;
}

/**
 * Screen data structure
 */
export interface ScreenData {
  type: "Screen";
  name: string;
  variants: ScreenVariant[];
  designTokens?: any;
}

export interface ScreenVariant {
  name: string;
  annotations?: ScreenAnnotation[];
  layers: Layer[];
}

export interface ScreenAnnotation {
  type: string;
  text: string;
  position: {
    x: number;
    y: number;
  };
}

/**
 * Component data structure
 */
export interface ComponentData {
  component?: Component;
  name?: string;
  variants?: ComponentVariant[];
  designTokens?: any;
}

export interface ComponentVariant {
  name: string;
  props?: ComponentProperty[];
  layers?: Layer[];
}

export interface ComponentProperty {
  name: string;
  value: string;
}

/**
 * Asset lookup structure for caching
 */
export interface AssetRecord {
  displayName?: string;
  layerName?: string;
  contents: Array<{
    format: string;
    url: string;
  }>;
}

/**
 * URL resolver response
 */
export interface UrlResolverResponse {
  url: string;
}

/**
 * Asset download response
 */
export interface AssetDownloadResponse {
  content: ResponseContent[];
}

/**
 * Common response formatting options
 */
export interface ResponseOptions {
  isError?: boolean;
  message?: string;
  data?: any;
}

/**
 * Design tokens structure
 */
export interface DesignTokensData {
  designTokens: any;
}
