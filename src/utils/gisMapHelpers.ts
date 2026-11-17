export interface ShapefileLayer {
  id: string;
  name: string;
  geoJson: any;
  visible: boolean;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  showLabels: boolean;
  labelKey: string;
  labelColor: string;
  labelSize: number;
  colorAttribute?: string;
  colorMapping?: Record<string, string>;
  showStroke?: boolean;
  showInLegend?: boolean;
  isAoi?: boolean;
}

// Default colors for principal aquifer shapefile
export const DEFAULT_AQUIFER_COLORS: Record<string, string> = {
  "alluvium": "#ffffd0",     // 255 255 208
  "laterite": "#ff9e30",     // 255 158 48
  "basalt": "#d0ffe8",       // 208 255 232
  "sandstone": "#b0ffb0",    // 176 255 176
  "shale": "#ffb0b0",        // 255 176 176
  "limestone": "#ffd040",    // 255 208 64
  "granite": "#70a0ff",      // 112 160 255
  "schist": "#dee000",       // 222 224 0
  "quartzite": "#c890ff",    // 200 144 255
  "charnockite": "#ffd0ff",  // 255 208 255
  "khondalite": "#7dd000",   // 125 208 0
  "bgc": "#ffd8b0",          // 255 216 176
  "gneiss": "#d0d0ff",       // 208 208 255
  "intrusives": "#60cbff"    // 96 203 255
};

export const getDpr = (): number => {
  if (typeof window === "undefined") return 3.0;
  const isMobile = window.innerWidth < 768 || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const baseDpr = window.devicePixelRatio || 2.0;
  if (isMobile) {
    return Math.max(baseDpr, 2.0);
  }
  return Math.max(baseDpr * 1.5, 3.5);
};

export const getInitialColorMapping = (geojson: any, attribute: string): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

  const defaultPalette = [
    "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa", "#2dd4bf", "#f472b6",
    "#93c5fd", "#6ee7b7", "#fca5a5", "#fde047", "#c084fc", "#5eead4", "#f9a8d4"
  ];
  let paletteIdx = 0;

  features.forEach((f: any) => {
    if (f && f.properties && f.properties[attribute] !== undefined) {
      const val = String(f.properties[attribute]).trim();
      if (!val || mapping[val]) return;

      const valLower = val.toLowerCase();
      const foundKey = Object.keys(DEFAULT_AQUIFER_COLORS).find(k =>
        valLower === k || valLower.includes(k) || k.includes(valLower)
      );
      if (foundKey) {
        mapping[val] = DEFAULT_AQUIFER_COLORS[foundKey];
      } else {
        mapping[val] = defaultPalette[paletteIdx % defaultPalette.length];
        paletteIdx++;
      }
    }
  });
  return mapping;
};

export const getFeatureFillColor = (layer: ShapefileLayer, feature: any): string => {
  if (layer.colorAttribute && feature && feature.properties) {
    const val = String(feature.properties[layer.colorAttribute] || "").trim();
    if (layer.colorMapping && layer.colorMapping[val]) {
      return layer.colorMapping[val];
    }
    const valLower = val.toLowerCase();
    const foundKey = Object.keys(DEFAULT_AQUIFER_COLORS).find(k =>
      valLower === k || valLower.includes(k) || k.includes(valLower)
    );
    if (foundKey) {
      return DEFAULT_AQUIFER_COLORS[foundKey];
    }
  }
  return layer.fillColor || "#3b82f6";
};

