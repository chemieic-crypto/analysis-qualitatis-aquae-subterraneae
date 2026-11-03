// Shared Line Color Templates and Diagram Themes for USSL, Piper, Chadha, and Gibbs Diagrams
export interface DiagramLineTheme {
  id: string;
  name: string;
  badge: string;
  description: string;
  primaryLine: string;       // Major boundaries, polygon perimeters, axes
  secondaryLine: string;     // Internal subdivisions, grid lines, tick marks
  gridDash: string;          // Stroke dasharray for secondary lines
  axisColor: string;         // Axis labels and tick values
  zoneTextColor: string;     // Text labels inside zones (e.g. C1-S1, Rock Dominance)
  zoneBgTint: string;        // Very subtle background tint if enabled
  badgeBg: string;           // Toolbar button background
  badgeText: string;         // Toolbar button text color
}

export const DIAGRAM_LINE_TEMPLATES: DiagramLineTheme[] = [
  {
    id: "monochrome",
    name: "Classic Monochrome",
    badge: "Mono",
    description: "Crisp black and charcoal engineering drafting lines",
    primaryLine: "#0f172a",
    secondaryLine: "#64748b",
    gridDash: "3,3",
    axisColor: "#0f172a",
    zoneTextColor: "#334155",
    zoneBgTint: "#f8fafc",
    badgeBg: "bg-slate-900",
    badgeText: "text-white"
  },
  {
    id: "cobalt",
    name: "Cobalt Blueprint",
    badge: "Cobalt",
    description: "Hydrogeological deep cobalt and royal blue drafting style",
    primaryLine: "#1d4ed8",
    secondaryLine: "#60a5fa",
    gridDash: "4,3",
    axisColor: "#1e3a8a",
    zoneTextColor: "#1d4ed8",
    zoneBgTint: "#eff6ff",
    badgeBg: "bg-blue-600",
    badgeText: "text-white"
  },
  {
    id: "indigo",
    name: "Technical Indigo",
    badge: "Indigo",
    description: "Modern crisp indigo and violet precision grid lines",
    primaryLine: "#4338ca",
    secondaryLine: "#818cf8",
    gridDash: "3,3",
    axisColor: "#312e81",
    zoneTextColor: "#4f46e5",
    zoneBgTint: "#eef2ff",
    badgeBg: "bg-indigo-600",
    badgeText: "text-white"
  },
  {
    id: "emerald",
    name: "Forest Emerald",
    badge: "Emerald",
    description: "Environmental green aquifer and ecological boundaries",
    primaryLine: "#047857",
    secondaryLine: "#34d399",
    gridDash: "4,4",
    axisColor: "#064e3b",
    zoneTextColor: "#059669",
    zoneBgTint: "#ecfdf5",
    badgeBg: "bg-emerald-600",
    badgeText: "text-white"
  },
  {
    id: "crimson",
    name: "Laboratory Crimson",
    badge: "Crimson",
    description: "High-visibility technical crimson and ruby boundaries",
    primaryLine: "#b91c1c",
    secondaryLine: "#f87171",
    gridDash: "3,3",
    axisColor: "#7f1d1d",
    zoneTextColor: "#dc2626",
    zoneBgTint: "#fef2f2",
    badgeBg: "bg-rose-600",
    badgeText: "text-white"
  },
  {
    id: "sepia",
    name: "Earth Bronze",
    badge: "Bronze",
    description: "Warm geological sepia and amber earth tones",
    primaryLine: "#92400e",
    secondaryLine: "#fbbf24",
    gridDash: "4,3",
    axisColor: "#78350f",
    zoneTextColor: "#b45309",
    zoneBgTint: "#fffbeb",
    badgeBg: "bg-amber-700",
    badgeText: "text-white"
  },
  {
    id: "slate",
    name: "High-Contrast Slate",
    badge: "Slate",
    description: "Clean dark neutral slate for publication and papers",
    primaryLine: "#334155",
    secondaryLine: "#94a3b8",
    gridDash: "2,2",
    axisColor: "#1e293b",
    zoneTextColor: "#475569",
    zoneBgTint: "#f1f5f9",
    badgeBg: "bg-slate-700",
    badgeText: "text-white"
  }
];

export const DEFAULT_DIAGRAM_TEMPLATE = DIAGRAM_LINE_TEMPLATES[0]!;

export interface TitleFormattingConfig {
  text: string;
  size: number;
  color: string;
  isBold: boolean;
  isItalic: boolean;
  fontFamily: string;
  alignment: "center" | "left" | "right";
}

export const DEFAULT_TITLE_CONFIG: TitleFormattingConfig = {
  text: "",
  size: 14,
  color: "#0f172a",
  isBold: true,
  isItalic: false,
  fontFamily: "'Inter', system-ui, sans-serif",
  alignment: "center"
};

// Page Orientation & A4 Standard Printing Facilities
export type DiagramPageOrientation = "fit" | "a4_portrait" | "a4_landscape";

export const PAGE_ORIENTATION_CONFIGS: Record<DiagramPageOrientation, {
  label: string;
  badge: string;
  ratio: number;
  widthMm: number;
  heightMm: number;
  printWidthPx: number;
  printHeightPx: number;
  description: string;
  className: string;
}> = {
  fit: {
    label: "Standard (Auto-Fit)",
    badge: "Fit",
    ratio: 1.25,
    widthMm: 0,
    heightMm: 0,
    printWidthPx: 1200,
    printHeightPx: 960,
    description: "Natural responsive canvas fitting container dimensions",
    className: "w-full max-w-full"
  },
  a4_portrait: {
    label: "A4 Sheet (Portrait)",
    badge: "A4 Port",
    ratio: 210 / 297,
    widthMm: 210,
    heightMm: 297,
    printWidthPx: 2480, // 300 DPI A4
    printHeightPx: 3508,
    description: "International standard A4 portrait publication format (210 × 297 mm)",
    className: "w-full max-w-[620px] aspect-[210/297] shadow-xl border-2 border-slate-300 mx-auto"
  },
  a4_landscape: {
    label: "A4 Sheet (Landscape)",
    badge: "A4 Land",
    ratio: 297 / 210,
    widthMm: 297,
    heightMm: 210,
    printWidthPx: 3508, // 300 DPI A4
    printHeightPx: 2480,
    description: "International standard A4 landscape publication format (297 × 210 mm)",
    className: "w-full max-w-[920px] aspect-[297/210] shadow-xl border-2 border-slate-300 mx-auto"
  }
};
