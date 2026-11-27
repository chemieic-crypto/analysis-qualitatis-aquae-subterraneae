export type GuiThemeId =
  | "royal-indigo"
  | "emerald-biosphere"
  | "ocean-aqua"
  | "sunset-amber"
  | "amethyst-violet"
  | "crimson-ruby"
  | "titanium-slate"
  | "obsidian-midnight";

export type GuiThemeMode = "per-gui" | "global";

export interface GuiThemeConfig {
  id: GuiThemeId;
  name: string;
  shortLabel: string;
  swatchHex: string;
  accentHex: string;
  accentSoftHex: string;
  accentBorderHex: string;
  bodyBg: string;
  headerBg: string;
  headerBorder: string;
  workspaceBg: string;
  workspaceBorder: string;
  topAccentGradient: string;
  // KPI / Panel Tailwind classes
  containerBg: string;
  headerBanner: string;
  headerAccentLine: string;
  cardHeader: string;
  footerBanner: string;
  mapWrapperBg: string;
  badgeClass: string;
  isDark: boolean;
}

export const GUI_THEMES: Record<GuiThemeId, GuiThemeConfig> = {
  "royal-indigo": {
    id: "royal-indigo",
    name: "Royal Indigo",
    shortLabel: "Indigo",
    swatchHex: "#312e81",
    accentHex: "#4338ca",
    accentSoftHex: "#eef2ff",
    accentBorderHex: "#c7d2fe",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #eef2ff 0%, transparent 45%), radial-gradient(circle at 88% 12%, #e0e7ff 0%, transparent 42%), radial-gradient(circle at 50% 92%, #f1f5f9 0%, transparent 55%), #f8fafc",
    headerBg: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)",
    headerBorder: "rgba(129, 140, 248, 0.35)",
    workspaceBg: "rgba(255, 255, 255, 0.90)",
    workspaceBorder: "rgba(165, 180, 252, 0.72)",
    topAccentGradient: "linear-gradient(90deg, #1e1b4b 0%, #4338ca 50%, #6366f1 100%)",
    containerBg: "bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100",
    headerBanner: "bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#312e81]",
    headerAccentLine: "via-indigo-400",
    cardHeader: "bg-gradient-to-r from-[#1e1b4b] to-[#3730a3]",
    footerBanner: "bg-[#0f172a]",
    mapWrapperBg: "bg-white border-indigo-200/80",
    badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
    isDark: false,
  },
  "emerald-biosphere": {
    id: "emerald-biosphere",
    name: "Emerald Biosphere",
    shortLabel: "Emerald",
    swatchHex: "#065f46",
    accentHex: "#047857",
    accentSoftHex: "#ecfdf5",
    accentBorderHex: "#a7f3d0",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #ecfdf5 0%, transparent 45%), radial-gradient(circle at 88% 12%, #d1fae5 0%, transparent 42%), radial-gradient(circle at 50% 92%, #f0fdfa 0%, transparent 55%), #f6fef9",
    headerBg: "linear-gradient(135deg, #022c22 0%, #064e3b 50%, #047857 100%)",
    headerBorder: "rgba(52, 211, 153, 0.35)",
    workspaceBg: "rgba(255, 255, 255, 0.90)",
    workspaceBorder: "rgba(110, 231, 183, 0.72)",
    topAccentGradient: "linear-gradient(90deg, #064e3b 0%, #059669 50%, #10b981 100%)",
    containerBg: "bg-gradient-to-br from-emerald-50/50 via-teal-50/30 to-slate-50",
    headerBanner: "bg-gradient-to-r from-[#022c22] via-[#064e3b] to-[#047857]",
    headerAccentLine: "via-emerald-400",
    cardHeader: "bg-gradient-to-r from-[#064e3b] to-[#059669]",
    footerBanner: "bg-[#022c22]",
    mapWrapperBg: "bg-white border-emerald-200/80",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    isDark: false,
  },
  "ocean-aqua": {
    id: "ocean-aqua",
    name: "Ocean Aqua",
    shortLabel: "Ocean",
    swatchHex: "#0369a1",
    accentHex: "#0284c7",
    accentSoftHex: "#f0f9ff",
    accentBorderHex: "#bae6fd",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #e0f2fe 0%, transparent 46%), radial-gradient(circle at 88% 12%, #cffafe 0%, transparent 42%), radial-gradient(circle at 50% 92%, #f0f9ff 0%, transparent 55%), #f4f9fc",
    headerBg: "linear-gradient(135deg, #082f49 0%, #0c4a6e 50%, #0369a1 100%)",
    headerBorder: "rgba(56, 189, 248, 0.38)",
    workspaceBg: "rgba(255, 255, 255, 0.90)",
    workspaceBorder: "rgba(125, 211, 252, 0.75)",
    topAccentGradient: "linear-gradient(90deg, #0c4a6e 0%, #0284c7 50%, #06b6d4 100%)",
    containerBg: "bg-gradient-to-br from-sky-50/60 via-cyan-50/30 to-slate-50",
    headerBanner: "bg-gradient-to-r from-[#082f49] via-[#0c4a6e] to-[#0369a1]",
    headerAccentLine: "via-cyan-400",
    cardHeader: "bg-gradient-to-r from-[#0c4a6e] to-[#0284c7]",
    footerBanner: "bg-[#082f49]",
    mapWrapperBg: "bg-white border-sky-200/80",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
    isDark: false,
  },
  "sunset-amber": {
    id: "sunset-amber",
    name: "Sunset Amber",
    shortLabel: "Amber",
    swatchHex: "#b45309",
    accentHex: "#d97706",
    accentSoftHex: "#fffbeb",
    accentBorderHex: "#fde68a",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #fef3c7 0%, transparent 45%), radial-gradient(circle at 88% 12%, #ffedd5 0%, transparent 42%), radial-gradient(circle at 50% 92%, #fff7ed 0%, transparent 55%), #fffdf7",
    headerBg: "linear-gradient(135deg, #451a03 0%, #78350f 50%, #b45309 100%)",
    headerBorder: "rgba(251, 191, 36, 0.38)",
    workspaceBg: "rgba(255, 255, 255, 0.91)",
    workspaceBorder: "rgba(252, 211, 77, 0.75)",
    topAccentGradient: "linear-gradient(90deg, #78350f 0%, #d97706 50%, #f59e0b 100%)",
    containerBg: "bg-gradient-to-br from-amber-50/60 via-orange-50/30 to-slate-50",
    headerBanner: "bg-gradient-to-r from-[#451a03] via-[#78350f] to-[#b45309]",
    headerAccentLine: "via-amber-400",
    cardHeader: "bg-gradient-to-r from-[#78350f] to-[#d97706]",
    footerBanner: "bg-[#451a03]",
    mapWrapperBg: "bg-white border-amber-200/80",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    isDark: false,
  },
  "amethyst-violet": {
    id: "amethyst-violet",
    name: "Amethyst Violet",
    shortLabel: "Violet",
    swatchHex: "#6d28d9",
    accentHex: "#7c3aed",
    accentSoftHex: "#f5f3ff",
    accentBorderHex: "#ddd6fe",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #f3e8ff 0%, transparent 45%), radial-gradient(circle at 88% 12%, #ede9fe 0%, transparent 42%), radial-gradient(circle at 50% 92%, #faf5ff 0%, transparent 55%), #fbfaff",
    headerBg: "linear-gradient(135deg, #2e1065 0%, #4c1d95 50%, #6d28d9 100%)",
    headerBorder: "rgba(196, 181, 253, 0.38)",
    workspaceBg: "rgba(255, 255, 255, 0.90)",
    workspaceBorder: "rgba(196, 181, 253, 0.75)",
    topAccentGradient: "linear-gradient(90deg, #4c1d95 0%, #7c3aed 50%, #a855f7 100%)",
    containerBg: "bg-gradient-to-br from-violet-50/60 via-purple-50/30 to-slate-50",
    headerBanner: "bg-gradient-to-r from-[#2e1065] via-[#4c1d95] to-[#6d28d9]",
    headerAccentLine: "via-violet-400",
    cardHeader: "bg-gradient-to-r from-[#4c1d95] to-[#7c3aed]",
    footerBanner: "bg-[#2e1065]",
    mapWrapperBg: "bg-white border-violet-200/80",
    badgeClass: "bg-violet-100 text-violet-800 border-violet-200",
    isDark: false,
  },
  "crimson-ruby": {
    id: "crimson-ruby",
    name: "Crimson Ruby",
    shortLabel: "Crimson",
    swatchHex: "#9f1239",
    accentHex: "#be123c",
    accentSoftHex: "#fff1f2",
    accentBorderHex: "#fecdd3",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #ffe4e6 0%, transparent 45%), radial-gradient(circle at 88% 12%, #fce7f3 0%, transparent 42%), radial-gradient(circle at 50% 92%, #fff1f2 0%, transparent 55%), #fffafb",
    headerBg: "linear-gradient(135deg, #4c0519 0%, #881337 50%, #be123c 100%)",
    headerBorder: "rgba(251, 113, 133, 0.38)",
    workspaceBg: "rgba(255, 255, 255, 0.90)",
    workspaceBorder: "rgba(253, 164, 175, 0.75)",
    topAccentGradient: "linear-gradient(90deg, #881337 0%, #be123c 50%, #f43f5e 100%)",
    containerBg: "bg-gradient-to-br from-rose-50/60 via-red-50/25 to-slate-50",
    headerBanner: "bg-gradient-to-r from-[#4c0519] via-[#881337] to-[#be123c]",
    headerAccentLine: "via-rose-400",
    cardHeader: "bg-gradient-to-r from-[#881337] to-[#be123c]",
    footerBanner: "bg-[#4c0519]",
    mapWrapperBg: "bg-white border-rose-200/80",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
    isDark: false,
  },
  "titanium-slate": {
    id: "titanium-slate",
    name: "Titanium Slate",
    shortLabel: "Slate",
    swatchHex: "#334155",
    accentHex: "#475569",
    accentSoftHex: "#f1f5f9",
    accentBorderHex: "#cbd5e1",
    bodyBg:
      "radial-gradient(circle at 12% 14%, #e2e8f0 0%, transparent 46%), radial-gradient(circle at 88% 12%, #f1f5f9 0%, transparent 42%), radial-gradient(circle at 50% 92%, #e2e8f0 0%, transparent 55%), #f8fafc",
    headerBg: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
    headerBorder: "rgba(148, 163, 184, 0.38)",
    workspaceBg: "rgba(255, 255, 255, 0.92)",
    workspaceBorder: "rgba(148, 163, 184, 0.72)",
    topAccentGradient: "linear-gradient(90deg, #0f172a 0%, #334155 50%, #64748b 100%)",
    containerBg: "bg-gradient-to-br from-slate-100/80 via-zinc-50 to-slate-100/60",
    headerBanner: "bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#334155]",
    headerAccentLine: "via-slate-400",
    cardHeader: "bg-gradient-to-r from-[#1e293b] to-[#475569]",
    footerBanner: "bg-[#0f172a]",
    mapWrapperBg: "bg-white border-slate-300",
    badgeClass: "bg-slate-200 text-slate-800 border-slate-300",
    isDark: false,
  },
  "obsidian-midnight": {
    id: "obsidian-midnight",
    name: "Obsidian Midnight",
    shortLabel: "Obsidian",
    swatchHex: "#0f172a",
    accentHex: "#38bdf8",
    accentSoftHex: "#e0f2fe",
    accentBorderHex: "#7dd3fc",
    bodyBg:
      "radial-gradient(circle at 14% 12%, #1e293b 0%, transparent 45%), radial-gradient(circle at 86% 14%, #0f172a 0%, transparent 45%), #0b1120",
    headerBg: "linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)",
    headerBorder: "rgba(56, 189, 248, 0.42)",
    workspaceBg: "rgba(248, 250, 252, 0.96)",
    workspaceBorder: "rgba(56, 189, 248, 0.55)",
    topAccentGradient: "linear-gradient(90deg, #020617 0%, #0284c7 50%, #38bdf8 100%)",
    containerBg: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900",
    headerBanner: "bg-gradient-to-r from-[#020617] via-[#0f172a] to-[#1e293b]",
    headerAccentLine: "via-sky-400",
    cardHeader: "bg-gradient-to-r from-[#0f172a] to-[#1e293b]",
    footerBanner: "bg-[#020617]",
    mapWrapperBg: "bg-slate-800/90 border-slate-700",
    badgeClass: "bg-slate-800 text-sky-300 border-slate-700",
    isDark: true,
  },
};

