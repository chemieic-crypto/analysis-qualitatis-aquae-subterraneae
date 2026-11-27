import JSZip from "jszip";

/**
 * ESRI Shapefile & MapInfo Package Generator (Pure TypeScript)
 * Compliant with ESRI Shapefile Technical Description (July 1998)
 * Generates .shp, .shx, .dbf, .prj, .cpg, and MapInfo .tab files bundled inside a .zip archive.
 */

export interface ShapefileFieldDef {
  name: string; // Max 10 chars, uppercase ASCII
  origKey: string; // Original property key in feature.properties
  type: "C" | "N"; // Character or Numeric
  length: number; // Bytes in DBF (max 254)
  decimals?: number; // Decimal places for N
}

export interface ShapefilePointFeature {
  lng: number;
  lat: number;
  properties: Record<string, any>;
}

export interface ShapefilePolyLineFeature {
  parts: [number, number][][]; // Each part is an array of [lng, lat]
  properties: Record<string, any>;
}

export interface ShapefilePolygonFeature {
  rings: [number, number][][]; // Each ring is an array of [lng, lat]
  ringIsHole?: boolean[]; // True for interior holes (CCW), false/undefined for exterior (CW)
  properties: Record<string, any>;
}

export const WGS84_PRJ = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;

const textEncoder = new TextEncoder();

/**
 * Computes twice the signed shoelace area of a closed ring in Cartesian (X=lng, Y=lat).
 * Positive => Clockwise (CW); Negative => Counter-Clockwise (CCW).
 */
function getRingSignedAreaTwice(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum;
}

/**
 * Closes a polygon ring and enforces ESRI Shapefile winding order:
 * - Exterior ring: Clockwise (CW, signedAreaTwice >= 0)
 * - Interior hole ring: Counter-Clockwise (CCW, signedAreaTwice <= 0)
 */