export const COLOR_SCHEMES = {
  "Single Red Shades": ["#fee2e2", "#fca5a5", "#f87171", "#dc2626", "#881337"],
  "Single Blue Shades": ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#172554"],
  "Single Orange Shades": ["#fff7ed", "#fed7aa", "#f97316", "#c2410c", "#431407"],
  "Single Green Shades": ["#dcfce7", "#86efac", "#22c55e", "#15803d", "#052e16"],
  "Single Purple Shades": ["#f3e8ff", "#d8b4fe", "#a855f7", "#7e22ce", "#3b0764"],
  "Single Teal Shades": ["#f0fdf4", "#99f6e4", "#14b8a6", "#0f766e", "#042f2e"],
  "Single Amber Shades": ["#fef9c3", "#fde047", "#eab308", "#ca8a04", "#422006"],
  "Single Gray Shades": ["#f3f4f6", "#d1d5db", "#6b7280", "#374151", "#030712"],
  "Blue-Yellow-Red": ["#005ce6", "#ffff00", "#ff0000"],
  "Green-Yellow-Red": ["#22c55e", "#facc15", "#ef4444"],
  "Spectral": ["#d53e4f", "#fdae61", "#abdda4", "#2b83ba"],
  "Viridis": ["#440154", "#31688e", "#35b779", "#fde725"],
  "Plasma": ["#0d0887", "#7e03a8", "#cc4778", "#f0f921"],
  "Chroma Aqua": ["#e0f2fe", "#7dd3fc", "#0284c7", "#0369a1"],
  "Terrain": ["#313695", "#74add1", "#fee090", "#d73027", "#a50026"],
  "Grey Scale": ["#f3f4f6", "#9ca3af", "#1f2937"]
};

export const BASEMAP_STYLES = {
  "No Basemap": { bg: "#ffffff", grid: "#f1f5f9", outline: "#cbd5e1" },
  "Transparent (No Background)": { bg: "transparent", grid: "rgba(148, 163, 184, 0.12)", outline: "#cbd5e1" },
  "ESRI Terrain": { bg: "#faf5ec", grid: "rgba(120, 113, 108, 0.08)", outline: "#d6ccc2" },
  "ESRI Topographic": { bg: "#f4f8f4", grid: "rgba(15, 23, 42, 0.04)", outline: "#cbd5e1" },
  "ESRI Satellite": { bg: "#0b1220", grid: "rgba(255,255,255,0.06)", outline: "#1e293b" },
  "Google Road Map": { bg: "#f5f5f5", grid: "rgba(0,0,0,0.04)", outline: "#cbd5e1" },
  "Google Satellite": { bg: "#050a12", grid: "rgba(255,255,255,0.08)", outline: "#334155" },
  "Google Hybrid": { bg: "#060b14", grid: "rgba(255,255,255,0.1)", outline: "#475569" },
  "OpenStreetMap": { bg: "#fdfbfa", grid: "rgba(0,0,0,0.05)", outline: "#94a3b8" }
};

export function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1.0 / Math.cos(latRad)) / Math.PI) / 2.0) *
    Math.pow(2, zoom)
  );
}