export const GUI_THEME_LIST: GuiThemeConfig[] = Object.values(GUI_THEMES);

/**
 * Distinct default color-coding theme for every GUI tab so each analytical workspace
 * has its own clear visual identity out of the box (and can still be customized per-GUI
 * or locked globally).
 */
export const DEFAULT_TAB_THEMES: Record<string, GuiThemeId> = {
  kpi: "royal-indigo",
  factSheet: "emerald-biosphere",
  single: "ocean-aqua",
  advancedAnalysis: "amethyst-violet",
  ranking: "sunset-amber",
  ussl: "emerald-biosphere",
  combination: "amethyst-violet",
  pca: "amethyst-violet",
  hydrochemistry: "ocean-aqua",
  calculatorius: "titanium-slate",
  gis: "ocean-aqua",
  shapefileFilter: "emerald-biosphere",
  hydromerge: "titanium-slate",
  sector: "royal-indigo",
  hotspot: "crimson-ruby",
  master: "royal-indigo",
  monsoon: "ocean-aqua",
  bar: "titanium-slate",
  aisummary: "amethyst-violet",
  bulletin: "sunset-amber",
  fortnightly: "crimson-ruby",
  limits: "crimson-ruby",
};

export const GUI_TAB_LABELS: Record<string, string> = {
  kpi: "KPI Section",
  factSheet: "Fact Sheet",
  single: "Detailed Parameter",
  advancedAnalysis: "Advanced Analysis",
  ranking: "Ranking & Stats",
  ussl: "USSL / Piper",
  combination: "Combination Analysis",
  pca: "PCA Analysis",
  hydrochemistry: "Hydrochemistry",
  calculatorius: "Calculatorius",
  gis: "GIS Map",
  shapefileFilter: "Shapefile Filter",
  hydromerge: "HydroMerge",
  sector: "Sector Analysis",
  hotspot: "Hotspot Plume",
  master: "Master Summary",
  monsoon: "Monsoon Impact",
  bar: "Comparisons",
  aisummary: "Pamphlet & Summary",
  bulletin: "Bulletin",
  fortnightly: "Fortnightly Alerts",
  limits: "BIS Limits Manager",
};

