import JSZip from "jszip";

/**
 * ESRI Shapefile Generator (Pure TypeScript)
 * Compliant with ESRI Shapefile Technical Description (July 1998)
 * Generates .shp, .shx, .dbf, .prj, .cpg bundled inside a standard .zip archive.
 */

export interface ShapefileFieldDef {
  name: string; // Max 10 chars, uppercase ASCII
  type: "C" | "N"; // Character or Numeric
  length: number; // Bytes in DBF (max 254)
  decimals?: number; // Decimal places for N
}

export interface ShapefilePointFeature {
  lng: number;
  lat: number;
  properties: Record<string, any>;
}

export interface ShapefilePolygonFeature {
  rings: [number, number][][]; // Each ring is an array of [lng, lat]
  properties: Record<string, any>;
}

const WGS84_PRJ = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;

/**
 * Sanitizes field names to fit dBASE 10-character limit and valid characters.
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
    candidate = clean.slice(0, 10 - suffix.length) + suffix;
    counter++;
  }
  existingNames.add(candidate);
  return candidate;
}

/**
 * Derives DBF field definitions from record properties.
 */
function deriveFieldDefs(propertiesList: Record<string, any>[]): {
  fieldDefs: ShapefileFieldDef[];
  keyMap: Record<string, string>;
} {
  const existingNames = new Set<string>();
  const fieldDefs: ShapefileFieldDef[] = [];
  const keyMap: Record<string, string> = {}; // originalKey -> sanitizedKey

  if (propertiesList.length === 0) {
    const idDef: ShapefileFieldDef = { name: "ID", type: "N", length: 10, decimals: 0 };
    return { fieldDefs: [idDef], keyMap: { ID: "ID" } };
  }

  // Collect all unique keys
  const allKeys: string[] = [];
  propertiesList.forEach((props) => {
    Object.keys(props).forEach((k) => {
      if (!allKeys.includes(k)) allKeys.push(k);
    });
  });

  allKeys.forEach((key) => {
    const sanitized = sanitizeFieldName(key, existingNames);
    keyMap[key] = sanitized;

    // Detect type and max length
    let isNumeric = true;
    let maxLen = 0;
    let hasDecimals = false;
    let maxDecimals = 0;

    let sampleCount = 0;
    propertiesList.forEach((props) => {
      const val = props[key];
      if (val !== undefined && val !== null && val !== "") {
        sampleCount++;
        const str = String(val);
        if (str.length > maxLen) maxLen = str.length;
        if (typeof val === "number" || (!isNaN(Number(val)) && !isNaN(parseFloat(str)))) {
          if (str.includes(".")) {
            hasDecimals = true;
            const decLen = str.split(".")[1]?.length || 0;
            if (decLen > maxDecimals) maxDecimals = Math.min(6, decLen);
          }
        } else {
          isNumeric = false;
        }
      }
    });

    if (sampleCount === 0 || !isNumeric) {
      fieldDefs.push({
        name: sanitized,
        type: "C",
        length: Math.max(10, Math.min(254, maxLen || 50)),
      });
    } else {
      fieldDefs.push({
        name: sanitized,
        type: "N",
        length: Math.max(12, Math.min(20, maxLen + 2)),
        decimals: hasDecimals ? Math.max(2, maxDecimals) : 0,
      });
    }
  });

  return { fieldDefs, keyMap };
}

/**
 * Builds the binary dBASE III (.dbf) buffer.
 */
function buildDbfBuffer(
  records: Record<string, any>[],
  fieldDefs: ShapefileFieldDef[],
  keyMap: Record<string, string>
): Uint8Array {
  const numRecords = records.length;
  const numFields = fieldDefs.length;
  const headerLength = 32 + numFields * 32 + 1;
  const recordLength = 1 + fieldDefs.reduce((sum, f) => sum + f.length, 0);
  const totalLength = headerLength + numRecords * recordLength + 1; // +1 for 0x1A terminator

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // DBF Header
  view.setUint8(0, 0x03); // dBASE III without memo
  const now = new Date();
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, numRecords, true); // Number of records LE
  view.setUint16(8, headerLength, true); // Header length LE
  view.setUint16(10, recordLength, true); // Record length LE

  // Field Descriptors
  let fieldOffset = 32;
  const encoder = new TextEncoder();
  fieldDefs.forEach((f) => {
    const nameBytes = encoder.encode(f.name.slice(0, 10).toUpperCase());
    for (let i = 0; i < 11; i++) {
      bytes[fieldOffset + i] = i < nameBytes.length ? nameBytes[i] : 0;
    }
    bytes[fieldOffset + 11] = f.type.charCodeAt(0);
    bytes[fieldOffset + 16] = f.length;
    bytes[fieldOffset + 17] = f.decimals || 0;
    fieldOffset += 32;
  });

  bytes[headerLength - 1] = 0x0d; // Header terminator

  // Data Records
  let recOffset = headerLength;
  records.forEach((rec) => {
    bytes[recOffset] = 0x20; // 0x20 = Valid record (not deleted)
    let colOffset = recOffset + 1;

    fieldDefs.forEach((f) => {
      // Find original key corresponding to this sanitized field name
      const origKey = Object.keys(keyMap).find((k) => keyMap[k] === f.name) || f.name;
      let val = rec[origKey];
      if (val === undefined || val === null) val = "";

      let strVal = String(val).trim();
      if (f.type === "N") {
        if (strVal === "" || isNaN(Number(strVal))) {
          strVal = "".padStart(f.length, " ");
        } else {
          const num = Number(strVal);
          strVal = f.decimals !== undefined && f.decimals > 0 ? num.toFixed(f.decimals) : String(Math.round(num));
          strVal = strVal.slice(0, f.length).padStart(f.length, " ");
        }
      } else {
        strVal = strVal.slice(0, f.length).padEnd(f.length, " ");
      }

      const valBytes = encoder.encode(strVal);
      for (let i = 0; i < f.length; i++) {
        bytes[colOffset + i] = i < valBytes.length ? valBytes[i] : 0x20;
      }
      colOffset += f.length;
    });

    recOffset += recordLength;
  });

  bytes[totalLength - 1] = 0x1a; // EOF
  return bytes;
}

