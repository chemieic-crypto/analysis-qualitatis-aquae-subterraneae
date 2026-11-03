import React from "react";

export type PointSymbol =
  | "circle"
  | "triangle"
  | "square"
  | "diamond"
  | "star"
  | "invTriangle"
  | "hexagon"
  | "cross";

export interface PointSymbolInfo {
  id: PointSymbol;
  label: string;
  description: string;
}

export const AVAILABLE_POINT_SYMBOLS: PointSymbolInfo[] = [
  { id: "circle", label: "Circle", description: "Classic rounded point" },
  { id: "triangle", label: "Triangle", description: "Equilateral upward triangle" },
  { id: "square", label: "Square", description: "Solid square box" },
  { id: "diamond", label: "Diamond", description: "Rhombus diamond marker" },
  { id: "star", label: "Star", description: "5-pointed star marker" },
  { id: "invTriangle", label: "Inv Triangle", description: "Downward inverted triangle" },
  { id: "hexagon", label: "Hexagon", description: "6-sided polygon marker" },
  { id: "cross", label: "Cross (+)", description: "Plus symbol marker" },
];

export const SYMBOL_SEQUENCE: PointSymbol[] = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "star",
  "invTriangle",
  "hexagon",
  "cross",
];

export function getDistinctSymbol(index: number): PointSymbol {
  return SYMBOL_SEQUENCE[Math.abs(index) % SYMBOL_SEQUENCE.length]!;
}

// Generate star path centered at cx, cy
function getStarPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

// Generate hexagon points centered at cx, cy
function getHexagonPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

// Generate cross (+) path centered at cx, cy
function getCrossPath(cx: number, cy: number, arm: number, w: number): string {
  // 12-point plus sign
  const halfW = w / 2;
  return `M ${cx - halfW} ${cy - arm} 
          L ${cx + halfW} ${cy - arm} 
          L ${cx + halfW} ${cy - halfW} 
          L ${cx + arm} ${cy - halfW} 
          L ${cx + arm} ${cy + halfW} 
          L ${cx + halfW} ${cy + halfW} 
          L ${cx + halfW} ${cy + arm} 
          L ${cx - halfW} ${cy + arm} 
          L ${cx - halfW} ${cy + halfW} 
          L ${cx - arm} ${cy + halfW} 
          L ${cx - arm} ${cy - halfW} 
          L ${cx - halfW} ${cy - halfW} Z`;
}

interface PointSymbolShapeProps {
  cx: number;
  cy: number;
  r: number;
  symbol?: PointSymbol;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  className?: string;
  title?: string;
  is3d?: boolean;
}

