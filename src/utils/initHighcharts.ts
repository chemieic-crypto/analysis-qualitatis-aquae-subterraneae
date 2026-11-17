import HighchartsRaw from "highcharts";

/**
 * Resolves the Highcharts core object accurately in ESM / Vite environments.
 */
export function resolveHighchartsCore(raw?: any): any {
  const candidate = raw || HighchartsRaw;
  if (!candidate) return null;
  if (candidate.SeriesRegistry) return candidate;
  if (candidate.default && candidate.default.SeriesRegistry) return candidate.default;
  if (candidate.chart) return candidate;
  if (candidate.default && candidate.default.chart) return candidate.default;
  return candidate.default || candidate;
}

export const HighchartsCore = resolveHighchartsCore(HighchartsRaw);

// Expose on window and globalThis immediately so UMD/CJS plugins (highcharts-3d, cylinder, heatmap, etc.) find Highcharts globally via _Highcharts or Highcharts
if (typeof window !== "undefined") {
  window.Highcharts = HighchartsCore;
  window._Highcharts = HighchartsCore;
}
if (typeof globalThis !== "undefined") {
  const g = globalThis as typeof globalThis & { Highcharts?: unknown; _Highcharts?: unknown };
  g.Highcharts = HighchartsCore;
  g._Highcharts = HighchartsCore;
}

/**
 * Safely loads and initializes Highcharts plugins dynamically so window.Highcharts is guaranteed to be set first.
 */
export async function loadHighchartsPlugin(pluginImporter: () => Promise<any>): Promise<any> {
  try {
    const mod = await pluginImporter();
    const plugin = mod?.default || mod;
    if (typeof plugin === "function") {
      plugin(HighchartsCore);
    }
    return plugin;
  } catch (err) {
    console.warn("Highcharts plugin load skipped:", err);
    return null;
  }
}

/**
 * Synchronously initializes a plugin if already imported, ensuring HighchartsCore is passed.
 */
export function safeInitPlugin(pluginModule: any, customCore?: any) {
  const targetCore = customCore || HighchartsCore;
  if (typeof window !== "undefined") {
    if (!window.Highcharts) window.Highcharts = targetCore;
    if (!window._Highcharts) window._Highcharts = targetCore;
  }
  if (typeof globalThis !== "undefined") {
    const g = globalThis as typeof globalThis & { Highcharts?: unknown; _Highcharts?: unknown };
    if (!g.Highcharts) g.Highcharts = targetCore;
    if (!g._Highcharts) g._Highcharts = targetCore;
  }
  if (!targetCore || (!targetCore.SeriesRegistry && !targetCore.chart)) {
    return;
  }
  try {
    const fn = typeof pluginModule === "function" ? pluginModule : pluginModule?.default;
    if (typeof fn === "function") {
      fn(targetCore);
    }
  } catch (err) {
    console.warn("Highcharts plugin sync init skipped:", err);
  }
}

export default HighchartsCore;
