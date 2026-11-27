/**
 * OGC GeoTIFF 1.1 Scientific Float32 & Visual RGBA Writer + Universal GeoTIFF Verification Reader
 *
 * Produces strictly compliant WGS84 (EPSG:4326) GeoTIFF (.tif) files that open directly
 * in QGIS, ArcGIS Pro, ArcMap, MapInfo Pro, Global Mapper, and GDAL/OGR with zero warnings:
 *  - Float32 single-band numeric raster (SampleFormat=3, BitsPerSample=32, GDAL_NODATA="-9999")
 *    preserving exact interpolated groundwater concentrations per pixel for cross-software verification.
 *  - RGBA 4-band visual raster (SamplesPerPixel=4, ExtraSamples=2 unassociated alpha) so clipped
 *    boundary exteriors render cleanly transparent in external GIS software.
 *  - Full GeoTIFF parser powered by `geotiff` to re-import and visually/numerically verify any
 *    .tif / .tiff raster back inside the map module.
 */

import { fromArrayBuffer } from "geotiff";

export interface GeoTiffBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export interface ImportedGeoTiffLayer {
  id: string;
  name: string;
  width: number;
  height: number;
  bounds: GeoTiffBounds;
  isSingleBandNumeric: boolean;
  bands: number;
  bitsPerSample: number;
  sampleFormat: number;
  nodata: number | null;
  minVal: number;
  maxVal: number;
  epsgCode: number | null;
  description: string;
  floatValues?: Float32Array;
  rgbaBytes?: Uint8ClampedArray;
  visible: boolean;
  opacity: number;
}

interface IfdEntry {
  tag: number;
  type: number; // 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 12=DOUBLE
  count: number;
  val: number;
}

const align4 = (n: number): number => n + ((4 - (n % 4)) % 4);

const encodeAscii = (str: string): Uint8Array => {
  const clean = str.replace(/[^\x20-\x7E]/g, " ");
  const out = new Uint8Array(clean.length + 1);
  for (let i = 0; i < clean.length; i++) {
    out[i] = clean.charCodeAt(i) & 0x7f;
  }
  out[clean.length] = 0;
  return out;
};

/**
 * Standard EPSG:4326 GeoKeyDirectoryTag (34735):
 * Header: KeyDirectoryVersion=1, KeyRevision=1, MinorRevision=0, NumberOfKeys=4
 *  - 1024 GTModelTypeGeoKey     = 2 (ModelTypeGeographic)
 *  - 1025 GTRasterTypeGeoKey    = 1 (RasterPixelIsArea)
 *  - 2048 GeographicTypeGeoKey  = 4326 (GCS_WGS_84)
 *  - 2054 GeogAngularUnitsGeoKey = 9102 (Angular_Degree)
 */
const WGS84_GEO_KEYS = [
  1, 1, 0, 4,
  1024, 0, 1, 2,
  1025, 0, 1, 1,
  2048, 0, 1, 4326,
  2054, 0, 1, 9102
];

/**
 * Fast ray-casting point-in-ring test (handles standard GeoJSON [lng, lat] rings).
 */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-18) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng: number, lat: number, rings: number[][][]): boolean {
  if (!rings || rings.length === 0) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  // Exclude interior holes
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lng, lat, rings[h])) return false;
  }
  return true;
}

interface PreparedClipPolygon {
  bbox: [number, number, number, number];
  rings: number[][][];
}

function extractClipPolygons(clipGeoJson: any): PreparedClipPolygon[] {
  if (!clipGeoJson) return [];
  const rawFeatures =
    clipGeoJson.type === "FeatureCollection"
      ? clipGeoJson.features || []
      : clipGeoJson.type === "Feature"
        ? [clipGeoJson]
        : [{ type: "Feature", geometry: clipGeoJson }];

  const result: PreparedClipPolygon[] = [];

  const pushPoly = (rings: number[][][]) => {
    if (!rings || rings.length === 0 || !rings[0] || rings[0].length < 3) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of rings[0]) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
    result.push({ bbox: [minX, minY, maxX, maxY], rings });
  };

  for (const f of rawFeatures) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
      pushPoly(g.coordinates);
    } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
      for (const poly of g.coordinates) {
        if (Array.isArray(poly)) pushPoly(poly);
      }
    }
  }

  return result;
}