function normalizePolygonRing(ring: [number, number][], isHole: boolean): [number, number][] | null {
  const validPts = ring.filter(
    (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
  );
  if (validPts.length < 3) return null;

  const first = validPts[0];
  const last = validPts[validPts.length - 1];
  const isClosed = Math.abs(first[0] - last[0]) < 1e-10 && Math.abs(first[1] - last[1]) < 1e-10;
  const closedRing: [number, number][] = isClosed ? [...validPts] : [...validPts, [first[0], first[1]]];
  if (closedRing.length < 4) return null;

  const area2 = getRingSignedAreaTwice(closedRing);
  if (!isHole && area2 < 0) {
    closedRing.reverse();
  } else if (isHole && area2 > 0) {
    closedRing.reverse();
  }
  return closedRing;
}

/**
 * Sanitizes field names to fit dBASE 10-character ASCII limit.
 */
function sanitizeFieldName(name: string, existingNames: Set<string>): string {
  let clean = name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toUpperCase()
    .slice(0, 10);
  if (!clean || clean.length === 0) clean = "FIELD";
  if (/^[0-9]/.test(clean)) clean = "F_" + clean.slice(0, 8);

  let candidate = clean;
  let counter = 1;
  while (existingNames.has(candidate)) {
    const suffix = String(counter);
    candidate = clean.slice(0, Math.max(1, 10 - suffix.length)) + suffix;
    counter++;
  }
  existingNames.add(candidate);
  return candidate;
}

/**
 * Derives DBF field definitions from record properties (capped cleanly to dBASE III limits).
 */
export function deriveFieldDefs(propertiesList: Record<string, any>[]): ShapefileFieldDef[] {
  const existingNames = new Set<string>();
  const fieldDefs: ShapefileFieldDef[] = [];

  if (propertiesList.length === 0) {
    return [{ name: "ID", origKey: "ID", type: "N", length: 10, decimals: 0 }];
  }

  const allKeys: string[] = [];
  propertiesList.forEach((props) => {
    if (!props) return;
    Object.keys(props).forEach((k) => {
      if (k && !k.startsWith("_") && !allKeys.includes(k)) {
        allKeys.push(k);
      }
    });
  });

  if (allKeys.length === 0) {
    return [{ name: "ID", origKey: "ID", type: "N", length: 10, decimals: 0 }];
  }

  // dBASE III allows max 255 fields and ~4000 bytes per record
  let accumulatedRecordBytes = 1;

  for (const key of allKeys) {
    if (fieldDefs.length >= 120) break;

    let isNumeric = true;
    let maxByteLen = 0;
    let hasDecimals = false;
    let maxDecimals = 0;
    let sampleCount = 0;

    for (let r = 0; r < propertiesList.length; r++) {
      const val = propertiesList[r]?.[key];
      if (val !== undefined && val !== null && val !== "") {
        sampleCount++;
        if (typeof val === "number") {
          if (!Number.isFinite(val)) {
            isNumeric = false;
          } else {
            const s = String(val);
            if (s.includes("e") || s.includes("E")) {
              isNumeric = false;
            } else if (s.includes(".")) {
              hasDecimals = true;
              const decLen = s.split(".")[1]?.length || 0;
              if (decLen > maxDecimals) maxDecimals = Math.min(6, decLen);
            }
            if (s.length > maxByteLen) maxByteLen = s.length;
          }
        } else if (typeof val === "boolean") {
          isNumeric = false;
          if (5 > maxByteLen) maxByteLen = 5;
        } else {
          const str = String(val).trim();
          const bLen = textEncoder.encode(str).length;
          if (bLen > maxByteLen) maxByteLen = bLen;
          if (str === "" || isNaN(Number(str)) || str.includes("e") || str.includes("E") || (str.length > 1 && str.startsWith("0") && !str.startsWith("0."))) {
            isNumeric = false;
          } else if (str.includes(".")) {
            hasDecimals = true;
            const decLen = str.split(".")[1]?.length || 0;
            if (decLen > maxDecimals) maxDecimals = Math.min(6, decLen);
          }
        }
      }
    }

    const sanitized = sanitizeFieldName(key, existingNames);
    let def: ShapefileFieldDef;

    if (sampleCount === 0 || !isNumeric) {
      def = {
        name: sanitized,
        origKey: key,
        type: "C",
        length: Math.max(10, Math.min(254, maxByteLen || 40)),
      };
    } else {
      const decimals = hasDecimals ? Math.max(2, maxDecimals) : 0;
      const numLen = Math.max(12, Math.min(20, maxByteLen + (decimals > 0 ? 4 : 2)));
      def = {
        name: sanitized,
        origKey: key,
        type: "N",
        length: numLen,
        decimals,
      };
    }

    if (accumulatedRecordBytes + def.length > 3900) break;
    accumulatedRecordBytes += def.length;
    fieldDefs.push(def);
  }

  if (fieldDefs.length === 0) {
    fieldDefs.push({ name: "ID", origKey: "ID", type: "N", length: 10, decimals: 0 });
  }

  return fieldDefs;
}

/**
 * Builds the binary dBASE III (.dbf) buffer cleanly handling UTF-8 byte lengths.
 */
function buildDbfBuffer(records: Record<string, any>[], fieldDefs: ShapefileFieldDef[]): Uint8Array {
  const numRecords = records.length;
  const numFields = fieldDefs.length;
  const headerLength = 32 + numFields * 32 + 1;
  const recordLength = 1 + fieldDefs.reduce((sum, f) => sum + f.length, 0);
  const totalLength = headerLength + numRecords * recordLength + 1;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, 0x03); // dBASE III without memo
  const now = new Date();
  view.setUint8(1, Math.min(255, Math.max(0, now.getFullYear() - 1900)));
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, numRecords, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  view.setUint8(29, 0x00); // Rely on .cpg UTF-8

  let fieldOffset = 32;
  fieldDefs.forEach((f) => {
    const nameBytes = textEncoder.encode(f.name.slice(0, 10).toUpperCase());
    for (let i = 0; i < 11; i++) {
      bytes[fieldOffset + i] = i < nameBytes.length ? nameBytes[i] : 0;
    }
    bytes[fieldOffset + 11] = f.type.charCodeAt(0);
    bytes[fieldOffset + 16] = f.length;
    bytes[fieldOffset + 17] = f.decimals || 0;
    fieldOffset += 32;
  });

  bytes[headerLength - 1] = 0x0d;

  let recOffset = headerLength;
  records.forEach((rec, recIdx) => {
    bytes[recOffset] = 0x20;
    let colOffset = recOffset + 1;

    fieldDefs.forEach((f) => {
      let val = rec?.[f.origKey];
      if (val === undefined || val === null) {
        val = f.origKey === "ID" ? recIdx + 1 : "";
      }

      if (f.type === "N") {
        const rawStr = String(val).trim();
        let numStr = "";
        if (rawStr !== "" && Number.isFinite(Number(rawStr))) {
          const num = Number(rawStr);
          numStr =
            f.decimals !== undefined && f.decimals > 0
              ? num.toFixed(f.decimals)
              : String(Math.round(num));
          if (numStr.length > f.length) {
            numStr = numStr.slice(0, f.length);
          }
        }
        const padded = numStr.padStart(f.length, " ");
        for (let i = 0; i < f.length; i++) {
          bytes[colOffset + i] = padded.charCodeAt(i);
        }
      } else {
        const strVal = String(val).replace(/[\r\n]+/g, " ").trim();
        const encoded = textEncoder.encode(strVal);
        const copyLen = Math.min(f.length, encoded.length);
        for (let i = 0; i < copyLen; i++) {
          bytes[colOffset + i] = encoded[i];
        }
        for (let i = copyLen; i < f.length; i++) {
          bytes[colOffset + i] = 0x20;
        }
      }
      colOffset += f.length;
    });

    recOffset += recordLength;
  });

  bytes[totalLength - 1] = 0x1a;
  return bytes;
}

