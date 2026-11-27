/**
 * Cartographic Map Scale & Scale Bar Calculation Helpers
 * Supports exact Representative Fraction (1 : N) scale locking and customizable
 * ArcGIS / MapInfo style graphic scale bars for Canvas rendering, drag hit-testing, and SVG export.
 */

export type ScaleBarUnit = "km" | "m" | "mi" | "dual";
export type ScaleBarStyle = "alternating" | "double-line" | "line" | "boxed";
export type ScaleBarPos =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "top-left"
  | "top-right";

export interface ScaleBarSettings {
  unit: ScaleBarUnit;
  style: ScaleBarStyle;
  mode: "auto" | "custom";
  customLength: number;
  divisions: 2 | 4 | 5;
  showRf: boolean;
  fontSize: number;
  barHeight: number;
  color: string;
  showBox: boolean;
  pos: ScaleBarPos;
  offsetX: number;
  offsetY: number;
}

export interface ScaleBarTick {
  frac: number;
  label: string;
}

export interface ScaleBarSpec {
  totalValue: number;
  unitLabel: string;
  barWidthPx: number;
  divisions: 2 | 4 | 5;
  ticks: ScaleBarTick[];
  secondary?: {
    totalValue: number;
    unitLabel: string;
    barWidthPx: number;
    ticks: ScaleBarTick[];
  };
  rfDenominator: number;
  rfLabel: string;
  /** Anchor coordinates & outer box in unscaled canvas px (scale = 1) */
  barX: number;
  barY: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
}

export const MAP_SCALE_PRESETS: number[] = [
  25_000,
  50_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
  2_500_000,
  5_000_000,
  10_000_000,
  25_000_000
];

const METERS_PER_DEGREE_LAT = 111_320;
const METERS_PER_MILE = 1609.344;
const METERS_PER_INCH = 0.0254;

const NICE_DISTANCES = [
  1, 2, 5, 10, 20, 25, 40, 50, 100, 200, 250, 500,
  1_000, 2_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000
];

/**
 * Computes the current Representative Fraction denominator (1 : N) for a map panel.
 */
export function computeCurrentMapScaleRF(
  finalLngSpan: number,
  centerLat: number,
  mapWidthPx: number,
  screenDpi: number = 96
): number {
  const safeSpan = Math.max(1e-6, finalLngSpan);
  const safeWidthPx = Math.max(1, mapWidthPx);
  const cosLat = Math.max(0.15, Math.cos((centerLat * Math.PI) / 180));
  const groundWidthMeters = safeSpan * METERS_PER_DEGREE_LAT * cosLat;
  const paperWidthMeters = (safeWidthPx / screenDpi) * METERS_PER_INCH;
  const rawRf = groundWidthMeters / Math.max(1e-9, paperWidthMeters);
  return Math.max(100, Math.round(rawRf));
}

/**
 * Computes the zoomScaleFactor required to render the map at a target Representative Fraction (1 : targetDenominator).
 */
export function computeZoomFactorForTargetScale(
  targetScaleDenominator: number,
  baseLngSpanAtZoom1: number,
  centerLat: number,
  mapWidthPx: number,
  screenDpi: number = 96
): number {
  const safeTarget = Math.max(500, Math.min(200_000_000, targetScaleDenominator));
  const safeBaseSpan = Math.max(1e-6, baseLngSpanAtZoom1);
  const cosLat = Math.max(0.15, Math.cos((centerLat * Math.PI) / 180));
  const paperWidthMeters = (Math.max(1, mapWidthPx) / screenDpi) * METERS_PER_INCH;
  const desiredGroundMeters = safeTarget * paperWidthMeters;
  const desiredLngSpan = desiredGroundMeters / (METERS_PER_DEGREE_LAT * cosLat);
  const nextZoom = desiredLngSpan / safeBaseSpan;
  return Math.max(0.002, Math.min(50, nextZoom));
}

/**
 * Formats a Representative Fraction denominator nicely (e.g., 1 : 2,500,000).
 */