function isPointInsideClipPolygons(
  lng: number,
  lat: number,
  polys: PreparedClipPolygon[]
): boolean {
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i];
    if (lng < p.bbox[0] || lng > p.bbox[2] || lat < p.bbox[1] || lat > p.bbox[3]) {
      continue;
    }
    if (pointInPolygonCoords(lng, lat, p.rings)) return true;
  }
  return false;
}

/**
 * Converts a south-to-north interpolation matrix `grid[r][c]` (r=0 is minLat, r=rows-1 is maxLat)
 * into a north-to-south top-down Float32Array ready for GeoTIFF writing.
 * Pixels with NaN or outside optional `clipGeoJson` polygons are set to `nodataValue`.
 */
export function buildInterpolationFloat32Grid(
  grid: number[][],
  bounds: GeoTiffBounds,
  clipGeoJson?: any,
  nodataValue = -9999
): {
  width: number;
  height: number;
  values: Float32Array;
  validCount: number;
  minVal: number;
  maxVal: number;
} {
  const height = grid.length;
  const width = height > 0 ? grid[0]?.length || 0 : 0;
  const values = new Float32Array(width * height);
  const clipPolys = extractClipPolygons(clipGeoJson);
  const shouldClip = clipPolys.length > 0;

  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;

  let validCount = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let imgRow = 0; imgRow < height; imgRow++) {
    // Flip Y: raster row 0 = north (maxLat), which corresponds to grid[height - 1]
    const srcRow = height - 1 - imgRow;
    const cellLat = bounds.maxLat - ((imgRow + 0.5) / height) * latSpan;
    const rowArr = grid[srcRow];

    for (let col = 0; col < width; col++) {
      const idx = imgRow * width + col;
      const rawVal = rowArr ? rowArr[col] : NaN;

      if (!Number.isFinite(rawVal)) {
        values[idx] = nodataValue;
        continue;
      }

      if (shouldClip) {
        const cellLng = bounds.minLng + ((col + 0.5) / width) * lngSpan;
        if (!isPointInsideClipPolygons(cellLng, cellLat, clipPolys)) {
          values[idx] = nodataValue;
          continue;
        }
      }

      values[idx] = rawVal;
      validCount++;
      if (rawVal < minVal) minVal = rawVal;
      if (rawVal > maxVal) maxVal = rawVal;
    }
  }

  return {
    width,
    height,
    values,
    validCount,
    minVal: validCount > 0 ? minVal : 0,
    maxVal: validCount > 0 ? maxVal : 0
  };
}

/**
 * Writes a true scientific 32-bit IEEE-754 Float single-band GeoTIFF (.tif) in EPSG:4326.
 * Opens directly in QGIS, ArcGIS Pro, ArcMap, MapInfo Pro Raster, and GDAL with exact cell values
 * and automatic transparent NoData handling via GDAL_NODATA tag (42113).
 */