export function tileXToLng(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360.0 - 180.0;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2.0 * Math.PI * y) / Math.pow(2, zoom);
  return (180.0 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function createGeoTiffBlob(
  width: number,
  height: number,
  rgbaData: Uint8ClampedArray,
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }
): Blob {
  const numPixels = width * height;
  const pixelDataOffset = 8;
  const pixelDataSize = numPixels * 3;

  const tiepointsOffset = pixelDataOffset + pixelDataSize;
  const tiepointsSize = 6 * 8;

  const pixelScaleOffset = tiepointsOffset + tiepointsSize;
  const pixelScaleSize = 3 * 8;

  const geoKeysOffset = pixelScaleOffset + pixelScaleSize;
  const geoKeys = [
    1, 1, 0, 4,
    1024, 0, 1, 2,
    1025, 0, 1, 1,
    2048, 0, 1, 4326
  ];
  const geoKeysSize = geoKeys.length * 2;

  const bitsPerSampleOffset = geoKeysOffset + geoKeysSize;
  const bitsPerSampleSize = 3 * 2;

  const ifdOffset = bitsPerSampleOffset + bitsPerSampleSize;

  const totalSize = ifdOffset + 2 + (14 * 12) + 4;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  let dstChan = pixelDataOffset;
  for (let i = 0; i < numPixels; i++) {
    const srcChan = i * 4;
    view.setUint8(dstChan, rgbaData[srcChan]);
    view.setUint8(dstChan + 1, rgbaData[srcChan + 1]);
    view.setUint8(dstChan + 2, rgbaData[srcChan + 2]);
    dstChan += 3;
  }

  const tiepoints = [0.0, 0.0, 0.0, bounds.minLng, bounds.maxLat, 0.0];
  for (let i = 0; i < 6; i++) {
    view.setFloat64(tiepointsOffset + i * 8, tiepoints[i], true);
  }

  const scaleLng = (bounds.maxLng - bounds.minLng) / width;
  const scaleLat = (bounds.maxLat - bounds.minLat) / height;
  const pixelScale = [scaleLng, scaleLat, 0.0];
  for (let i = 0; i < 3; i++) {
    view.setFloat64(pixelScaleOffset + i * 8, pixelScale[i], true);
  }

  for (let i = 0; i < geoKeys.length; i++) {
    view.setUint16(geoKeysOffset + i * 2, geoKeys[i], true);
  }

  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);

  let curIfd = ifdOffset;
  const numEntries = 14;
  view.setUint16(curIfd, numEntries, true);
  curIfd += 2;

  const entries = [
    { tag: 256, type: 4, count: 1, val: width },
    { tag: 257, type: 4, count: 1, val: height },
    { tag: 258, type: 3, count: 3, val: bitsPerSampleOffset },
    { tag: 259, type: 3, count: 1, val: 1 },
    { tag: 262, type: 3, count: 1, val: 2 },
    { tag: 273, type: 4, count: 1, val: pixelDataOffset },
    { tag: 277, type: 3, count: 1, val: 3 },
    { tag: 278, type: 4, count: 1, val: height },
    { tag: 279, type: 4, count: 1, val: pixelDataSize },
    { tag: 282, type: 5, count: 1, val: 0 },
    { tag: 283, type: 5, count: 1, val: 0 },
    { tag: 33550, type: 12, count: 3, val: pixelScaleOffset },
    { tag: 33922, type: 12, count: 6, val: tiepointsOffset },
    { tag: 34735, type: 3, count: geoKeys.length, val: geoKeysOffset }
  ];

  entries.sort((a, b) => a.tag - b.tag);

  entries.forEach(e => {
    view.setUint16(curIfd, e.tag, true);
    view.setUint16(curIfd + 2, e.type, true);
    view.setUint32(curIfd + 4, e.count, true);

    if (e.type === 3 && e.count === 1) {
      view.setUint16(curIfd + 8, e.val, true);
      view.setUint16(curIfd + 10, 0, true);
    } else {
      view.setUint32(curIfd + 8, e.val, true);
    }
    curIfd += 12;
  });

  view.setUint32(curIfd, 0, true);

  return new Blob([buffer], { type: "image/tiff" });
}