/**
 * Builds Point Shapefile (.shp and .shx).
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
    if (p.lng < xmin) xmin = p.lng;
    if (p.lng > xmax) xmax = p.lng;
    if (p.lat < ymin) ymin = p.lat;
    if (p.lat > ymax) ymax = p.lat;
  });
  if (points.length === 0 || !isFinite(xmin)) {
    xmin = ymin = xmax = ymax = 0;
  }

  const numRecords = points.length;
  const recordContentBytes = 20; // 4 (type) + 8 (X) + 8 (Y)
  const recordTotalBytes = 8 + recordContentBytes; // 28 bytes
  const shpTotalBytes = 100 + numRecords * recordTotalBytes;

  const shpBuffer = new ArrayBuffer(shpTotalBytes);
  const shpView = new DataView(shpBuffer);

  // 100-byte SHP Header
  shpView.setInt32(0, 9994, false); // File code Big Endian
  shpView.setInt32(24, shpTotalBytes / 2, false); // File length in 16-bit words BE
  shpView.setInt32(28, 1000, true); // Version Little Endian
  shpView.setInt32(32, 1, true); // Point ShapeType = 1 LE
  shpView.setFloat64(36, xmin, true);
  shpView.setFloat64(44, ymin, true);
  shpView.setFloat64(52, xmax, true);
  shpView.setFloat64(60, ymax, true);

  // 100-byte SHX Header
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
    // SHX record (offset in 16-bit words BE, content length in 16-bit words BE)
    const shxOffset = 100 + i * 8;
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, 10, false); // 20 bytes / 2 = 10 words

    // SHP record header
    shpView.setInt32(shpOffset, i + 1, false); // Record number 1-based BE
    shpView.setInt32(shpOffset + 4, 10, false); // Content length in words BE

    // SHP record content
    shpView.setInt32(shpOffset + 8, 1, true); // ShapeType 1 LE
    shpView.setFloat64(shpOffset + 12, p.lng, true); // X LE
    shpView.setFloat64(shpOffset + 20, p.lat, true); // Y LE

    shpOffset += 28;
  });

  return { shp: new Uint8Array(shpBuffer), shx: new Uint8Array(shxBuffer) };
}

/**
 * Builds Polygon Shapefile (.shp and .shx).
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

    feat.rings.forEach((ring) => {
      if (!ring || ring.length < 3) return;
      parts.push(allPoints.length);

      // Ensure ring is closed
      const first = ring[0];
      const last = ring[ring.length - 1];
      const isClosed = first && last && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
      const normalizedRing = isClosed ? ring : [...ring, first];

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
    // 4 (shapeType) + 32 (box) + 4 (numParts) + 4 (numPoints) + (numParts * 4) + (numPoints * 16)
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
  shpView.setInt32(32, 5, true); // ShapeType 5 = Polygon
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
    // SHX
    const shxOffset = 100 + i * 8;
    shxView.setInt32(shxOffset, shpOffset / 2, false);
    shxView.setInt32(shxOffset + 4, r.contentWords, false);

    // SHP Record Header
    shpView.setInt32(shpOffset, i + 1, false);
    shpView.setInt32(shpOffset + 4, r.contentWords, false);

    // Polygon Record Content
    shpView.setInt32(shpOffset + 8, 5, true); // ShapeType 5
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
 * Creates a complete zipped Shapefile package (.zip) from Point features.
 */