/**
 * Generates a MapInfo Professional Shapefile-backed .tab wrapper so layers open via File > Open directly.
 */
export function buildMapInfoShapefileTab(fieldDefs: ShapefileFieldDef[]): string {
  const fieldsLines = fieldDefs.map((f) => {
    if (f.type === "N") {
      return `    ${f.name} Decimal (${f.length}, ${f.decimals || 0}) ;`;
    }
    return `    ${f.name} Char (${f.length}) ;`;
  });
  return [
    "!table",
    "!version 1050",
    "!charset UTF-8",
    "",
    "Definition Table",
    '  Type SHAPEFILE Charset "UTF-8"',
    `  Fields ${fieldDefs.length}`,
    ...fieldsLines,
    ""
  ].join("\r\n");
}

/**
 * Generates a standard MapInfo Professional Georeferenced Raster .tab file (WGS84 Earth Projection 1, 104).
 */
export function buildMapInfoRasterTab(
  tifFilename: string,
  width: number,
  height: number,
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }
): string {
  return [
    "!table",
    "!version 300",
    "!charset WindowsLatin1",
    "",
    "Definition Table",
    `  File "${tifFilename}"`,
    '  Type "RASTER"',
    `  (${bounds.minLng.toFixed(8)}, ${bounds.maxLat.toFixed(8)}) (0, 0) Label "Top Left",`,
    `  (${bounds.maxLng.toFixed(8)}, ${bounds.maxLat.toFixed(8)}) (${width}, 0) Label "Top Right",`,
    `  (${bounds.maxLng.toFixed(8)}, ${bounds.minLat.toFixed(8)}) (${width}, ${height}) Label "Bottom Right",`,
    `  (${bounds.minLng.toFixed(8)}, ${bounds.minLat.toFixed(8)}) (0, ${height}) Label "Bottom Left"`,
    "  CoordSys Earth Projection 1, 104",
    '  Units "degree"',
    ""
  ].join("\r\n");
}

/**
 * Generates native MapInfo Interchange Format (.mif + .mid) files with WGS84 CoordSys
 * (Earth Projection 1, 104) so vector layers import cleanly into any version of MapInfo Pro.
 */