export function formatScaleRF(denominator: number): string {
  const rounded = Math.max(100, Math.round(denominator));
  return `1 : ${rounded.toLocaleString("en-US")}`;
}

function pickNiceDistance(rawTarget: number): number {
  if (!Number.isFinite(rawTarget) || rawTarget <= 0) return 10;
  return NICE_DISTANCES.reduce((prev, curr) =>
    Math.abs(curr - rawTarget) < Math.abs(prev - rawTarget) ? curr : prev
  );
}

function formatTickValue(val: number): string {
  if (Math.abs(val - Math.round(val)) < 1e-6) {
    return Math.round(val).toLocaleString("en-US");
  }
  if (val < 10) return Number(val.toFixed(2)).toString();
  return Number(val.toFixed(1)).toString();
}

function buildTicks(totalValue: number, divisions: 2 | 4 | 5, unitLabel: string): ScaleBarTick[] {
  const ticks: ScaleBarTick[] = [];
  for (let i = 0; i <= divisions; i++) {
    const frac = i / divisions;
    const val = totalValue * frac;
    const isLast = i === divisions;
    // Keep intermediate labels uncluttered when divisions === 4 or 5
    const includeLabel =
      i === 0 ||
      isLast ||
      (divisions === 2 && i === 1) ||
      (divisions === 4 && (i === 1 || i === 2)) ||
      (divisions === 5 && i === 1);
    if (includeLabel) {
      ticks.push({
        frac,
        label: isLast ? `${formatTickValue(val)} ${unitLabel}` : formatTickValue(val)
      });
    }
  }
  return ticks;
}

/**
 * Computes complete cartographic scale bar layout (bar geometry, ticks, optional dual bar,
 * RF label, and outer container box) in unscaled canvas logical pixels (scale = 1).
 */