export function darkenColor(hex: string, percent: number): string {
  hex = hex.replace(/^\s*#|\s*$/g, '');
  if (hex.length === 3) {
    hex = hex.replace(/(.)/g, '$1$1');
  }
  let r = parseInt(hex.substring(0, 2), 16) || 0;
  let g = parseInt(hex.substring(2, 4), 16) || 0;
  let b = parseInt(hex.substring(4, 6), 16) || 0;

  r = Math.max(0, Math.floor(r * (1 - percent)));
  g = Math.max(0, Math.floor(g * (1 - percent)));
  b = Math.max(0, Math.floor(b * (1 - percent)));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111.32;
  const meanLat = (lat1 + lat2) / 2;
  const dLng = (lng2 - lng1) * 111.32 * Math.cos(meanLat * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

export function getPolygonCentroid(coordinates: any): { lng: number; lat: number } | null {
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;

  const traverse = (coords: any) => {
    if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
      sumLng += coords[0];
      sumLat += coords[1];
      count++;
    } else if (Array.isArray(coords)) {
      coords.forEach(traverse);
    }
  };

  traverse(coordinates);
  if (count === 0) return null;
  return { lng: sumLng / count, lat: sumLat / count };
}

export function getFeatureBbox(f: any): [number, number, number, number] | null {
  if (!f || !f.geometry) return null;
  if (f.bbox && f.bbox.length === 4) return f.bbox;
  try {
    const coords = f.geometry.coordinates;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const scan = (c: any) => {
      if (!c) return;
      if (typeof c[0] === "number" && typeof c[1] === "number") {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
      } else if (Array.isArray(c)) {
        for (let i = 0; i < c.length; i++) scan(c[i]);
      }
    };
    scan(coords);
    if (minX !== Infinity && maxX !== -Infinity) {
      const b: [number, number, number, number] = [minX, minY, maxX, maxY];
      f.bbox = b;
      return b;
    }
  } catch {}
  return null;
}

export function doBboxesOverlap(b1: [number, number, number, number], b2: [number, number, number, number]): boolean {
  return !(b1[2] < b2[0] || b1[0] > b2[2] || b1[3] < b2[1] || b1[1] > b2[3]);
}

export function getAdminFeatureLabel(f: any): { name: string; type: string } {
  if (!f || !f.properties) return { name: "Unit", type: "Boundary" };
  const p = f.properties;
  const keys = Object.keys(p);

  const findProp = (patterns: string[]) => {
    for (const pattern of patterns) {
      const found = keys.find(k => k.toLowerCase() === pattern || k.toLowerCase().includes(pattern));
      if (found && p[found] !== undefined && p[found] !== null && String(p[found]).trim() !== "") {
        return String(p[found]).trim();
      }
    }
    return "";
  };

  const blockName = findProp(["block_name", "block", "tehsil", "taluk", "sub_district", "subdist"]);
  const distName = findProp(["dt_nm", "district_name", "district", "dist_name", "dist"]);
  const stateName = findProp(["st_nm", "state_name", "state"]);

  if (blockName) {
    const full = distName ? `${blockName} (${distName})` : blockName;
    return { name: full, type: "Block" };
  }
  if (distName) {
    const full = stateName ? `${distName} (${stateName})` : distName;
    return { name: full, type: "District" };
  }
  if (stateName) {
    return { name: stateName, type: "State" };
  }

  const generalName = findProp(["name", "label", "title", "id", "village"]);
  return { name: generalName || "Unit", type: "Boundary" };
}

export function getFeatureAttributeLabel(f: any, attributeChoice: string = "auto", fallbackKey?: string): string {
  if (!f || !f.properties) return "";
  const p = f.properties;
  const keys = Object.keys(p);

  const findPropVal = (patterns: string[]): string => {
    for (const pattern of patterns) {
      const found = keys.find(k => k.toLowerCase() === pattern || k.toLowerCase().includes(pattern));
      if (found && p[found] !== undefined && p[found] !== null && String(p[found]).trim() !== "") {
        return String(p[found]).trim();
      }
    }
    return "";
  };

  const choice = (attributeChoice || "auto").toLowerCase().trim();

  if (choice === "district") {
    const dist = findPropVal(["dt_nm", "district_name", "district", "dist_name", "dist", "dtname", "d_name"]);
    if (dist) return dist;
  } else if (choice === "block") {
    const block = findPropVal(["block_name", "block", "tehsil", "taluk", "sub_district", "subdist", "blk_nm", "tahsil"]);
    if (block) return block;
  } else if (choice === "state") {
    const state = findPropVal(["st_nm", "state_name", "state", "statename", "s_name"]);
    if (state) return state;
  } else if (choice !== "auto") {
    if (p[attributeChoice] !== undefined && p[attributeChoice] !== null && String(p[attributeChoice]).trim() !== "") {
      return String(p[attributeChoice]).trim();
    }
    const matchKey = keys.find(k => k.toLowerCase() === choice);
    if (matchKey && p[matchKey] !== undefined && p[matchKey] !== null && String(p[matchKey]).trim() !== "") {
      return String(p[matchKey]).trim();
    }
  }

  if (fallbackKey && p[fallbackKey] !== undefined && p[fallbackKey] !== null && String(p[fallbackKey]).trim() !== "") {
    return String(p[fallbackKey]).trim();
  }

  const admin = getAdminFeatureLabel(f);
  return (admin.name && admin.name !== "Unit" && admin.name !== "Unknown") ? admin.name : "";
}

export const createInterpolationWorker = () => {
  const workerCode = `
    function projectLatToY(lat) {
      const r_major = 6378137.0;
      const latRad = lat * Math.PI / 180;
      return r_major * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    }

    function projectLngToX(lng) {
      const r_major = 6378137.0;
      return r_major * (lng * Math.PI / 180);
    }

    function evaluateSemivariogram(d, model, nugget, sill, range) {
      if (d === 0) return 0;
      const h = d;
      const a = range;
      const c = sill - nugget;
      if (model === "spherical") {
        if (h < a) {
          return nugget + c * (1.5 * (h / a) - 0.5 * Math.pow(h / a, 3));
        }
        return sill;
      } else if (model === "exponential") {
        return nugget + c * (1 - Math.exp(-3 * h / a));
      } else {
        if (h === 0) return nugget;
        return nugget + c * (1 - Math.exp(-3 * Math.pow(h / a, 2)));
      }
    }

    function evaluateRbfKernel(d, kernel, parameter) {
      if (kernel === "multiquadric") {
        return Math.sqrt(d * d + parameter * parameter);
      } else if (kernel === "inverse_multiquadric" || kernel === "inverse-multiquadric") {
        return 1 / Math.sqrt(d * d + parameter * parameter);
      } else if (kernel === "gaussian") {
        return Math.exp(-d * d / (parameter * parameter));
      } else {
        if (d === 0) return 0;
        return d * d * Math.log(d);
      }
    }

    function solveLinearSystem(A, b) {
      const n = b.length;
      for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
            maxRow = k;
          }
        }
        const tempRow = A[i];
        A[i] = A[maxRow];
        A[maxRow] = tempRow;
        const tempB = b[i];
        b[i] = b[maxRow];
        b[maxRow] = tempB;

        if (Math.abs(A[i][i]) < 1e-12) return null;

        for (let k = i + 1; k < n; k++) {
          const factor = A[k][i] / A[i][i];
          b[k] -= factor * b[i];
          for (let j = i; j < n; j++) {
            A[k][j] -= factor * A[i][j];
          }
        }
      }

      const x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
          sum += A[i][j] * x[j];
        }
        x[i] = (b[i] - sum) / A[i][i];
      }
      return x;
    }

    self.onmessage = function(e) {
      const {
        validPoints,
        rowStep,
        colStep,
        baseMapExtent,
        clippingRadius,
        extendInterpolationToBoundary,
        interpolationMethod,
        idwPower,
        useAllPoints,
        searchRadius,
        krigingModel,
        krigingNugget,
        krigingSill,
        krigingRange,
        krigingNeighbors,
        rbfKernel,
        rbfParameter,
        enableGaussianSmoothing,
        enableAnisotropy,
        anisotropyAngle,
        anisotropyRatio
      } = e.data;

      const minLng = baseMapExtent.mapMinLng;
      const maxLng = baseMapExtent.mapMaxLng;
      const minLat = baseMapExtent.mapMinLat;
      const maxLat = baseMapExtent.mapMaxLat;

      const projectedPoints = validPoints.map(p => ({
        lat: p.lat,
        lng: p.lng,
        val: p.val,
        projX: projectLngToX(p.lng),
        projY: projectLatToY(p.lat)
      }));

      const corners = [
        { lat: maxLat, lng: minLng },
        { lat: maxLat, lng: maxLng },
        { lat: minLat, lng: minLng },
        { lat: minLat, lng: maxLng }
      ];

      corners.forEach(corner => {
        let nearestPt = null;
        let minDist = Infinity;
        const cornerX = projectLngToX(corner.lng);
        const cornerY = projectLatToY(corner.lat);
        for (let i = 0; i < projectedPoints.length; i++) {
          const pt = projectedPoints[i];
          const dx = pt.projX - cornerX;
          const dy = pt.projY - cornerY;
          const d = Math.sqrt(dx * dx + dy * dy) / 1000.0;
          if (d < minDist) {
            minDist = d;
            nearestPt = pt;
          }
        }
        if (nearestPt) {
          projectedPoints.push({
            lat: corner.lat,
            lng: corner.lng,
            val: nearestPt.val,
            projX: cornerX,
            projY: cornerY,
            isVirtual: true
          });
        }
      });

      const grid = [];
      const cosLatVal = Math.cos(baseMapExtent.centerLat * Math.PI / 180);

      function getProjDistanceKmFast(projX1, projY1, projX2, projY2) {
        let dx = projX1 - projX2;
        let dy = projY1 - projY2;

        if (enableAnisotropy) {
          const angleRad = (anisotropyAngle * Math.PI) / 180;
          const cosA = Math.cos(angleRad);
          const sinA = Math.sin(angleRad);
          const rotX = dx * cosA + dy * sinA;
          const rotY = -dx * sinA + dy * cosA;
          dx = rotX;
          dy = rotY * anisotropyRatio;
        }

        return Math.sqrt(dx * dx + dy * dy) / 1000.0;
      }

      const idwPow = idwPower || 2;
      const dLatMax = searchRadius / 111.32;
      const dLngMax = searchRadius / (111.32 * cosLatVal);

      const minX = projectLngToX(minLng);
      const maxX = projectLngToX(maxLng);
      const minY = projectLatToY(minLat);
      const maxY = projectLatToY(maxLat);
      const spanX = maxX - minX;
      const spanY = maxY - minY;

      const gridPoints = projectedPoints.map((p, idx) => {
        const pctX = (p.lng - minLng) / (baseMapExtent.finalLngSpan || 1e-6);
        const pctY = (p.lat - minLat) / (baseMapExtent.finalLatSpan || 1e-6);
        return {
          x: pctX * colStep,
          y: pctY * rowStep,
          val: p.val,
          isVirtual: p.isVirtual,
          idx: idx
        };
      });

      const bucketSize = 40;
      const numBucketsX = Math.ceil(colStep / bucketSize);
      const numBucketsY = Math.ceil(rowStep / bucketSize);
      const buckets = Array.from({ length: numBucketsY }, () =>
        Array.from({ length: numBucketsX }, () => [])
      );

      for (let i = 0; i < gridPoints.length; i++) {
        const gp = gridPoints[i];
        const bx = Math.max(0, Math.min(numBucketsX - 1, Math.floor(gp.x / bucketSize)));
        const by = Math.max(0, Math.min(numBucketsY - 1, Math.floor(gp.y / bucketSize)));
        buckets[by][bx].push(gp);
      }

      const kmPerPixel = baseMapExtent.finalLngSpan * 111.32 * cosLatVal / colStep;
      const clippingRadiusPixelsSq = Math.pow(clippingRadius / (kmPerPixel || 1e-6), 2);

      let krigingBeta = null;
      let computedKrigingRange = krigingRange || (colStep * 0.4);
      let computedKrigingSill = krigingSill || 1.0;
      let computedKrigingNugget = krigingNugget !== undefined ? krigingNugget : 0.01;
      let krigingGammaFn = function(d) { return 0.01; };

      if (interpolationMethod === "kriging" || interpolationMethod === "ordinary_kriging") {
        const N = gridPoints.length;
        const vals = gridPoints.map(gp => gp.val);
        const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
        const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (vals.length || 1);

        if (!krigingSill) {
          computedKrigingSill = Math.max(0.1, variance);
        }
        if (!krigingRange) {
          computedKrigingRange = colStep * 0.4;
        }

        krigingGammaFn = function(d) {
          return computedKrigingNugget + computedKrigingSill * (1 - Math.exp(-d / computedKrigingRange));
        };

        const gammaMatrix = [];
        for (let i = 0; i < N + 1; i++) {
          gammaMatrix.push(new Float64Array(N + 1));
        }
        for (let i = 0; i < N; i++) {
          const gpi = gridPoints[i];
          for (let j = 0; j < N; j++) {
            const gpj = gridPoints[j];
            const dx = gpi.x - gpj.x;
            const dy = gpi.y - gpj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            gammaMatrix[i][j] = krigingGammaFn(dist);
          }
          gammaMatrix[i][N] = 1.0;
          gammaMatrix[N][i] = 1.0;
        }
        gammaMatrix[N][N] = 0.0;

        const bVector = new Float64Array(N + 1);
        for (let i = 0; i < N; i++) {
          bVector[i] = gridPoints[i].val;
        }
        bVector[N] = 1.0;

        krigingBeta = solveLinearSystem(gammaMatrix, bVector);
      }

      for (let r = 0; r < rowStep; r++) {
        const rowVals = new Float32Array(colStep);

        for (let c = 0; c < colStep; c++) {
          const bx = Math.max(0, Math.min(numBucketsX - 1, Math.floor(c / bucketSize)));
          const by = Math.max(0, Math.min(numBucketsY - 1, Math.floor(r / bucketSize)));

          let nearestGP = null;
          let minDistSq = Infinity;
          let searchRad = 0;

          while (nearestGP === null && searchRad < Math.max(numBucketsX, numBucketsY)) {
            for (let dy = -searchRad; dy <= searchRad; dy++) {
              for (let dx = -searchRad; dx <= searchRad; dx++) {
                if (searchRad > 0 && Math.abs(dy) !== searchRad && Math.abs(dx) !== searchRad) continue;
                const ny = by + dy;
                const nx = bx + dx;
                if (ny >= 0 && ny < numBucketsY && nx >= 0 && nx < numBucketsX) {
                  const b = buckets[ny][nx];
                  for (let i = 0; i < b.length; i++) {
                    const gp = b[i];
                    const dc = c - gp.x;
                    const dr = r - gp.y;
                    const dSq = dc * dc + dr * dr;
                    if (dSq < minDistSq) {
                      minDistSq = dSq;
                      nearestGP = gp;
                    }
                  }
                }
              }
            }
            searchRad++;
          }

          if (!extendInterpolationToBoundary) {
            if (nearestGP === null || minDistSq > clippingRadiusPixelsSq) {
              rowVals[c] = NaN;
              continue;
            }
          }

          if (interpolationMethod === "nearest") {
            rowVals[c] = nearestGP ? nearestGP.val : 0;
            continue;
          }

          let candidates = [];
          let rad = 0;
          while (candidates.length < 15 && rad < Math.max(numBucketsX, numBucketsY)) {
            for (let dy = -rad; dy <= rad; dy++) {
              for (let dx = -rad; dx <= rad; dx++) {
                if (rad > 0 && Math.abs(dy) !== rad && Math.abs(dx) !== rad) continue;
                const ny = by + dy;
                const nx = bx + dx;
                if (ny >= 0 && ny < numBucketsY && nx >= 0 && nx < numBucketsX) {
                  const b = buckets[ny][nx];
                  for (let i = 0; i < b.length; i++) {
                    candidates.push(b[i]);
                  }
                }
              }
            }
            rad++;
          }

          let val = 0;

          if (interpolationMethod === "natural" || interpolationMethod === "spline") {
            const ptsWithGridDist = candidates.map(gp => {
              const dx = c - gp.x;
              const dy = r - gp.y;
              return { gp, dSq: dx * dx + dy * dy };
            });
            ptsWithGridDist.sort((a, b) => a.dSq - b.dSq);

            let n1 = ptsWithGridDist[0]?.gp.idx ?? -1;
            let d1 = ptsWithGridDist[0]?.dSq ?? Infinity;
            let n2 = ptsWithGridDist[1]?.gp.idx ?? -1;
            let d2 = ptsWithGridDist[1]?.dSq ?? Infinity;
            let n3 = ptsWithGridDist[2]?.gp.idx ?? -1;
            let d3 = ptsWithGridDist[2]?.dSq ?? Infinity;
            let n4 = ptsWithGridDist[3]?.gp.idx ?? -1;
            let d4 = ptsWithGridDist[3]?.dSq ?? Infinity;
            let n5 = ptsWithGridDist[4]?.gp.idx ?? -1;
            let d5 = ptsWithGridDist[4]?.dSq ?? Infinity;
            let n6 = ptsWithGridDist[5]?.gp.idx ?? -1;
            let d6 = ptsWithGridDist[5]?.dSq ?? Infinity;

            if (d1 < 0.05) {
              val = gridPoints[n1].val;
            } else if (n6 >= 0) {
              const R = Math.sqrt(d6);
              let sumWeights = 0;
              let sumWeightedValues = 0;

              const addWeight = (idx, dSq) => {
                if (idx < 0) return;
                const dist = Math.sqrt(dSq);
                const w = Math.pow((R - dist) / (R * dist + 0.001), 2);
                sumWeights += w;
                sumWeightedValues += w * gridPoints[idx].val;
              };

              addWeight(n1, d1);
              addWeight(n2, d2);
              addWeight(n3, d3);
              addWeight(n4, d4);
              addWeight(n5, d5);

              if (sumWeights > 0) {
                val = sumWeightedValues / sumWeights;
              } else {
                val = gridPoints[n1].val;
              }
            } else {
              val = n1 >= 0 ? gridPoints[n1].val : 0;
            }
          } else if ((interpolationMethod === "kriging" || interpolationMethod === "ordinary_kriging") && krigingBeta) {
            let krigVal = 0;
            const N_pts = gridPoints.length;
            for (let j = 0; j < N_pts; j++) {
              const gp = gridPoints[j];
              const dx = c - gp.x;
              const dy = r - gp.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              krigVal += krigingGammaFn(dist) * krigingBeta[j];
            }
            krigVal += 1.0 * krigingBeta[N_pts];
            val = krigVal;
          } else {
            let weightedSum = 0;
            let weightTotal = 0;
            let exact = false;

            for (let i = 0; i < candidates.length; i++) {
              const gp = candidates[i];
              const dx = c - gp.x;
              const dy = r - gp.y;
              const dSq = dx * dx + dy * dy;

              if (dSq < 0.05) {
                val = gp.val;
                exact = true;
                break;
              }
              const d = Math.sqrt(dSq);
              const w = 1 / (dSq * d + 0.01);
              weightedSum += w * gp.val;
              weightTotal += w;
            }
            if (!exact) {
              val = weightTotal > 0 ? weightedSum / weightTotal : 0;
            }
          }

          rowVals[c] = val;
        }
        grid.push(rowVals);
      }

      if (enableGaussianSmoothing && grid.length > 2) {
        const smoothedGrid = [];
        const kernel = [
          [1/16, 2/16, 1/16],
          [2/16, 4/16, 2/16],
          [1/16, 2/16, 1/16]
        ];
        for (let r = 0; r < rowStep; r++) {
          const rowVals = new Float32Array(colStep);
          for (let c = 0; c < colStep; c++) {
            if (isNaN(grid[r][c])) {
              rowVals[c] = NaN;
              continue;
            }
            let sum = 0;
            let wTotal = 0;
            for (let kr = -1; kr <= 1; kr++) {
              for (let kc = -1; kc <= 1; kc++) {
                const nr = r + kr;
                const nc = c + kc;
                if (nr >= 0 && nr < rowStep && nc >= 0 && nc < colStep && !isNaN(grid[nr][nc])) {
                  const kw = kernel[kr + 1][kc + 1];
                  sum += grid[nr][nc] * kw;
                  wTotal += kw;
                }
              }
            }
            rowVals[c] = wTotal > 0 ? sum / wTotal : grid[r][c];
          }
          smoothedGrid.push(rowVals);
        }
        self.postMessage({ grid: smoothedGrid });
      } else {
        self.postMessage({ grid: grid });
      }
    };
  `;
  const blob = new Blob([workerCode], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);
  let revoked = false;
  const revoke = () => {
    if (!revoked) {
      revoked = true;
      URL.revokeObjectURL(workerUrl);
    }
  };
  return { worker, revoke };
};