export function buildMapInfoMifMid(
  kind: "point" | "polyline" | "polygon",
  features: any[],
  fieldDefs: ShapefileFieldDef[]
): { mif: string; mid: string } {
  const mifHeader: string[] = [
    "Version 300",
    'Charset "WindowsLatin1"',
    'Delimiter ","',
    "CoordSys Earth Projection 1, 104",
    `Columns ${fieldDefs.length}`,
    ...fieldDefs.map((f) => {
      if (f.type === "N") {
        return f.decimals && f.decimals > 0
          ? `  ${f.name} Decimal(${f.length},${f.decimals})`
          : `  ${f.name} Integer`;
      }
      return `  ${f.name} Char(${Math.max(1, Math.min(254, f.length))})`;
    }),
    "Data",
    ""
  ];

  const mifBody: string[] = [];
  const midRows: string[] = [];

  const formatCoord = (lng: number, lat: number) =>
    `${Number.isFinite(lng) ? lng.toFixed(7) : "0"} ${Number.isFinite(lat) ? lat.toFixed(7) : "0"}`;

  features.forEach((feat, recIdx) => {
    const props = feat?.properties || {};
    const midCells = fieldDefs.map((f) => {
      let val = props[f.origKey];
      if (val === undefined || val === null) {
        val = f.origKey === "ID" ? recIdx + 1 : "";
      }
      if (f.type === "N") {
        const num = Number(val);
        if (val !== "" && Number.isFinite(num)) {
          return f.decimals && f.decimals > 0 ? num.toFixed(f.decimals) : String(Math.round(num));
        }
        return "0";
      }
      const clean = String(val)
        .replace(/[\r\n]+/g, " ")
        .replace(/"/g, '""')
        .slice(0, Math.max(1, Math.min(254, f.length)));
      return `"${clean}"`;
    });
    midRows.push(midCells.join(","));

    if (kind === "point") {
      const pt = feat as ShapefilePointFeature;
      mifBody.push(`Point ${formatCoord(pt.lng, pt.lat)}`);
      mifBody.push("    Symbol (35,16711680,10)");
    } else if (kind === "polyline") {
      const pl = feat as ShapefilePolyLineFeature;
      const validParts = (pl.parts || []).filter((p) => Array.isArray(p) && p.length >= 2);
      if (validParts.length === 0) {
        mifBody.push("None");
      } else if (validParts.length === 1) {
        const part = validParts[0];
        mifBody.push(`Pline ${part.length}`);
        part.forEach(([lng, lat]) => mifBody.push(formatCoord(lng, lat)));
        mifBody.push("    Pen (2,2,255)");
      } else {
        mifBody.push(`Pline Multiple ${validParts.length}`);
        validParts.forEach((part) => {
          mifBody.push(`  ${part.length}`);
          part.forEach(([lng, lat]) => mifBody.push(formatCoord(lng, lat)));
        });
        mifBody.push("    Pen (2,2,255)");
      }
    } else {
      const poly = feat as ShapefilePolygonFeature;
      const validRings = (poly.rings || []).filter((r) => Array.isArray(r) && r.length >= 3);
      if (validRings.length === 0) {
        mifBody.push("None");
      } else {
        mifBody.push(`Region  ${validRings.length}`);
        validRings.forEach((ring) => {
          const first = ring[0];
          const last = ring[ring.length - 1];
          const isClosed =
            Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
          const closedRing = isClosed ? ring : [...ring, first];
          mifBody.push(`  ${closedRing.length}`);
          closedRing.forEach(([lng, lat]) => mifBody.push(formatCoord(lng, lat)));
        });
        mifBody.push("    Pen (1,2,3355443)");
        mifBody.push("    Brush (2,16777215,16777215)");
      }
    }
  });

  return {
    mif: [...mifHeader, ...mifBody, ""].join("\r\n"),
    mid: midRows.length > 0 ? `${midRows.join("\r\n")}\r\n` : ""
  };
}

/**
 * Generates an ESRI ASCII Raster Grid (.asc) resampled onto uniform square WGS84 cells
 * (north-to-south row order) for universal compatibility in ArcGIS Pro/Desktop and MapInfo Pro Raster.
 * Input `grid` rows are ordered south-to-north (row 0 = minLat, row rowStep-1 = maxLat).
 */
export function buildEsriAsciiGrid(
  grid: number[][],
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  nodataValue: number = -9999
): { asc: string; ncols: number; nrows: number; cellsize: number } {
  const srcRows = grid.length;
  const srcCols = srcRows > 0 ? (grid[0]?.length || 0) : 0;
  const lngSpan = Math.max(1e-6, bounds.maxLng - bounds.minLng);
  const latSpan = Math.max(1e-6, bounds.maxLat - bounds.minLat);

  if (srcRows < 1 || srcCols < 1) {
    const emptyAsc = [
      "ncols         1",
      "nrows         1",
      `xllcorner     ${bounds.minLng.toFixed(8)}`,
      `yllcorner     ${bounds.minLat.toFixed(8)}`,
      `cellsize      ${lngSpan.toFixed(8)}`,
      `NODATA_value  ${nodataValue}`,
      `${nodataValue}`,
      ""
    ].join("\r\n");
    return { asc: emptyAsc, ncols: 1, nrows: 1, cellsize: lngSpan };
  }

  const ncols = srcCols;
  const cellsize = lngSpan / ncols;
  const nrows = Math.max(2, Math.min(600, Math.round(latSpan / cellsize)));

  const lines: string[] = [
    `ncols         ${ncols}`,
    `nrows         ${nrows}`,
    `xllcorner     ${bounds.minLng.toFixed(8)}`,
    `yllcorner     ${bounds.minLat.toFixed(8)}`,
    `cellsize      ${cellsize.toFixed(8)}`,
    `NODATA_value  ${nodataValue}`
  ];

  // Write North-to-South (top row = nrows - 1 down to 0)
  for (let outR = nrows - 1; outR >= 0; outR--) {
    const latFrac = (outR + 0.5) / nrows;
    const srcR = Math.max(0, Math.min(srcRows - 1, Math.floor(latFrac * srcRows)));
    const rowVals: string[] = new Array(ncols);
    for (let c = 0; c < ncols; c++) {
      const val = grid[srcR]?.[c];
      rowVals[c] = typeof val === "number" && Number.isFinite(val) ? val.toFixed(4) : String(nodataValue);
    }
    lines.push(rowVals.join(" "));
  }

  return {
    asc: `${lines.join("\r\n")}\r\n`,
    ncols,
    nrows,
    cellsize
  };
}

/**
 * Builds Point Shapefile (.shp and .shx, ShapeType = 1).
 */
export function buildPointShapefile(points: ShapefilePointFeature[]): {
  shp: Uint8Array;
  shx: Uint8Array;
} {
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;

  points.forEach((p) => {
    if (Number.isFinite(p.lng) && Number.isFinite(p.lat)) {
      if (p.lng < xmin) xmin = p.lng;
      if (p.lng > xmax) xmax = p.lng;
      if (p.lat < ymin) ymin = p.lat;
      if (p.lat > ymax) ymax = p.lat;
    }
  });
  if (points.length === 0 || !isFinite(xmin)) {
    xmin = ymin = xmax = ymax = 0;
  }

  const numRecords = points.length;
  const recordContentBytes = 20;
  const recordTotalBytes = 8 + recordContentBytes;
  const shpTotalBytes = 100 + numRecords * recordTotalBytes;

  const shpBuffer = new ArrayBuffer(shpTotalBytes);
  const shpView = new DataView(shpBuffer);

  shpView.setInt32(0, 9994, false);
  shpView.setInt32(24, shpTotalBytes / 2, false);
  shpView.setInt32(28, 1000, true);
  shpView.setInt32(32, 1, true);
  shpView.setFloat64(36, xmin, true);
  shpView.setFloat64(44, ymin, true);
  shpView.setFloat64(52, xmax, true);
  shpView.setFloat64(60, ymax, true);

  const shxTotalBytes = 100 + numRecords * 8;
  const shxBuffer = new ArrayBuffer(shxTotalBytes);
  const shxView = new DataView(shxBuffer);
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, shxTotalBytes / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, 1, true);
  shxView.setFloat64(36, xmin, true);
  shxView.setFloat64(44, ymin, true);
  shxView.setFloat64(52, xmax, true);
  shxView.setFloat64(60, ymax, true);

  let shpOffset = 100;
  points.forEach((p, i) => {
    const shxOffset = 100 + i * 8;
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, 10, false);

    shpView.setInt32(shpOffset, i + 1, false);
    shpView.setInt32(shpOffset + 4, 10, false);

    shpView.setInt32(shpOffset + 8, 1, true);
    shpView.setFloat64(shpOffset + 12, Number.isFinite(p.lng) ? p.lng : 0, true);
    shpView.setFloat64(shpOffset + 20, Number.isFinite(p.lat) ? p.lat : 0, true);

    shpOffset += 28;
  });

  return { shp: new Uint8Array(shpBuffer), shx: new Uint8Array(shxBuffer) };
}