const STORAGE_MODE_KEY = "cgwb_gui_theme_mode_v1";
const STORAGE_GLOBAL_KEY = "cgwb_gui_theme_global_v1";
const STORAGE_TAB_MAP_KEY = "cgwb_gui_theme_per_tab_v1";
const LEGACY_KPI_KEY = "kpi_gui_theme";

export function normalizeGuiThemeId(raw: string | null | undefined, fallback: GuiThemeId = "royal-indigo"): GuiThemeId {
  if (!raw) return fallback;
  if (raw === "obsidian-dark") return "obsidian-midnight";
  if (raw === "crimson-amber") return "sunset-amber";
  if (raw in GUI_THEMES) return raw as GuiThemeId;
  return fallback;
}

export function resolveActiveGuiTheme(
  activeTab: string,
  mode: GuiThemeMode,
  globalTheme: GuiThemeId,
  tabThemeOverrides: Partial<Record<string, GuiThemeId>>
): GuiThemeConfig {
  if (mode === "global") {
    return GUI_THEMES[normalizeGuiThemeId(globalTheme, "royal-indigo")];
  }
  const override = tabThemeOverrides[activeTab];
  if (override) {
    return GUI_THEMES[normalizeGuiThemeId(override, "royal-indigo")];
  }
  const defaultId = DEFAULT_TAB_THEMES[activeTab] || "royal-indigo";
  return GUI_THEMES[defaultId];
}

