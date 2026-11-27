export interface BBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export interface MapFitTransform {
  zoomLevel: number;
  panOffset: { x: number; y: number };
}

/**
 * Parses numeric x,y coordinate pairs from a simplified SVG path string (e.g. "M 170,70 L 230,60 ... Z")
 * and optionally applies an affine transform (scaleX, scaleY, translateX, translateY).
 */
export function getSvgPathBBox(
  pathData: string,
  transform?: { scaleX: number; scaleY: number; translateX: number; translateY: number }
): BBox2D | null {
  if (!pathData) return null;

  const pairRegex = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const sx = transform?.scaleX ?? 1;
  const sy = transform?.scaleY ?? 1;
  const tx = transform?.translateX ?? 0;
  const ty = transform?.translateY ?? 0;

  while ((match = pairRegex.exec(pathData)) !== null) {
    const rawX = parseFloat(match[1]);
    const rawY = parseFloat(match[2]);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;

    const x = rawX * sx + tx;
    const y = rawY * sy + ty;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Computes a combined 2D projected bounding box across an array of GeoJSON features.
 */
export function getProjectedFeaturesBBox(
  features: any[],
  projectFn: (lon: number, lat: number) => [number, number]
): BBox2D | null {
  if (!features || features.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords: any) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [px, py] = projectFn(coords[0], coords[1]);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    } else {
      for (const child of coords) {
        visit(child);
      }
    }
  };

  for (const feature of features) {
    if (feature?.geometry?.coordinates) {
      visit(feature.geometry.coordinates);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Given a target 2D bounding box in SVG canvas coordinates and the inner plot frame,
 * calculates the exact zoomLevel and panOffset for:
 *   transform="translate(panX, panY) scale(zoom)" with transformOrigin="(originX, originY)"
 * so the bounding box is centered in the frame and fills `fillRatio` (default 84%) of the frame.
 */
export function computeFitTransform(
  bbox: BBox2D | null,
  frame: FrameRect,
  options?: { fillRatio?: number; minZoom?: number; maxZoom?: number }
): MapFitTransform {
  if (!bbox) {
    return { zoomLevel: 1, panOffset: { x: 0, y: 0 } };
  }

  const fillRatio = options?.fillRatio ?? 0.84;
  const minZoom = options?.minZoom ?? 0.85;
  const maxZoom = options?.maxZoom ?? 8.0;

  const boxW = Math.max(4, bbox.maxX - bbox.minX);
  const boxH = Math.max(4, bbox.maxY - bbox.minY);
  const boxCx = (bbox.minX + bbox.maxX) / 2;
  const boxCy = (bbox.minY + bbox.maxY) / 2;

  const availW = frame.width * fillRatio;
  const availH = frame.height * fillRatio;

  const rawZoom = Math.min(availW / boxW, availH / boxH);
  const zoomLevel = Number(Math.max(minZoom, Math.min(maxZoom, rawZoom)).toFixed(3));

  const frameCx = frame.left + frame.width / 2;
  const frameCy = frame.top + frame.height / 2;

  // Under CSS/SVG transformOrigin = (originX, originY) and transform = translate(tx, ty) scale(s):
  // P' = origin + (tx, ty) + s * (P - origin)
  // Solve P'(boxC) = frameC => tx = (frameCx - originX) + (originX - boxCx) * s
  const panX = Number(((frameCx - frame.originX) + (frame.originX - boxCx) * zoomLevel).toFixed(2));
  const panY = Number(((frameCy - frame.originY) + (frame.originY - boxCy) * zoomLevel).toFixed(2));

  return {
    zoomLevel,
    panOffset: { x: panX, y: panY },
  };
}