/**
 * Builds PolyLine Shapefile (.shp and .shx, ShapeType = 3).
 */
export function buildPolyLineShapefile(features: ShapefilePolyLineFeature[]): {
  shp: Uint8Array;
  shx: Uint8Array;
} {
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;

  const records = features.map((feat) => {
    let fXmin = Infinity,
      fYmin = Infinity,
      fXmax = -Infinity,
      fYmax = -Infinity;
    const parts: number[] = [];
    const allPoints: [number, number][] = [];

    feat.parts.forEach((line) => {
      const validPts = line.filter(
        (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
      );
      if (validPts.length < 2) return;
      parts.push(allPoints.length);
      validPts.forEach(([x, y]) => {
        if (x < fXmin) fXmin = x;
        if (x > fXmax) fXmax = x;
        if (y < fYmin) fYmin = y;
        if (y > fYmax) fYmax = y;
        allPoints.push([x, y]);
      });
    });

    if (fXmin < xmin) xmin = fXmin;
    if (fXmax > xmax) xmax = fXmax;
    if (fYmin < ymin) ymin = fYmin;
    if (fYmax > ymax) ymax = fYmax;

    const numParts = parts.length;
    const numPoints = allPoints.length;
    const contentBytes = 44 + numParts * 4 + numPoints * 16;
    return {
      fXmin: isFinite(fXmin) ? fXmin : 0,
      fYmin: isFinite(fYmin) ? fYmin : 0,
      fXmax: isFinite(fXmax) ? fXmax : 0,
      fYmax: isFinite(fYmax) ? fYmax : 0,
      parts,
      allPoints,
      contentBytes,
      contentWords: contentBytes / 2,
    };
  });

  if (features.length === 0 || !isFinite(xmin)) {
    xmin = ymin = xmax = ymax = 0;
  }

  const totalShpBytes = 100 + records.reduce((s, r) => s + 8 + r.contentBytes, 0);
  const shpBuffer = new ArrayBuffer(totalShpBytes);
  const shpView = new DataView(shpBuffer);

  shpView.setInt32(0, 9994, false);
  shpView.setInt32(24, totalShpBytes / 2, false);
  shpView.setInt32(28, 1000, true);
  shpView.setInt32(32, 3, true); // ShapeType 3 = PolyLine
  shpView.setFloat64(36, xmin, true);
  shpView.setFloat64(44, ymin, true);
  shpView.setFloat64(52, xmax, true);
  shpView.setFloat64(60, ymax, true);

  const totalShxBytes = 100 + features.length * 8;
  const shxBuffer = new ArrayBuffer(totalShxBytes);
  const shxView = new DataView(shxBuffer);
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, totalShxBytes / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, 3, true);
  shxView.setFloat64(36, xmin, true);
  shxView.setFloat64(44, ymin, true);
  shxView.setFloat64(52, xmax, true);
  shxView.setFloat64(60, ymax, true);

  let shpOffset = 100;
  records.forEach((r, i) => {
    const shxOffset = 100 + i * 8;
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, r.contentWords, false);

    shpView.setInt32(shpOffset, i + 1, false);
    shpView.setInt32(shpOffset + 4, r.contentWords, false);

    shpView.setInt32(shpOffset + 8, 3, true); // ShapeType 3
    shpView.setFloat64(shpOffset + 12, r.fXmin, true);
    shpView.setFloat64(shpOffset + 20, r.fYmin, true);
    shpView.setFloat64(shpOffset + 28, r.fXmax, true);
    shpView.setFloat64(shpOffset + 36, r.fYmax, true);
    shpView.setInt32(shpOffset + 44, r.parts.length, true);
    shpView.setInt32(shpOffset + 48, r.allPoints.length, true);

    let partsOffset = shpOffset + 52;
    r.parts.forEach((pIdx) => {
      shpView.setInt32(partsOffset, pIdx, true);
      partsOffset += 4;
    });

    let pointsOffset = partsOffset;
    r.allPoints.forEach(([x, y]) => {
      shpView.setFloat64(pointsOffset, x, true);
      shpView.setFloat64(pointsOffset + 8, y, true);
      pointsOffset += 16;
    });

    shpOffset += 8 + r.contentBytes;
  });

  return { shp: new Uint8Array(shpBuffer), shx: new Uint8Array(shxBuffer) };
}