export const PointSymbolShape: React.FC<PointSymbolShapeProps> = ({
  cx,
  cy,
  r,
  symbol = "circle",
  fill,
  stroke = "rgba(255,255,255,0.7)",
  strokeWidth = 0.25,
  opacity = 0.92,
  className,
  title,
  is3d = false,
}) => {
  const effectiveR = Math.max(0.4, r);

  let shapeElement: React.ReactNode = null;
  let highlightElement: React.ReactNode = null;

  switch (symbol) {
    case "square": {
      const half = effectiveR * 0.88;
      const size = half * 2;
      shapeElement = (
        <rect
          x={cx - half}
          y={cy - half}
          width={size}
          height={size}
          rx={Math.max(0.2, effectiveR * 0.18)}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.6)" : stroke}
          strokeWidth={strokeWidth}
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <g pointerEvents="none">
            {/* Top-left inner bevel highlight */}
            <path
              d={`M ${cx - half + 0.3} ${cy + half - 0.3} L ${cx - half + 0.3} ${cy - half + 0.3} L ${cx + half - 0.3} ${cy - half + 0.3}`}
              stroke="#ffffff"
              strokeWidth={Math.max(0.3, effectiveR * 0.28)}
              strokeLinecap="round"
              strokeOpacity={0.65}
              fill="none"
            />
            {/* Bottom-right inner shadow */}
            <path
              d={`M ${cx + half - 0.3} ${cy - half + 0.3} L ${cx + half - 0.3} ${cy + half - 0.3} L ${cx - half + 0.3} ${cy + half - 0.3}`}
              stroke="#000000"
              strokeWidth={Math.max(0.3, effectiveR * 0.22)}
              strokeLinecap="round"
              strokeOpacity={0.35}
              fill="none"
            />
          </g>
        );
      }
      break;
    }

    case "triangle": {
      const topY = cy - effectiveR * 1.25;
      const rightX = cx + effectiveR * 1.1;
      const leftX = cx - effectiveR * 1.1;
      const bottomY = cy + effectiveR * 0.72;
      shapeElement = (
        <polygon
          points={`${cx},${topY} ${rightX},${bottomY} ${leftX},${bottomY}`}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.6)" : stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <g pointerEvents="none">
            {/* Left ridge highlight */}
            <line
              x1={cx}
              y1={topY}
              x2={leftX}
              y2={bottomY}
              stroke="#ffffff"
              strokeWidth={Math.max(0.3, effectiveR * 0.28)}
              strokeLinecap="round"
              strokeOpacity={0.65}
            />
            {/* Bottom shadow ridge */}
            <line
              x1={leftX}
              y1={bottomY}
              x2={rightX}
              y2={bottomY}
              stroke="#000000"
              strokeWidth={Math.max(0.3, effectiveR * 0.24)}
              strokeLinecap="round"
              strokeOpacity={0.35}
            />
          </g>
        );
      }
      break;
    }

    case "invTriangle": {
      const bottomY = cy + effectiveR * 1.25;
      const rightX = cx + effectiveR * 1.1;
      const leftX = cx - effectiveR * 1.1;
      const topY = cy - effectiveR * 0.72;
      shapeElement = (
        <polygon
          points={`${cx},${bottomY} ${rightX},${topY} ${leftX},${topY}`}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.6)" : stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <g pointerEvents="none">
            <line
              x1={leftX}
              y1={topY}
              x2={rightX}
              y2={topY}
              stroke="#ffffff"
              strokeWidth={Math.max(0.3, effectiveR * 0.28)}
              strokeLinecap="round"
              strokeOpacity={0.65}
            />
            <line
              x1={rightX}
              y1={topY}
              x2={cx}
              y2={bottomY}
              stroke="#000000"
              strokeWidth={Math.max(0.3, effectiveR * 0.24)}
              strokeLinecap="round"
              strokeOpacity={0.35}
            />
          </g>
        );
      }
      break;
    }

    case "diamond": {
      const topY = cy - effectiveR * 1.28;
      const bottomY = cy + effectiveR * 1.28;
      const rightX = cx + effectiveR * 0.96;
      const leftX = cx - effectiveR * 0.96;
      shapeElement = (
        <polygon
          points={`${cx},${topY} ${rightX},${cy} ${cx},${bottomY} ${leftX},${cy}`}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.6)" : stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <g pointerEvents="none">
            {/* Top-left facet highlight */}
            <path
              d={`M ${leftX} ${cy} L ${cx} ${topY} L ${rightX} ${cy}`}
              stroke="#ffffff"
              strokeWidth={Math.max(0.3, effectiveR * 0.26)}
              strokeLinecap="round"
              strokeOpacity={0.65}
              fill="none"
            />
            {/* Bottom-right shadow */}
            <path
              d={`M ${rightX} ${cy} L ${cx} ${bottomY} L ${leftX} ${cy}`}
              stroke="#000000"
              strokeWidth={Math.max(0.3, effectiveR * 0.24)}
              strokeLinecap="round"
              strokeOpacity={0.35}
              fill="none"
            />
          </g>
        );
      }
      break;
    }

    case "star": {
      const starPoints = getStarPoints(cx, cy, effectiveR * 1.25, effectiveR * 0.52);
      shapeElement = (
        <polygon
          points={starPoints}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.7)" : stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <circle
            cx={cx - effectiveR * 0.2}
            cy={cy - effectiveR * 0.2}
            r={effectiveR * 0.35}
            fill="#ffffff"
            fillOpacity={0.7}
            pointerEvents="none"
          />
        );
      }
      break;
    }

    case "hexagon": {
      const hexPoints = getHexagonPoints(cx, cy, effectiveR * 1.15);
      shapeElement = (
        <polygon
          points={hexPoints}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.6)" : stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <g pointerEvents="none">
            <circle
              cx={cx - effectiveR * 0.25}
              cy={cy - effectiveR * 0.25}
              r={effectiveR * 0.45}
              fill="#ffffff"
              fillOpacity={0.6}
            />
          </g>
        );
      }
      break;
    }

    case "cross": {
      const crossPath = getCrossPath(cx, cy, effectiveR * 1.15, effectiveR * 0.45);
      shapeElement = (
        <path
          d={crossPath}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.6)" : stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <circle
            cx={cx - effectiveR * 0.15}
            cy={cy - effectiveR * 0.15}
            r={effectiveR * 0.3}
            fill="#ffffff"
            fillOpacity={0.7}
            pointerEvents="none"
          />
        );
      }
      break;
    }

    case "circle":
    default: {
      shapeElement = (
        <circle
          cx={cx}
          cy={cy}
          r={effectiveR}
          fill={fill}
          stroke={is3d ? "rgba(255,255,255,0.5)" : stroke}
          strokeWidth={strokeWidth}
          fillOpacity={opacity}
          className={className}
        />
      );
      if (is3d) {
        highlightElement = (
          <g pointerEvents="none">
            {/* Bottom-right shadow ring */}
            <circle
              cx={cx + effectiveR * 0.1}
              cy={cy + effectiveR * 0.1}
              r={effectiveR * 0.9}
              fill="none"
              stroke="#000000"
              strokeWidth={Math.max(0.25, effectiveR * 0.18)}
              strokeOpacity={0.28}
            />
            {/* Top-left 3D specular highlight sphere reflection */}
            <circle
              cx={cx - effectiveR * 0.32}
              cy={cy - effectiveR * 0.32}
              r={Math.max(0.3, effectiveR * 0.42)}
              fill="#ffffff"
              fillOpacity={0.72}
            />
            {/* Tiny pinpoint highlight */}
            <circle
              cx={cx - effectiveR * 0.42}
              cy={cy - effectiveR * 0.42}
              r={Math.max(0.15, effectiveR * 0.18)}
              fill="#ffffff"
              fillOpacity={0.9}
            />
          </g>
        );
      }
      break;
    }
  }

  return (
    <g>
      {shapeElement}
      {highlightElement}
      {title && <title>{title}</title>}
    </g>
  );
};