export function computeScaleBarSpec(params: {
  finalLngSpan: number;
  centerLat: number;
  canvasW: number;
  canvasH: number;
  margin: number;
  settings: ScaleBarSettings;
}): ScaleBarSpec {
  const { finalLngSpan, centerLat, canvasW, canvasH, margin, settings } = params;
  const mw = Math.max(80, canvasW - 2 * margin);
  const cosLat = Math.max(0.15, Math.cos((centerLat * Math.PI) / 180));
  const widthMeters = Math.max(1, finalLngSpan * METERS_PER_DEGREE_LAT * cosLat);
  const pxPerMeter = mw / widthMeters;

  const rfDenominator = computeCurrentMapScaleRF(finalLngSpan, centerLat, mw);
  const rfLabel = formatScaleRF(rfDenominator);

  const primaryUnit: "km" | "m" | "mi" = settings.unit === "dual" ? "km" : settings.unit;
  const metersPerPrimaryUnit =
    primaryUnit === "m" ? 1 : primaryUnit === "mi" ? METERS_PER_MILE : 1000;
  const pxPerPrimaryUnit = pxPerMeter * metersPerPrimaryUnit;

  const maxAllowedBarPx = Math.max(60, mw * 0.58);
  const minAllowedBarPx = 42;
  const targetAutoBarPx = Math.min(135, mw * 0.28);

  let totalValue: number;
  if (settings.mode === "custom" && Number.isFinite(settings.customLength) && settings.customLength > 0) {
    totalValue = settings.customLength;
    const rawW = totalValue * pxPerPrimaryUnit;
    if (rawW > maxAllowedBarPx) {
      // Clamp visual width softly while preserving custom label if extremely huge? Better: clamp bar width to maxAllowedBarPx only if absurd (> 85% mw)
      // Actually if user chooses custom scale length on current extent, keep true ground proportion unless it breaks canvas bounds.
    }
  } else {
    const rawDist = targetAutoBarPx / Math.max(1e-9, pxPerPrimaryUnit);
    totalValue = pickNiceDistance(rawDist);
  }

  let barWidthPx = totalValue * pxPerPrimaryUnit;
  // Guard against degenerate or wildly overflowing custom lengths
  if (!Number.isFinite(barWidthPx) || barWidthPx < minAllowedBarPx) {
    if (settings.mode === "auto") {
      totalValue = pickNiceDistance(minAllowedBarPx / Math.max(1e-9, pxPerPrimaryUnit));
      barWidthPx = Math.max(minAllowedBarPx, totalValue * pxPerPrimaryUnit);
    } else {
      barWidthPx = Math.max(minAllowedBarPx, barWidthPx || minAllowedBarPx);
    }
  }
  if (barWidthPx > maxAllowedBarPx) {
    if (settings.mode === "auto") {
      totalValue = pickNiceDistance((maxAllowedBarPx * 0.65) / Math.max(1e-9, pxPerPrimaryUnit));
      barWidthPx = Math.min(maxAllowedBarPx, Math.max(minAllowedBarPx, totalValue * pxPerPrimaryUnit));
    } else {
      barWidthPx = maxAllowedBarPx;
    }
  }

  const unitLabel = primaryUnit;
  const ticks = buildTicks(totalValue, settings.divisions, unitLabel);

  // Dual scale bar (secondary Miles bar underneath Kilometers)
  let secondary: ScaleBarSpec["secondary"];
  if (settings.unit === "dual") {
    const pxPerMile = pxPerMeter * METERS_PER_MILE;
    const rawMiles = barWidthPx / Math.max(1e-9, pxPerMile);
    const totalMiles = pickNiceDistance(rawMiles);
    const secWidthPx = Math.min(maxAllowedBarPx, Math.max(minAllowedBarPx, totalMiles * pxPerMile));
    secondary = {
      totalValue: totalMiles,
      unitLabel: "mi",
      barWidthPx: secWidthPx,
      ticks: buildTicks(totalMiles, settings.divisions, "mi")
    };
  }

  const maxBarW = Math.max(barWidthPx, secondary?.barWidthPx ?? 0);
  const fontSize = Math.max(6, Math.min(14, settings.fontSize || 8));
  const barHeight = Math.max(3, Math.min(12, settings.barHeight || 5));

  const padX = 12;
  const padTop = settings.showRf ? fontSize + 10 : 7;
  const primarySectionH = barHeight + fontSize + 6;
  const secondarySectionH = secondary ? barHeight + fontSize + 10 : 0;
  const padBottom = 6;

  // Extra right-side room so the final tick label (e.g. "100 km") never clips outside the box
  const rightLabelRoom = Math.max(22, fontSize * 3.1);
  const boxW = Math.max(maxBarW + padX * 2 + rightLabelRoom, settings.showRf ? fontSize * 14 : 90);
  const boxH = padTop + primarySectionH + secondarySectionH + padBottom;

  // Anchor calculation
  let anchorBoxX = margin + 10;
  let anchorBoxY = canvasH - margin - boxH - 10;
  if (settings.pos === "bottom-center") {
    anchorBoxX = (canvasW - boxW) / 2;
    anchorBoxY = canvasH - margin - boxH - 10;
  } else if (settings.pos === "bottom-right") {
    anchorBoxX = canvasW - margin - boxW - 10;
    anchorBoxY = canvasH - margin - boxH - 10;
  } else if (settings.pos === "top-left") {
    anchorBoxX = margin + 10;
    anchorBoxY = margin + 10;
  } else if (settings.pos === "top-right") {
    anchorBoxX = canvasW - margin - boxW - 10;
    anchorBoxY = margin + 10;
  }

  const boxX = anchorBoxX + settings.offsetX;
  const boxY = anchorBoxY + settings.offsetY;
  const barX = boxX + padX;
  const barY = boxY + padTop;

  return {
    totalValue,
    unitLabel,
    barWidthPx,
    divisions: settings.divisions,
    ticks,
    secondary,
    rfDenominator,
    rfLabel,
    barX,
    barY,
    boxX,
    boxY,
    boxW,
    boxH
  };
}