export function createFloat32GeoTiffBlob(
  width: number,
  height: number,
  float32Values: Float32Array | number[],
  bounds: GeoTiffBounds,
  nodataValue = -9999,
  description = "Groundwater Interpolated Surface (Float32 WGS84 EPSG:4326)"
): Blob {
  if (width <= 0 || height <= 0) {
    throw new Error("GeoTIFF dimensions must be positive integers.");
  }

  const numPixels = width * height;
  const pixelDataOffset = 8;
  const pixelDataSize = numPixels * 4;

  const tiepointsOffset = align4(pixelDataOffset + pixelDataSize);
  const tiepointsSize = 6 * 8;

  const pixelScaleOffset = tiepointsOffset + tiepointsSize;
  const pixelScaleSize = 3 * 8;

  const geoKeysOffset = pixelScaleOffset + pixelScaleSize;
  const geoKeysSize = WGS84_GEO_KEYS.length * 2;

  const xResOffset = align4(geoKeysOffset + geoKeysSize);
  const yResOffset = xResOffset + 8;

  const nodataBytes = encodeAscii(String(nodataValue));
  const nodataOffset = align4(yResOffset + 8);

  const descBytes = encodeAscii(description);
  const descOffset = align4(nodataOffset + nodataBytes.length);

  const softwareBytes = encodeAscii("HydroGIS OGC GeoTIFF 1.1 Float32 Engine");
  const softwareOffset = align4(descOffset + descBytes.length);

  const entries: IfdEntry[] = [
    { tag: 256, type: 4, count: 1, val: width }, // ImageWidth
    { tag: 257, type: 4, count: 1, val: height }, // ImageLength
    { tag: 258, type: 3, count: 1, val: 32 }, // BitsPerSample = 32
    { tag: 259, type: 3, count: 1, val: 1 }, // Compression = None
    { tag: 262, type: 3, count: 1, val: 1 }, // PhotometricInterpretation = MinIsBlack
    { tag: 270, type: 2, count: descBytes.length, val: descOffset }, // ImageDescription
    { tag: 273, type: 4, count: 1, val: pixelDataOffset }, // StripOffsets
    { tag: 277, type: 3, count: 1, val: 1 }, // SamplesPerPixel = 1
    { tag: 278, type: 4, count: 1, val: height }, // RowsPerStrip
    { tag: 279, type: 4, count: 1, val: pixelDataSize }, // StripByteCounts
    { tag: 282, type: 5, count: 1, val: xResOffset }, // XResolution
    { tag: 283, type: 5, count: 1, val: yResOffset }, // YResolution
    { tag: 284, type: 3, count: 1, val: 1 }, // PlanarConfiguration = Chunky
    { tag: 296, type: 3, count: 1, val: 2 }, // ResolutionUnit = Inch
    { tag: 305, type: 2, count: softwareBytes.length, val: softwareOffset }, // Software
    { tag: 339, type: 3, count: 1, val: 3 }, // SampleFormat = 3 (IEEE Floating Point)
    { tag: 33550, type: 12, count: 3, val: pixelScaleOffset }, // ModelPixelScaleTag
    { tag: 33922, type: 12, count: 6, val: tiepointsOffset }, // ModelTiepointTag
    { tag: 34735, type: 3, count: WGS84_GEO_KEYS.length, val: geoKeysOffset }, // GeoKeyDirectoryTag
    { tag: 42113, type: 2, count: nodataBytes.length, val: nodataOffset } // GDAL_NODATA
  ];

  entries.sort((a, b) => a.tag - b.tag);

  const ifdOffset = align4(softwareOffset + softwareBytes.length);
  const totalSize = ifdOffset + 2 + entries.length * 12 + 4;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // TIFF Header: Little-Endian 'II', Magic 42, First IFD Offset
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  // Float32 pixel payload (top-to-bottom, left-to-right)
  for (let i = 0; i < numPixels; i++) {
    const v = float32Values[i];
    view.setFloat32(pixelDataOffset + i * 4, Number.isFinite(v) ? v : nodataValue, true);
  }

  // ModelTiepointTag: pixel (0,0,0) -> (minLng, maxLat, 0)
  const tiepoints = [0.0, 0.0, 0.0, bounds.minLng, bounds.maxLat, 0.0];
  for (let i = 0; i < 6; i++) {
    view.setFloat64(tiepointsOffset + i * 8, tiepoints[i], true);
  }

  // ModelPixelScaleTag: (dx, dy, 0) in degrees/pixel
  const scaleLng = (bounds.maxLng - bounds.minLng) / width;
  const scaleLat = (bounds.maxLat - bounds.minLat) / height;
  const pixelScale = [scaleLng, scaleLat, 0.0];
  for (let i = 0; i < 3; i++) {
    view.setFloat64(pixelScaleOffset + i * 8, pixelScale[i], true);
  }

  // GeoKeyDirectoryTag
  for (let i = 0; i < WGS84_GEO_KEYS.length; i++) {
    view.setUint16(geoKeysOffset + i * 2, WGS84_GEO_KEYS[i], true);
  }

  // RATIONAL XResolution & YResolution (96/1)
  view.setUint32(xResOffset, 96, true);
  view.setUint32(xResOffset + 4, 1, true);
  view.setUint32(yResOffset, 96, true);
  view.setUint32(yResOffset + 4, 1, true);

  // ASCII payloads
  u8.set(nodataBytes, nodataOffset);
  u8.set(descBytes, descOffset);
  u8.set(softwareBytes, softwareOffset);

  // IFD table
  let cur = ifdOffset;
  view.setUint16(cur, entries.length, true);
  cur += 2;

  for (const e of entries) {
    view.setUint16(cur, e.tag, true);
    view.setUint16(cur + 2, e.type, true);
    view.setUint32(cur + 4, e.count, true);
    if (e.type === 3 && e.count === 1) {
      view.setUint16(cur + 8, e.val, true);
      view.setUint16(cur + 10, 0, true);
    } else if (e.type === 2 && e.count <= 4) {
      // Inline short ASCII string (<= 4 bytes including null)
      for (let b = 0; b < 4; b++) {
        view.setUint8(cur + 8 + b, b < e.count ? u8[e.val + b] : 0);
      }
    } else {
      view.setUint32(cur + 8, e.val, true);
    }
    cur += 12;
  }

  view.setUint32(cur, 0, true); // End of IFD chain
  return new Blob([buffer], { type: "image/tiff" });
}