/**
 * Builds Polygon Shapefile (.shp and .shx, ShapeType = 5) with ESRI winding order enforced.
 */
export function buildPolygonShapefile(features: ShapefilePolygonFeature[]): {
  shp: Uint8Array;
  shx: Uint8Array;
} {
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;

  const records = features.map((feat) => {
    let fXmin = Infinity,
      fYmin = Infinity,
      fXmax = -Infinity,
      fYmax = -Infinity;
    const parts: number[] = [];
    const allPoints: [number, number][] = [];

    feat.rings.forEach((ring, rIdx) => {
      if (!ring || ring.length < 3) return;
      const isHole = feat.ringIsHole ? Boolean(feat.ringIsHole[rIdx]) : rIdx > 0;
      const normalizedRing = normalizePolygonRing(ring, isHole);
      if (!normalizedRing) return;

      parts.push(allPoints.length);
      normalizedRing.forEach(([x, y]) => {
        if (x < fXmin) fXmin = x;
        if (x > fXmax) fXmax = x;
        if (y < fYmin) fYmin = y;
        if (y > fYmax) fYmax = y;
        allPoints.push([x, y]);
      });
    });

    if (fXmin < xmin) xmin = fXmin;
    if (fXmax > xmax) xmax = fXmax;
    if (fYmin < ymin) ymin = fYmin;
    if (fYmax > ymax) ymax = fYmax;

    const numParts = parts.length;
    const numPoints = allPoints.length;
    const contentBytes = 44 + numParts * 4 + numPoints * 16;
    return {
      fXmin: isFinite(fXmin) ? fXmin : 0,
      fYmin: isFinite(fYmin) ? fYmin : 0,
      fXmax: isFinite(fXmax) ? fXmax : 0,
      fYmax: isFinite(fYmax) ? fYmax : 0,
      parts,
      allPoints,
      contentBytes,
      contentWords: contentBytes / 2,
    };
  });

  if (features.length === 0 || !isFinite(xmin)) {
    xmin = ymin = xmax = ymax = 0;
  }

  const totalShpBytes = 100 + records.reduce((s, r) => s + 8 + r.contentBytes, 0);
  const shpBuffer = new ArrayBuffer(totalShpBytes);
  const shpView = new DataView(shpBuffer);

  shpView.setInt32(0, 9994, false);
  shpView.setInt32(24, totalShpBytes / 2, false);
  shpView.setInt32(28, 1000, true);
  shpView.setInt32(32, 5, true);
  shpView.setFloat64(36, xmin, true);
  shpView.setFloat64(44, ymin, true);
  shpView.setFloat64(52, xmax, true);
  shpView.setFloat64(60, ymax, true);

  const totalShxBytes = 100 + features.length * 8;
  const shxBuffer = new ArrayBuffer(totalShxBytes);
  const shxView = new DataView(shxBuffer);
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, totalShxBytes / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, 5, true);
  shxView.setFloat64(36, xmin, true);
  shxView.setFloat64(44, ymin, true);
  shxView.setFloat64(52, xmax, true);
  shxView.setFloat64(60, ymax, true);

  let shpOffset = 100;
  records.forEach((r, i) => {
    const shxOffset = 100 + i * 8;
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, r.contentWords, false);

    shpView.setInt32(shpOffset, i + 1, false);
    shpView.setInt32(shpOffset + 4, r.contentWords, false);

    shpView.setInt32(shpOffset + 8, 5, true);
    shpView.setFloat64(shpOffset + 12, r.fXmin, true);
    shpView.setFloat64(shpOffset + 20, r.fYmin, true);
    shpView.setFloat64(shpOffset + 28, r.fXmax, true);
    shpView.setFloat64(shpOffset + 36, r.fYmax, true);
    shpView.setInt32(shpOffset + 44, r.parts.length, true);
    shpView.setInt32(shpOffset + 48, r.allPoints.length, true);

    let partsOffset = shpOffset + 52;
    r.parts.forEach((pIdx) => {
      shpView.setInt32(partsOffset, pIdx, true);
      partsOffset += 4;
    });

    let pointsOffset = partsOffset;
    r.allPoints.forEach(([x, y]) => {
      shpView.setFloat64(pointsOffset, x, true);
      shpView.setFloat64(pointsOffset + 8, y, true);
      pointsOffset += 16;
    });

    shpOffset += 8 + r.contentBytes;
  });

  return { shp: new Uint8Array(shpBuffer), shx: new Uint8Array(shxBuffer) };
}