export async function createPointShapefileZip(
  points: ShapefilePointFeature[],
  baseName: string = "Groundwater_Points"
): Promise<Blob> {
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Groundwater_Points";
  const { shp, shx } = buildPointShapefile(points);

  const propertiesList = points.map((p) => p.properties || {});
  const { fieldDefs, keyMap } = deriveFieldDefs(propertiesList);
  const dbf = buildDbfBuffer(propertiesList, fieldDefs, keyMap);

  const zip = new JSZip();
  zip.file(`${cleanBase}.shp`, shp);
  zip.file(`${cleanBase}.shx`, shx);
  zip.file(`${cleanBase}.dbf`, dbf);
  zip.file(`${cleanBase}.prj`, WGS84_PRJ);
  zip.file(`${cleanBase}.cpg`, "UTF-8\n");

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
  const { shp, shx } = buildPolygonShapefile(polygons);

  const propertiesList = polygons.map((p) => p.properties || {});
  const { fieldDefs, keyMap } = deriveFieldDefs(propertiesList);
  const dbf = buildDbfBuffer(propertiesList, fieldDefs, keyMap);

  const zip = new JSZip();
  zip.file(`${cleanBase}.shp`, shp);
  zip.file(`${cleanBase}.shx`, shx);
  zip.file(`${cleanBase}.dbf`, dbf);
  zip.file(`${cleanBase}.prj`, WGS84_PRJ);
  zip.file(`${cleanBase}.cpg`, "UTF-8\n");

  return await zip.generateAsync({ type: "blob" });
}

/**
 * Converts GeoJSON into Shapefile ZIP package (Points or Polygons).
 */
export async function createShapefileFromGeoJson(
  geojson: any,
  baseName: string = "Map_Layer"
): Promise<Blob> {
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "Map_Layer";
  const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

  // Detect whether features are Polygons or Points
  const polygonFeatures: ShapefilePolygonFeature[] = [];
  const pointFeatures: ShapefilePointFeature[] = [];

  features.forEach((feat: any) => {
    const geom = feat.geometry;
    if (!geom) return;
    const props = feat.properties || {};

    if (geom.type === "Point") {
      const [lng, lat] = geom.coordinates;
      pointFeatures.push({ lng, lat, properties: props });
    } else if (geom.type === "Polygon") {
      polygonFeatures.push({ rings: geom.coordinates, properties: props });
    } else if (geom.type === "MultiPolygon") {
      // MultiPolygon has array of polygons
      const allRings: [number, number][][] = [];
      geom.coordinates.forEach((poly: any) => {
        poly.forEach((ring: any) => allRings.push(ring));
      });
      polygonFeatures.push({ rings: allRings, properties: props });
    }
  });

  if (polygonFeatures.length > 0 && pointFeatures.length === 0) {
    return await createPolygonShapefileZip(polygonFeatures, cleanBase);
  } else if (pointFeatures.length > 0 && polygonFeatures.length === 0) {
    return await createPointShapefileZip(pointFeatures, cleanBase);
  } else if (polygonFeatures.length > 0 && pointFeatures.length > 0) {
    // Both: bundle both sub-shapefiles in the same zip archive!
    const zip = new JSZip();

    // 1. Points
    const ptBase = `${cleanBase}_Stations`;
    const { shp: ptShp, shx: ptShx } = buildPointShapefile(pointFeatures);
    const ptProps = pointFeatures.map((p) => p.properties || {});
    const { fieldDefs: ptFields, keyMap: ptKeyMap } = deriveFieldDefs(ptProps);
    const ptDbf = buildDbfBuffer(ptProps, ptFields, ptKeyMap);
    zip.file(`${ptBase}.shp`, ptShp);
    zip.file(`${ptBase}.shx`, ptShx);
    zip.file(`${ptBase}.dbf`, ptDbf);
    zip.file(`${ptBase}.prj`, WGS84_PRJ);
    zip.file(`${ptBase}.cpg`, "UTF-8\n");

    // 2. Polygons
    const polyBase = `${cleanBase}_Boundaries`;
    const { shp: polyShp, shx: polyShx } = buildPolygonShapefile(polygonFeatures);
    const polyProps = polygonFeatures.map((p) => p.properties || {});
    const { fieldDefs: polyFields, keyMap: polyKeyMap } = deriveFieldDefs(polyProps);
    const polyDbf = buildDbfBuffer(polyProps, polyFields, polyKeyMap);
    zip.file(`${polyBase}.shp`, polyShp);
    zip.file(`${polyBase}.shx`, polyShx);
    zip.file(`${polyBase}.dbf`, polyDbf);
    zip.file(`${polyBase}.prj`, WGS84_PRJ);
    zip.file(`${polyBase}.cpg`, "UTF-8\n");

    return await zip.generateAsync({ type: "blob" });
  }

  // Fallback empty point shapefile
  return await createPointShapefileZip([], cleanBase);
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