export interface PersistedGuiThemeState {
  mode: GuiThemeMode;
  globalTheme: GuiThemeId;
  tabThemes: Partial<Record<string, GuiThemeId>>;
}

export function loadGuiThemeState(): PersistedGuiThemeState {
  const fallback: PersistedGuiThemeState = {
    mode: "per-gui",
    globalTheme: "royal-indigo",
    tabThemes: {},
  };
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const rawMode = window.localStorage.getItem(STORAGE_MODE_KEY);
    const mode: GuiThemeMode = rawMode === "global" ? "global" : "per-gui";
    const globalTheme = normalizeGuiThemeId(window.localStorage.getItem(STORAGE_GLOBAL_KEY), "royal-indigo");
    const rawMap = window.localStorage.getItem(STORAGE_TAB_MAP_KEY);
    const tabThemes: Partial<Record<string, GuiThemeId>> = {};
    if (rawMap) {
      const parsed = JSON.parse(rawMap) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          tabThemes[k] = normalizeGuiThemeId(v);
        }
      }
    }
    // Migrate legacy KPI theme if user had set it previously and no explicit kpi override exists yet
    const legacyKpi = window.localStorage.getItem(LEGACY_KPI_KEY);
    if (legacyKpi && !tabThemes.kpi) {
      tabThemes.kpi = normalizeGuiThemeId(legacyKpi, "royal-indigo");
    }
    return { mode, globalTheme, tabThemes };
  } catch {
    return fallback;
  }
}

export function saveGuiThemeState(state: PersistedGuiThemeState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_MODE_KEY, state.mode);
    window.localStorage.setItem(STORAGE_GLOBAL_KEY, state.globalTheme);
    window.localStorage.setItem(STORAGE_TAB_MAP_KEY, JSON.stringify(state.tabThemes));
    const kpiEffective = resolveActiveGuiTheme("kpi", state.mode, state.globalTheme, state.tabThemes).id;
    window.localStorage.setItem(LEGACY_KPI_KEY, kpiEffective);
  } catch {
    // ignore storage quota / privacy mode errors
  }
}