// Standalone SVG icon for HTML buttons, toolbars, tables, and legends
export interface PointSymbolIconProps {
  symbol?: PointSymbol;
  color?: string;
  size?: number; // in pixels
  className?: string;
  stroke?: string;
  is3d?: boolean;
}

export const PointSymbolIcon: React.FC<PointSymbolIconProps> = ({
  symbol = "circle",
  color = "#2563eb",
  size = 14,
  className = "",
  stroke = "#ffffff",
  is3d = false,
}) => {
  const center = size / 2;
  const r = size * 0.38;
  const gradId = `icon-grad-${String(color).replace(/#/g, "")}-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`shrink-0 inline-block overflow-visible ${className}`}
      style={{ verticalAlign: "middle" }}
    >
      {is3d && (
        <defs>
          <radialGradient id={gradId} cx="35%" cy="30%" r="70%" fx="30%" fy="25%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
            <stop offset="30%" stopColor={color} stopOpacity={1} />
            <stop offset="85%" stopColor={color} stopOpacity={0.85} />
            <stop offset="100%" stopColor="#0f172a" stopOpacity={0.7} />
          </radialGradient>
        </defs>
      )}
      <PointSymbolShape
        cx={center}
        cy={center}
        r={r}
        symbol={symbol}
        fill={is3d ? `url(#${gradId})` : color}
        stroke={stroke}
        strokeWidth={1}
        opacity={1}
        is3d={is3d}
      />
    </svg>
  );
};