/**
 * Splits a GeoJSON FeatureCollection into typed Shapefile feature arrays cleanly.
 */
function extractTypedFeaturesFromGeoJson(geojson: any): {
  points: ShapefilePointFeature[];
  lines: ShapefilePolyLineFeature[];
  polygons: ShapefilePolygonFeature[];
} {
  const points: ShapefilePointFeature[] = [];
  const lines: ShapefilePolyLineFeature[] = [];
  const polygons: ShapefilePolygonFeature[] = [];

  if (!geojson) return { points, lines, polygons };
  const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

  const pushGeometry = (geom: any, props: Record<string, any>) => {
    if (!geom) return;
    if (geom.type === "Point") {
      const [lng, lat] = geom.coordinates || [];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        points.push({ lng, lat, properties: props });
      }
    } else if (geom.type === "MultiPoint") {
      (geom.coordinates || []).forEach((pt: any) => {
        if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
          points.push({ lng: pt[0], lat: pt[1], properties: props });
        }
      });
    } else if (geom.type === "LineString") {
      if (Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
        lines.push({ parts: [geom.coordinates], properties: props });
      }
    } else if (geom.type === "MultiLineString") {
      const validParts = (geom.coordinates || []).filter((p: any) => Array.isArray(p) && p.length >= 2);
      if (validParts.length > 0) {
        lines.push({ parts: validParts, properties: props });
      }
    } else if (geom.type === "Polygon") {
      const rings: [number, number][][] = [];
      const ringIsHole: boolean[] = [];
      (geom.coordinates || []).forEach((ring: any, idx: number) => {
        if (Array.isArray(ring) && ring.length >= 3) {
          rings.push(ring);
          ringIsHole.push(idx > 0);
        }
      });
      if (rings.length > 0) {
        polygons.push({ rings, ringIsHole, properties: props });
      }
    } else if (geom.type === "MultiPolygon") {
      const allRings: [number, number][][] = [];
      const ringIsHole: boolean[] = [];
      (geom.coordinates || []).forEach((poly: any) => {
        (poly || []).forEach((ring: any, rIdx: number) => {
          if (Array.isArray(ring) && ring.length >= 3) {
            allRings.push(ring);
            ringIsHole.push(rIdx > 0);
          }
        });
      });
      if (allRings.length > 0) {
        polygons.push({ rings: allRings, ringIsHole, properties: props });
      }
    } else if (geom.type === "GeometryCollection") {
      (geom.geometries || []).forEach((sub: any) => pushGeometry(sub, props));
    }
  };

  features.forEach((feat: any) => {
    if (!feat) return;
    pushGeometry(feat.geometry || feat, feat.properties || {});
  });

  return { points, lines, polygons };
}

/**
 * Adds a single typed Shapefile layer (.shp, .shx, .dbf, .prj, .cpg, .tab) to an existing JSZip instance.
 */
function appendShapefileLayerToZip(
  zip: JSZip,
  cleanBase: string,
  kind: "point" | "polyline" | "polygon",
  features: any[]
): void {
  const propsList = features.map((f) => f.properties || {});
  const fieldDefs = deriveFieldDefs(propsList);
  const dbf = buildDbfBuffer(propsList, fieldDefs);

  let binary: { shp: Uint8Array; shx: Uint8Array };
  if (kind === "point") {
    binary = buildPointShapefile(features as ShapefilePointFeature[]);
  } else if (kind === "polyline") {
    binary = buildPolyLineShapefile(features as ShapefilePolyLineFeature[]);
  } else {
    binary = buildPolygonShapefile(features as ShapefilePolygonFeature[]);
  }

  zip.file(`${cleanBase}.shp`, binary.shp);
  zip.file(`${cleanBase}.shx`, binary.shx);
  zip.file(`${cleanBase}.dbf`, dbf);
  zip.file(`${cleanBase}.prj`, WGS84_PRJ);
  zip.file(`${cleanBase}.cpg`, "UTF-8\n");
  zip.file(`${cleanBase}.tab`, buildMapInfoShapefileTab(fieldDefs));
  const mifMid = buildMapInfoMifMid(kind, features, fieldDefs);
  zip.file(`${cleanBase}.mif`, mifMid.mif);
  zip.file(`${cleanBase}.mid`, mifMid.mid);
}

/**
 * Creates a complete zipped Shapefile package (.zip) from Point features.
 */