/**
 * Writes a styled 4-band RGBA GeoTIFF (.tif) with transparent exterior (ExtraSamples=2).
 * Ideal for visual overlay verification in QGIS, ArcGIS Pro, and MapInfo Pro without white margins.
 */
export function createRgbaGeoTiffBlob(
  width: number,
  height: number,
  rgbaData: Uint8ClampedArray,
  bounds: GeoTiffBounds,
  description = "Groundwater Styled Interpolation Map (RGBA WGS84 EPSG:4326)"
): Blob {
  if (width <= 0 || height <= 0) {
    throw new Error("GeoTIFF dimensions must be positive integers.");
  }

  const numPixels = width * height;
  const pixelDataOffset = 8;
  const pixelDataSize = numPixels * 4;

  const tiepointsOffset = align4(pixelDataOffset + pixelDataSize);
  const tiepointsSize = 6 * 8;

  const pixelScaleOffset = tiepointsOffset + tiepointsSize;
  const pixelScaleSize = 3 * 8;

  const geoKeysOffset = pixelScaleOffset + pixelScaleSize;
  const geoKeysSize = WGS84_GEO_KEYS.length * 2;

  const bitsPerSampleOffset = align4(geoKeysOffset + geoKeysSize);
  const bitsPerSampleSize = 4 * 2;

  const xResOffset = align4(bitsPerSampleOffset + bitsPerSampleSize);
  const yResOffset = xResOffset + 8;

  const descBytes = encodeAscii(description);
  const descOffset = align4(yResOffset + 8);

  const entries: IfdEntry[] = [
    { tag: 256, type: 4, count: 1, val: width }, // ImageWidth
    { tag: 257, type: 4, count: 1, val: height }, // ImageLength
    { tag: 258, type: 3, count: 4, val: bitsPerSampleOffset }, // BitsPerSample [8,8,8,8]
    { tag: 259, type: 3, count: 1, val: 1 }, // Compression = None
    { tag: 262, type: 3, count: 1, val: 2 }, // PhotometricInterpretation = RGB
    { tag: 270, type: 2, count: descBytes.length, val: descOffset }, // ImageDescription
    { tag: 273, type: 4, count: 1, val: pixelDataOffset }, // StripOffsets
    { tag: 277, type: 3, count: 1, val: 4 }, // SamplesPerPixel = 4 (RGBA)
    { tag: 278, type: 4, count: 1, val: height }, // RowsPerStrip
    { tag: 279, type: 4, count: 1, val: pixelDataSize }, // StripByteCounts
    { tag: 282, type: 5, count: 1, val: xResOffset }, // XResolution
    { tag: 283, type: 5, count: 1, val: yResOffset }, // YResolution
    { tag: 284, type: 3, count: 1, val: 1 }, // PlanarConfiguration = Chunky
    { tag: 296, type: 3, count: 1, val: 2 }, // ResolutionUnit = Inch
    { tag: 338, type: 3, count: 1, val: 2 }, // ExtraSamples = 2 (Unassociated Alpha)
    { tag: 33550, type: 12, count: 3, val: pixelScaleOffset }, // ModelPixelScaleTag
    { tag: 33922, type: 12, count: 6, val: tiepointsOffset }, // ModelTiepointTag
    { tag: 34735, type: 3, count: WGS84_GEO_KEYS.length, val: geoKeysOffset } // GeoKeyDirectoryTag
  ];

  entries.sort((a, b) => a.tag - b.tag);

  const ifdOffset = align4(descOffset + descBytes.length);
  const totalSize = ifdOffset + 2 + entries.length * 12 + 4;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  // Copy RGBA pixels directly
  u8.set(rgbaData.subarray(0, pixelDataSize), pixelDataOffset);

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

  for (let i = 0; i < WGS84_GEO_KEYS.length; i++) {
    view.setUint16(geoKeysOffset + i * 2, WGS84_GEO_KEYS[i], true);
  }

  for (let c = 0; c < 4; c++) {
    view.setUint16(bitsPerSampleOffset + c * 2, 8, true);
  }

  view.setUint32(xResOffset, 96, true);
  view.setUint32(xResOffset + 4, 1, true);
  view.setUint32(yResOffset, 96, true);
  view.setUint32(yResOffset + 4, 1, true);

  u8.set(descBytes, descOffset);

  let cur = ifdOffset;
  view.setUint16(cur, entries.length, true);
  cur += 2;

  for (const e of entries) {
    view.setUint16(cur, e.tag, true);
    view.setUint16(cur + 2, e.type, true);
    view.setUint32(cur + 4, e.count, true);
    if (e.type === 3 && e.count === 1) {
      view.setUint16(cur + 8, e.val, true);
      view.setUint16(cur + 10, 0, true);
    } else if (e.type === 2 && e.count <= 4) {
      for (let b = 0; b < 4; b++) {
        view.setUint8(cur + 8 + b, b < e.count ? u8[e.val + b] : 0);
      }
    } else {
      view.setUint32(cur + 8, e.val, true);
    }
    cur += 12;
  }

  view.setUint32(cur, 0, true);
  return new Blob([buffer], { type: "image/tiff" });
}

