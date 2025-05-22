import type { Layer } from "@zeplin/sdk";

/**
 * Recursively searches for a component with the given name in the layer tree
 * and returns the layer, its parent, and path to the component
 * @param layers Array of layers to search through
 * @param targetLayerName Name of the component to find
 * @param parentLayer Optional parent layer reference
 * @param path Optional path to the current position in the tree
 * @returns Object containing found status, layer, parent layer, and path
 */
export function findTargetLayer(
  layers: Layer[],
  targetLayerName: string,
  parentLayer: Layer | null = null,
  path: Layer[] = []
): { found: boolean; layer: Layer | null; parentLayer: Layer | null; path: Layer[] } {
  if (!layers || !Array.isArray(layers)) {
    return { found: false, layer: null, parentLayer: null, path: [] };
  }

  for (const layer of layers) {
    if (layer.componentName === targetLayerName || layer.name === targetLayerName) {
      return { found: true, layer, parentLayer, path: [...path, layer] };
    }

    if (layer.layers && Array.isArray(layer.layers)) {
      const result = findTargetLayer(
        layer.layers,
        targetLayerName,
        layer,
        [...path, layer]
      );

      if (result.found) {
        return result;
      }
    }
  }

  return { found: false, layer: null, parentLayer: null, path: [] };
}

/**
 * Prunes layers data to only include the target component, its immediate parent, and all of its children.
 * @param layers The full layers array from a screen version.
 * @param targetLayerName The name of the layer/component to find and keep.
 * @returns Pruned layer array containing only relevant layers
 */
export function pruneLayersForTargetLayer(layers: Layer[], targetLayerName: string): Layer[] {
  if (!targetLayerName) {
    return layers;
  }

  if (!Array.isArray(layers)) {
    return [];
  }

  const { found, layer: targetLayer, parentLayer } = findTargetLayer(layers, targetLayerName);

  if (!found || !targetLayer) {
    return [];
  }

  if (parentLayer) {
    return [parentLayer];
  } else {
    return [targetLayer];
  }
}