export async function createPointShapefileZip(
  points: ShapefilePointFeature[],
  baseName: string = "Groundwater_Points"
): Promise<Blob> {
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Groundwater_Points";
  const zip = new JSZip();
  appendShapefileLayerToZip(zip, cleanBase, "point", points);
  return await zip.generateAsync({ type: "blob" });
}

/**
 * Creates a complete zipped Shapefile package (.zip) from Polygon features.
 */
export async function createPolygonShapefileZip(
  polygons: ShapefilePolygonFeature[],
  baseName: string = "Groundwater_Boundary"
): Promise<Blob> {
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Groundwater_Boundary";
  const zip = new JSZip();
  appendShapefileLayerToZip(zip, cleanBase, "polygon", polygons);
  return await zip.generateAsync({ type: "blob" });
}

/**
 * Creates a complete zipped Shapefile package (.zip) from PolyLine features.
 */
export async function createPolyLineShapefileZip(
  lines: ShapefilePolyLineFeature[],
  baseName: string = "Groundwater_Contours"
): Promise<Blob> {
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Groundwater_Contours";
  const zip = new JSZip();
  appendShapefileLayerToZip(zip, cleanBase, "polyline", lines);
  return await zip.generateAsync({ type: "blob" });
}

/**
 * Converts GeoJSON into a Shapefile ZIP package (Points, PolyLines, Polygons, or mixed).
 */
export async function createShapefileFromGeoJson(
  geojson: any,
  baseName: string = "Map_Layer"
): Promise<Blob> {
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Map_Layer";
  const { points, lines, polygons } = extractTypedFeaturesFromGeoJson(geojson);

  const zip = new JSZip();
  const typeCount = (points.length > 0 ? 1 : 0) + (lines.length > 0 ? 1 : 0) + (polygons.length > 0 ? 1 : 0);

  if (typeCount === 0) {
    appendShapefileLayerToZip(zip, cleanBase, "point", []);
    return await zip.generateAsync({ type: "blob" });
  }

  if (typeCount === 1) {
    if (polygons.length > 0) appendShapefileLayerToZip(zip, cleanBase, "polygon", polygons);
    else if (lines.length > 0) appendShapefileLayerToZip(zip, cleanBase, "polyline", lines);
    else appendShapefileLayerToZip(zip, cleanBase, "point", points);
    return await zip.generateAsync({ type: "blob" });
  }

  if (polygons.length > 0) appendShapefileLayerToZip(zip, `${cleanBase}_Polygons`, "polygon", polygons);
  if (lines.length > 0) appendShapefileLayerToZip(zip, `${cleanBase}_Lines`, "polyline", lines);
  if (points.length > 0) appendShapefileLayerToZip(zip, `${cleanBase}_Stations`, "point", points);
  return await zip.generateAsync({ type: "blob" });
}

export interface GisPackageLayerInput {
  fileBaseName: string;
  geoJson: any;
}

export interface GisPackageExtraFile {
  fileName: string;
  content: Blob | Uint8Array | string;
}

/**
 * Creates a complete multi-layer ArcGIS & MapInfo GIS Package (.zip) containing all prepared vector
 * shapefiles (.shp, .shx, .dbf, .prj, .cpg, .tab), plus optional georeferenced raster & legend files.
 */
export async function createGisPackageZip(
  layers: GisPackageLayerInput[],
  extraFiles: GisPackageExtraFile[] = []
): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  const getUniqueBase = (rawName: string) => {
    let base = rawName.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 48) || "Layer";
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    let idx = 2;
    while (usedNames.has(`${base}_${idx}`)) idx++;
    const finalName = `${base}_${idx}`;
    usedNames.add(finalName);
    return finalName;
  };

  layers.forEach((layer) => {
    const { points, lines, polygons } = extractTypedFeaturesFromGeoJson(layer.geoJson);
    const typeCount = (points.length > 0 ? 1 : 0) + (lines.length > 0 ? 1 : 0) + (polygons.length > 0 ? 1 : 0);
    if (typeCount === 0) return;

    if (typeCount === 1) {
      const base = getUniqueBase(layer.fileBaseName);
      if (polygons.length > 0) appendShapefileLayerToZip(zip, base, "polygon", polygons);
      else if (lines.length > 0) appendShapefileLayerToZip(zip, base, "polyline", lines);
      else appendShapefileLayerToZip(zip, base, "point", points);
    } else {
      if (polygons.length > 0) appendShapefileLayerToZip(zip, getUniqueBase(`${layer.fileBaseName}_Poly`), "polygon", polygons);
      if (lines.length > 0) appendShapefileLayerToZip(zip, getUniqueBase(`${layer.fileBaseName}_Line`), "polyline", lines);
      if (points.length > 0) appendShapefileLayerToZip(zip, getUniqueBase(`${layer.fileBaseName}_Pt`), "point", points);
    }
  });

  extraFiles.forEach((ef) => {
    if (ef.fileName && ef.content !== undefined) {
      zip.file(ef.fileName, ef.content);
    }
  });

  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

/**
 * Downloads a Blob directly with browser filename trigger.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