/**
 * Parses any standards-compliant GeoTIFF (.tif / .tiff) — Float32, Float64, Int16, UInt8,
 * RGB, RGBA, compressed or uncompressed — for direct map overlay verification inside the GIS module.
 */
export async function parseGeoTiffArrayBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ImportedGeoTiffLayer> {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const bands = image.getSamplesPerPixel();
  const bitsPerSample = image.getBitsPerSample(0) || 8;
  const sampleFormat = image.getSampleFormat(0) || 1;
  const geoKeys = (image.getGeoKeys() || {}) as Record<string, any>;
  const fileDir = (image.getFileDirectory() || {}) as Record<string, any>;

  const epsgCode: number | null =
    typeof geoKeys.GeographicTypeGeoKey === "number"
      ? geoKeys.GeographicTypeGeoKey
      : typeof geoKeys.ProjectedCSTypeGeoKey === "number"
        ? geoKeys.ProjectedCSTypeGeoKey
        : null;

  const nodataRaw = image.getGDALNoData();
  const nodata = nodataRaw !== null && Number.isFinite(nodataRaw) ? nodataRaw : null;

  let bbox: number[];
  try {
    bbox = image.getBoundingBox();
  } catch {
    throw new Error(
      `GeoTIFF "${fileName}" is missing geographic tiepoint / pixel-scale metadata (ModelTiepointTag / ModelPixelScaleTag).`
    );
  }

  if (!bbox || bbox.length < 4 || !bbox.every(Number.isFinite)) {
    throw new Error(`GeoTIFF "${fileName}" has invalid geographic bounding box metadata.`);
  }

  const bounds: GeoTiffBounds = {
    minLng: Math.min(bbox[0], bbox[2]),
    minLat: Math.min(bbox[1], bbox[3]),
    maxLng: Math.max(bbox[0], bbox[2]),
    maxLat: Math.max(bbox[1], bbox[3])
  };

  const description =
    typeof fileDir.ImageDescription === "string"
      ? fileDir.ImageDescription.replace(/\0+$/, "").trim()
      : "";

  const rasters = await image.readRasters({ interleave: false });
  const isSingleBandNumeric = bands === 1;

  if (isSingleBandNumeric) {
    const rawBand = (rasters as any)[0] as ArrayLike<number>;
    const floatValues = new Float32Array(width * height);
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < width * height; i++) {
      const v = Number(rawBand[i]);
      const isNoData =
        !Number.isFinite(v) ||
        (nodata !== null && Math.abs(v - nodata) <= Math.max(1e-5, Math.abs(nodata) * 1e-6));
      if (isNoData) {
        floatValues[i] = NaN;
      } else {
        floatValues[i] = v;
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }

    return {
      id: `geotiff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: fileName.replace(/\.[^/.]+$/, ""),
      width,
      height,
      bounds,
      isSingleBandNumeric: true,
      bands,
      bitsPerSample,
      sampleFormat,
      nodata,
      minVal: Number.isFinite(minVal) ? minVal : 0,
      maxVal: Number.isFinite(maxVal) ? maxVal : 0,
      epsgCode,
      description,
      floatValues,
      visible: true,
      opacity: 85
    };
  }

  // Multi-band RGB / RGBA visual GeoTIFF
  const rgbaBytes = new Uint8ClampedArray(width * height * 4);
  const rBand = (rasters as any)[0] as ArrayLike<number>;
  const gBand = ((rasters as any)[1] || rBand) as ArrayLike<number>;
  const bBand = ((rasters as any)[2] || rBand) as ArrayLike<number>;
  const aBand = bands >= 4 ? ((rasters as any)[3] as ArrayLike<number>) : null;
  const scaleDiv = bitsPerSample > 8 ? Math.pow(2, bitsPerSample - 8) : 1;

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    rgbaBytes[idx] = Math.max(0, Math.min(255, Math.round(Number(rBand[i]) / scaleDiv)));
    rgbaBytes[idx + 1] = Math.max(0, Math.min(255, Math.round(Number(gBand[i]) / scaleDiv)));
    rgbaBytes[idx + 2] = Math.max(0, Math.min(255, Math.round(Number(bBand[i]) / scaleDiv)));
    rgbaBytes[idx + 3] = aBand
      ? Math.max(0, Math.min(255, Math.round(Number(aBand[i]) / scaleDiv)))
      : 255;
  }

  return {
    id: `geotiff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: fileName.replace(/\.[^/.]+$/, ""),
    width,
    height,
    bounds,
    isSingleBandNumeric: false,
    bands,
    bitsPerSample,
    sampleFormat,
    nodata,
    minVal: 0,
    maxVal: 255,
    epsgCode,
    description,
    rgbaBytes,
    visible: true,
    opacity: 85
  };
}

/**
 * Samples an imported GeoTIFF raster at a geographic (lng, lat) coordinate for interactive verification.
 */
export function sampleImportedGeoTiffValue(
  layer: ImportedGeoTiffLayer,
  lng: number,
  lat: number
): number | null {
  const { minLng, maxLng, minLat, maxLat } = layer.bounds;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return null;

  const col = Math.min(
    layer.width - 1,
    Math.max(0, Math.floor(((lng - minLng) / Math.max(1e-12, maxLng - minLng)) * layer.width))
  );
  const row = Math.min(
    layer.height - 1,
    Math.max(0, Math.floor(((maxLat - lat) / Math.max(1e-12, maxLat - minLat)) * layer.height))
  );

  if (layer.isSingleBandNumeric && layer.floatValues) {
    const val = layer.floatValues[row * layer.width + col];
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

/**
 * Scientific Viridis-inspired fallback ramp for rendering single-band Float32 GeoTIFF layers.
 */
export function defaultScientificColorRamp(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [13, 148, 136], // Teal (low)
    [34, 197, 94],  // Emerald
    [234, 179, 8],  // Amber
    [249, 115, 22], // Orange
    [220, 38, 38]   // Crimson (high)
  ];
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const c0 = stops[idx];
  const c1 = stops[idx + 1];
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * frac),
    Math.round(c0[1] + (c1[1] - c0[1]) * frac),
    Math.round(c0[2] + (c1[2] - c0[2]) * frac)
  ];
}

/**
 * Renders an ImportedGeoTiffLayer onto an offscreen canvas ready to draw on the GIS map.
 */
export function buildImportedGeoTiffCanvas(
  layer: ImportedGeoTiffLayer,
  customColorFn?: (val: number) => [number, number, number]
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imgData = ctx.createImageData(layer.width, layer.height);
  const out = imgData.data;

  if (layer.isSingleBandNumeric && layer.floatValues) {
    const span = Math.max(1e-9, layer.maxVal - layer.minVal);
    for (let i = 0; i < layer.floatValues.length; i++) {
      const v = layer.floatValues[i];
      const p = i * 4;
      if (!Number.isFinite(v)) {
        out[p + 3] = 0;
        continue;
      }
      const [r, g, b] = customColorFn
        ? customColorFn(v)
        : defaultScientificColorRamp((v - layer.minVal) / span);
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = 255;
    }
  } else if (layer.rgbaBytes) {
    out.set(layer.rgbaBytes.subarray(0, out.length));
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
