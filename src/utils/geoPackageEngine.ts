/**
 * OGC GeoPackage 1.3.1 (.gpkg) Writer & Verification Reader
 *
 * Produces 100% standards-compliant OGC GeoPackage SQLite databases (.gpkg) that open directly
 * in QGIS, ArcGIS Pro, ArcMap, MapInfo Pro, Global Mapper, and GDAL/OGR:
 *  - SQLite header magic: application_id = 0x47504B47 ("GPKG" = 1196444487), user_version = 10301 (v1.3.1)
 *  - Required OGC metadata tables: gpkg_spatial_ref_sys (-1, 0, 4326), gpkg_contents, gpkg_geometry_columns
 *  - Standard GeoPackage Binary (GPB) geometry header ('GP' + version + flags + srs_id + XY envelope)
 *    followed by ISO Well-Known Binary (WKB) for Point, MultiPoint, LineString, MultiLineString,
 *    Polygon, MultiPolygon, and GeometryCollection
 *  - Full-length UTF-8 attribute columns (no 10-character DBF truncation!)
 *  - Complete .gpkg reader to re-import and verify exported or external GeoPackages directly in the map module
 */

import initSqlJs, { SqlJsStatic } from "sql.js";

export interface GeoPackageLayerInput {
  tableName: string;
  identifier?: string;
  description?: string;
  geoJson: any; // GeoJSON FeatureCollection or Feature
  srsId?: number;
}

export interface ParsedGeoPackageLayer {
  tableName: string;
  identifier: string;
  description: string;
  geometryType: string;
  srsId: number;
  featureCount: number;
  bounds: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  geoJson: {
    type: "FeatureCollection";
    features: any[];
  };
}

export interface ParsedGeoPackageResult {
  fileName: string;
  applicationId: number;
  userVersion: number;
  isValidGpkgSignature: boolean;
  layers: ParsedGeoPackageLayer[];
}

// Singleton SQL.js loader that works seamlessly in both Vite (browser) and Node.js (unit tests)
let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const isBrowser = typeof window !== "undefined";
    sqlJsPromise = initSqlJs(
      isBrowser
        ? {
            locateFile: (file: string) => {
              const base = (import.meta as any).env?.BASE_URL || "/";
              const normalizedBase = base.endsWith("/") ? base : `${base}/`;
              return `${normalizedBase}${file}`;
            }
          }
        : undefined
    );
  }
  return sqlJsPromise;
}

const WGS84_OGC_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AXIS["Latitude",NORTH],AXIS["Longitude",EAST],AUTHORITY["EPSG","4326"]]';

/**
 * Sanitizes SQLite table/column identifiers safely (prevents SQL injection and reserved keyword conflicts).
 */
export function sanitizeSqlIdentifier(raw: string, fallback = "col"): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+/, "")
    .replace(/_+/g, "_");
  if (!cleaned) return fallback;
  if (/^[0-9]/.test(cleaned)) return `f_${cleaned}`;
  return cleaned.slice(0, 60);
}

const quoteIdent = (ident: string): string => `"${ident.replace(/"/g, '""')}"`;

// ============================================================================
// ISO Well-Known Binary (WKB) + OGC GeoPackage Binary (GPB) Codec
// ============================================================================

function computeGeometryBbox(geom: any): [number, number, number, number] | null {
  if (!geom) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords: any) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0];
      const y = coords[1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return;
    }
    for (let i = 0; i < coords.length; i++) {
      visit(coords[i]);
    }
  };

  if (geom.type === "GeometryCollection" && Array.isArray(geom.geometries)) {
    for (const g of geom.geometries) {
      const b = computeGeometryBbox(g);
      if (b) {
        if (b[0] < minX) minX = b[0];
        if (b[1] < minY) minY = b[1];
        if (b[2] > maxX) maxX = b[2];
        if (b[3] > maxY) maxY = b[3];
      }
    }
  } else {
    visit(geom.coordinates);
  }

  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private totalLength = 0;

  writeUint8(val: number) {
    const b = new Uint8Array(1);
    b[0] = val & 0xff;
    this.chunks.push(b);
    this.totalLength += 1;
  }

  writeUint32LE(val: number) {
    const b = new ArrayBuffer(4);
    new DataView(b).setUint32(0, val >>> 0, true);
    this.chunks.push(new Uint8Array(b));
    this.totalLength += 4;
  }

  writeInt32LE(val: number) {
    const b = new ArrayBuffer(4);
    new DataView(b).setInt32(0, val | 0, true);
    this.chunks.push(new Uint8Array(b));
    this.totalLength += 4;
  }

  writeFloat64LE(val: number) {
    const b = new ArrayBuffer(8);
    new DataView(b).setFloat64(0, val, true);
    this.chunks.push(new Uint8Array(b));
    this.totalLength += 8;
  }

  writeBytes(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.totalLength += bytes.length;
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

function writeWkbGeometry(writer: BinaryWriter, geom: any) {
  if (!geom || !geom.type) {
    throw new Error("Cannot encode empty or untyped GeoJSON geometry to WKB.");
  }

  // Byte order: 1 = NDR (Little Endian)
  writer.writeUint8(1);

  switch (geom.type) {
    case "Point": {
      writer.writeUint32LE(1);
      const c = geom.coordinates || [0, 0];
      writer.writeFloat64LE(Number(c[0]) || 0);
      writer.writeFloat64LE(Number(c[1]) || 0);
      break;
    }
    case "LineString": {
      writer.writeUint32LE(2);
      const pts: number[][] = geom.coordinates || [];
      writer.writeUint32LE(pts.length);
      for (const p of pts) {
        writer.writeFloat64LE(Number(p[0]) || 0);
        writer.writeFloat64LE(Number(p[1]) || 0);
      }
      break;
    }
    case "Polygon": {
      writer.writeUint32LE(3);
      const rings: number[][][] = geom.coordinates || [];
      writer.writeUint32LE(rings.length);
      for (const ring of rings) {
        // Ensure closed linear ring for strict OGC WKB compliance
        const closed =
          ring.length > 0 &&
          (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
            ? [...ring, ring[0]]
            : ring;
        writer.writeUint32LE(closed.length);
        for (const p of closed) {
          writer.writeFloat64LE(Number(p[0]) || 0);
          writer.writeFloat64LE(Number(p[1]) || 0);
        }
      }
      break;
    }
    case "MultiPoint": {
      writer.writeUint32LE(4);
      const pts: number[][] = geom.coordinates || [];
      writer.writeUint32LE(pts.length);
      for (const p of pts) {
        writeWkbGeometry(writer, { type: "Point", coordinates: p });
      }
      break;
    }
    case "MultiLineString": {
      writer.writeUint32LE(5);
      const lines: number[][][] = geom.coordinates || [];
      writer.writeUint32LE(lines.length);
      for (const line of lines) {
        writeWkbGeometry(writer, { type: "LineString", coordinates: line });
      }
      break;
    }
    case "MultiPolygon": {
      writer.writeUint32LE(6);
      const polys: number[][][][] = geom.coordinates || [];
      writer.writeUint32LE(polys.length);
      for (const poly of polys) {
        writeWkbGeometry(writer, { type: "Polygon", coordinates: poly });
      }
      break;
    }
    case "GeometryCollection": {
      writer.writeUint32LE(7);
      const geoms: any[] = geom.geometries || [];
      writer.writeUint32LE(geoms.length);
      for (const sub of geoms) {
        writeWkbGeometry(writer, sub);
      }
      break;
    }
    default:
      throw new Error(`Unsupported GeoJSON geometry type for GeoPackage: ${geom.type}`);
  }
}

/**
 * Encodes a GeoJSON geometry into an OGC GeoPackage Binary (GPB) byte array:
 *  - Magic "GP" (0x47, 0x50)
 *  - Version = 0
 *  - Flags = 0x03 (little-endian + XY envelope [minX, maxX, minY, maxY]) or 0x01 if no envelope
 *  - srs_id (int32 LE, default 4326)
 *  - Envelope (4 x float64 LE when flags envelope=1)
 *  - Standard ISO WKB geometry
 */
export function encodeGpkgGeometry(geometry: any, srsId = 4326): Uint8Array {
  const writer = new BinaryWriter();
  const bbox = computeGeometryBbox(geometry);

  // Magic "GP"
  writer.writeUint8(0x47);
  writer.writeUint8(0x50);
  // Version 0
  writer.writeUint8(0x00);

  if (bbox) {
    // Flags: bit 0 = 1 (LE), bits 1..3 = 1 (XY envelope => 0b00000011 = 0x03)
    writer.writeUint8(0x03);
    writer.writeInt32LE(srsId);
    // OGC GPB Envelope order: minX, maxX, minY, maxY
    writer.writeFloat64LE(bbox[0]);
    writer.writeFloat64LE(bbox[2]);
    writer.writeFloat64LE(bbox[1]);
    writer.writeFloat64LE(bbox[3]);
  } else {
    // Empty geometry flag (bit 4 = 1, bit 0 = 1 => 0x11)
    writer.writeUint8(0x11);
    writer.writeInt32LE(srsId);
  }

  writeWkbGeometry(writer, geometry);
  return writer.toUint8Array();
}

function readWkbAt(view: DataView, state: { offset: number }): any {
  if (state.offset + 5 > view.byteLength) return null;
  const byteOrder = view.getUint8(state.offset);
  state.offset += 1;
  const le = byteOrder === 1;

  let rawType = view.getUint32(state.offset, le);
  state.offset += 4;

  // Handle EWKB SRID flag (0x20000000) & Z/M flags if encountered from external tools
  let hasZ = false;
  let hasM = false;
  if ((rawType & 0x80000000) !== 0) hasZ = true;
  if ((rawType & 0x40000000) !== 0) hasM = true;
  const hasSrid = (rawType & 0x20000000) !== 0;
  rawType = rawType & 0x0fffffff;

  if (rawType >= 3000) {
    hasZ = true;
    hasM = true;
    rawType -= 3000;
  } else if (rawType >= 2000) {
    hasM = true;
    rawType -= 2000;
  } else if (rawType >= 1000) {
    hasZ = true;
    rawType -= 1000;
  }

  if (hasSrid) {
    state.offset += 4; // skip SRID
  }

  const readCoord = (): number[] => {
    const x = view.getFloat64(state.offset, le);
    const y = view.getFloat64(state.offset + 8, le);
    state.offset += 16;
    if (hasZ) state.offset += 8;
    if (hasM) state.offset += 8;
    return [x, y];
  };

  switch (rawType) {
    case 1: {
      return { type: "Point", coordinates: readCoord() };
    }
    case 2: {
      const n = view.getUint32(state.offset, le);
      state.offset += 4;
      const coords: number[][] = [];
      for (let i = 0; i < n; i++) coords.push(readCoord());
      return { type: "LineString", coordinates: coords };
    }
    case 3: {
      const numRings = view.getUint32(state.offset, le);
      state.offset += 4;
      const rings: number[][][] = [];
      for (let r = 0; r < numRings; r++) {
        const n = view.getUint32(state.offset, le);
        state.offset += 4;
        const ring: number[][] = [];
        for (let i = 0; i < n; i++) ring.push(readCoord());
        rings.push(ring);
      }
      return { type: "Polygon", coordinates: rings };
    }
    case 4: {
      const n = view.getUint32(state.offset, le);
      state.offset += 4;
      const coords: number[][] = [];
      for (let i = 0; i < n; i++) {
        const pt = readWkbAt(view, state);
        if (pt?.coordinates) coords.push(pt.coordinates);
      }
      return { type: "MultiPoint", coordinates: coords };
    }
    case 5: {
      const n = view.getUint32(state.offset, le);
      state.offset += 4;
      const lines: number[][][] = [];
      for (let i = 0; i < n; i++) {
        const ls = readWkbAt(view, state);
        if (ls?.coordinates) lines.push(ls.coordinates);
      }
      return { type: "MultiLineString", coordinates: lines };
    }
    case 6: {
      const n = view.getUint32(state.offset, le);
      state.offset += 4;
      const polys: number[][][][] = [];
      for (let i = 0; i < n; i++) {
        const poly = readWkbAt(view, state);
        if (poly?.coordinates) polys.push(poly.coordinates);
      }
      return { type: "MultiPolygon", coordinates: polys };
    }
    case 7: {
      const n = view.getUint32(state.offset, le);
      state.offset += 4;
      const geometries: any[] = [];
      for (let i = 0; i < n; i++) {
        const sub = readWkbAt(view, state);
        if (sub) geometries.push(sub);
      }
      return { type: "GeometryCollection", geometries };
    }
    default:
      return null;
  }
}

/**
 * Decodes an OGC GeoPackage Binary (GPB) blob into a GeoJSON geometry object.
 */
export function decodeGpkgGeometry(bytes: Uint8Array): any | null {
  if (!bytes || bytes.byteLength < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check magic "GP" (0x47, 0x50)
  if (view.getUint8(0) !== 0x47 || view.getUint8(1) !== 0x50) {
    // Fallback: try direct WKB if a non-GPB table stores raw WKB
    return readWkbAt(view, { offset: 0 });
  }

  const flags = view.getUint8(3);
  const isEmpty = ((flags >> 4) & 0x01) === 1;
  if (isEmpty) return null;

  const envelopeIndicator = (flags >> 1) & 0x07;
  const envelopeByteLengths: Record<number, number> = {
    0: 0,
    1: 32, // XY (4 doubles)
    2: 48, // XYZ (6 doubles)
    3: 48, // XYM (6 doubles)
    4: 64  // XYZM (8 doubles)
  };
  const envBytes = envelopeByteLengths[envelopeIndicator];
  if (envBytes === undefined) return null;

  const wkbStart = 8 + envBytes;
  if (wkbStart >= bytes.byteLength) return null;

  return readWkbAt(view, { offset: wkbStart });
}

function inferGpkgGeometryTypeName(features: any[]): string {
  const types = new Set<string>();
  for (const f of features) {
    const t = f?.geometry?.type;
    if (typeof t === "string") types.add(t.toUpperCase());
  }
  if (types.size === 0) return "GEOMETRY";
  if (types.size === 1) return Array.from(types)[0];
  if (types.has("POLYGON") && types.has("MULTIPOLYGON") && types.size === 2) return "MULTIPOLYGON";
  if (types.has("LINESTRING") && types.has("MULTILINESTRING") && types.size === 2) return "MULTILINESTRING";
  if (types.has("POINT") && types.has("MULTIPOINT") && types.size === 2) return "MULTIPOINT";
  return "GEOMETRY";
}

function inferSqliteColumnType(values: any[]): "INTEGER" | "REAL" | "TEXT" {
  let hasNumeric = false;
  let hasFloat = false;
  let hasText = false;

  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "boolean") {
      hasNumeric = true;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      hasNumeric = true;
      if (!Number.isInteger(v)) hasFloat = true;
    } else {
      hasText = true;
      break;
    }
  }

  if (hasText || !hasNumeric) return "TEXT";
  return hasFloat ? "REAL" : "INTEGER";
}

/**
 * Generates a 100% OGC GeoPackage 1.3.1 (.gpkg) binary Blob containing one or more vector layers.
 */
export async function createGeoPackageBlob(layers: GeoPackageLayerInput[]): Promise<Blob> {
  if (!layers || layers.length === 0) {
    throw new Error("At least one vector layer is required to create a GeoPackage (.gpkg).");
  }

  const SQL = await getSqlJs();
  const db = new SQL.Database();

  try {
    // 1. OGC GeoPackage 1.3.1 SQLite header signatures
    //    0x47504B47 = 1196444487 ("GPKG"), user_version = 10301 (GeoPackage 1.3.1)
    db.run("PRAGMA application_id = 1196444487;");
    db.run("PRAGMA user_version = 10301;");

    // 2. Required OGC GeoPackage metadata tables
    db.run(`
      CREATE TABLE gpkg_spatial_ref_sys (
        srs_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL PRIMARY KEY,
        organization TEXT NOT NULL,
        organization_coordsys_id INTEGER NOT NULL,
        definition TEXT NOT NULL,
        description TEXT
      );
    `);

    db.run(`
      CREATE TABLE gpkg_contents (
        table_name TEXT NOT NULL PRIMARY KEY,
        data_type TEXT NOT NULL,
        identifier TEXT UNIQUE,
        description TEXT DEFAULT '',
        last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        min_x DOUBLE,
        min_y DOUBLE,
        max_x DOUBLE,
        max_y DOUBLE,
        srs_id INTEGER,
        CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
      );
    `);

    db.run(`
      CREATE TABLE gpkg_geometry_columns (
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL,
        geometry_type_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL,
        z TINYINT NOT NULL,
        m TINYINT NOT NULL,
        CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
        CONSTRAINT uk_gc_table_name UNIQUE (table_name),
        CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
        CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
      );
    `);

    // 3. Seed mandatory OGC spatial reference systems (-1, 0, 4326 WGS84)
    const insertSrs = db.prepare(
      `INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description) VALUES (?, ?, ?, ?, ?, ?);`
    );
    insertSrs.run([
      "Undefined cartesian SRS",
      -1,
      "NONE",
      -1,
      "undefined",
      "undefined cartesian coordinate reference system"
    ]);
    insertSrs.run([
      "Undefined geographic SRS",
      0,
      "NONE",
      0,
      "undefined",
      "undefined geographic coordinate reference system"
    ]);
    insertSrs.run([
      "WGS 84 geodetic",
      4326,
      "EPSG",
      4326,
      WGS84_OGC_WKT,
      "longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid"
    ]);
    insertSrs.free();

    const usedTableNames = new Set<string>();
    const isoNow = new Date().toISOString();

    for (let lIdx = 0; lIdx < layers.length; lIdx++) {
      const layer = layers[lIdx];
      const gj = layer.geoJson;
      const rawFeatures: any[] =
        gj?.type === "FeatureCollection"
          ? gj.features || []
          : gj?.type === "Feature"
            ? [gj]
            : [];
      const validFeatures = rawFeatures.filter((f) => f && f.geometry && f.geometry.type);
      if (validFeatures.length === 0) continue;

      const srsId = layer.srsId ?? 4326;
      let tableName = sanitizeSqlIdentifier(layer.tableName, `layer_${lIdx + 1}`).toLowerCase();
      let suffix = 2;
      while (usedTableNames.has(tableName) || tableName.startsWith("gpkg_") || tableName.startsWith("sqlite_")) {
        tableName = `${sanitizeSqlIdentifier(layer.tableName, "layer").toLowerCase()}_${suffix++}`;
      }
      usedTableNames.add(tableName);

      // Collect attribute schema with unique sanitized column names
      const propKeyToCol: { propKey: string; colName: string; colType: "INTEGER" | "REAL" | "TEXT" }[] = [];
      const usedColNames = new Set<string>(["fid", "geom"]);
      const allPropKeys = new Set<string>();
      for (const f of validFeatures) {
        if (f.properties && typeof f.properties === "object") {
          for (const k of Object.keys(f.properties)) {
            if (!k.startsWith("_")) allPropKeys.add(k);
          }
        }
      }

      for (const propKey of allPropKeys) {
        let colName = sanitizeSqlIdentifier(propKey, "attr");
        let colIdx = 2;
        while (usedColNames.has(colName.toLowerCase())) {
          colName = `${sanitizeSqlIdentifier(propKey, "attr")}_${colIdx++}`;
        }
        usedColNames.add(colName.toLowerCase());

        const sampleVals = validFeatures.map((f) => f.properties?.[propKey]);
        const colType = inferSqliteColumnType(sampleVals);
        propKeyToCol.push({ propKey, colName, colType });
      }

      const colDefs = [
        `"fid" INTEGER PRIMARY KEY AUTOINCREMENT`,
        `"geom" BLOB`,
        ...propKeyToCol.map((c) => `${quoteIdent(c.colName)} ${c.colType}`)
      ];

      db.run(`CREATE TABLE ${quoteIdent(tableName)} (${colDefs.join(", ")});`);

      // Compute layer bounds & insert features via parameterized statement inside a transaction
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const insertCols = [`"geom"`, ...propKeyToCol.map((c) => quoteIdent(c.colName))];
      const placeholders = insertCols.map(() => "?").join(", ");
      const insertStmt = db.prepare(
        `INSERT INTO ${quoteIdent(tableName)} (${insertCols.join(", ")}) VALUES (${placeholders});`
      );

      db.run("BEGIN TRANSACTION;");
      try {
        for (const f of validFeatures) {
          const gpb = encodeGpkgGeometry(f.geometry, srsId);
          const bbox = computeGeometryBbox(f.geometry);
          if (bbox) {
            if (bbox[0] < minX) minX = bbox[0];
            if (bbox[1] < minY) minY = bbox[1];
            if (bbox[2] > maxX) maxX = bbox[2];
            if (bbox[3] > maxY) maxY = bbox[3];
          }

          const rowVals: any[] = [gpb];
          for (const c of propKeyToCol) {
            const raw = f.properties?.[c.propKey];
            if (raw === null || raw === undefined || raw === "") {
              rowVals.push(null);
            } else if (c.colType === "INTEGER") {
              rowVals.push(typeof raw === "boolean" ? (raw ? 1 : 0) : Math.round(Number(raw)));
            } else if (c.colType === "REAL") {
              rowVals.push(Number(raw));
            } else {
              rowVals.push(typeof raw === "object" ? JSON.stringify(raw) : String(raw));
            }
          }
          insertStmt.run(rowVals);
        }
        db.run("COMMIT;");
      } catch (err) {
        db.run("ROLLBACK;");
        throw err;
      } finally {
        insertStmt.free();
      }

      const geomTypeName = inferGpkgGeometryTypeName(validFeatures);
      const identifier = layer.identifier || layer.tableName || tableName;
      const description = layer.description || "";

      const insertContents = db.prepare(
        `INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?, ?);`
      );
      insertContents.run([
        tableName,
        identifier,
        description,
        isoNow,
        Number.isFinite(minX) ? minX : null,
        Number.isFinite(minY) ? minY : null,
        Number.isFinite(maxX) ? maxX : null,
        Number.isFinite(maxY) ? maxY : null,
        srsId
      ]);
      insertContents.free();

      const insertGeomCol = db.prepare(
        `INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, 'geom', ?, ?, 0, 0);`
      );
      insertGeomCol.run([tableName, geomTypeName, srsId]);
      insertGeomCol.free();
    }

    const exportedBytes = db.export();
    return new Blob([exportedBytes], { type: "application/geopackage+sqlite3" });
  } finally {
    db.close();
  }
}

/**
 * Parses an OGC GeoPackage (.gpkg) ArrayBuffer into GeoJSON vector layers with verification metadata.
 * Compatible with GeoPackages created by this app, QGIS, ArcGIS Pro, MapInfo Pro, and GDAL/OGR.
 */
export async function parseGeoPackageArrayBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<ParsedGeoPackageResult> {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.byteLength < 100) {
    throw new Error(`File "${fileName}" is too small to be a valid GeoPackage (.gpkg).`);
  }

  // Read SQLite header signature fields directly
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const applicationId = view.getUint32(68, false); // Big-endian in SQLite header offset 68
  const userVersion = view.getUint32(60, false); // Big-endian in SQLite header offset 60
  const isValidGpkgSignature =
    applicationId === 0x47504b47 || applicationId === 0x47503130; // "GPKG" or legacy "GP10"

  const SQL = await getSqlJs();
  const db = new SQL.Database(bytes);

  try {
    // Query feature tables registered in gpkg_contents + gpkg_geometry_columns
    const metaQuery = db.exec(`
      SELECT
        c.table_name,
        COALESCE(c.identifier, c.table_name) AS identifier,
        COALESCE(c.description, '') AS description,
        g.column_name,
        g.geometry_type_name,
        COALESCE(g.srs_id, c.srs_id, 4326) AS srs_id,
        c.min_x, c.min_y, c.max_x, c.max_y
      FROM gpkg_contents c
      INNER JOIN gpkg_geometry_columns g ON c.table_name = g.table_name
      WHERE LOWER(c.data_type) = 'features'
      ORDER BY c.table_name;
    `);

    if (!metaQuery.length || metaQuery[0].values.length === 0) {
      throw new Error(
        `No vector feature layers were found in GeoPackage "${fileName}" (gpkg_contents / gpkg_geometry_columns empty).`
      );
    }

    const parsedLayers: ParsedGeoPackageLayer[] = [];

    for (const row of metaQuery[0].values) {
      const tableName = String(row[0]);
      const identifier = String(row[1] || tableName);
      const description = String(row[2] || "");
      const geomColName = String(row[3] || "geom");
      const geometryType = String(row[4] || "GEOMETRY");
      const srsId = Number(row[5] ?? 4326);

      const safeTable = quoteIdent(tableName);
      const tableRes = db.exec(`SELECT * FROM ${safeTable};`);
      const features: any[] = [];

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      if (tableRes.length > 0) {
        const columns = tableRes[0].columns;
        const geomIdx = columns.findIndex((c) => c.toLowerCase() === geomColName.toLowerCase());

        for (const values of tableRes[0].values) {
          if (geomIdx < 0) continue;
          const rawGeom = values[geomIdx];
          if (!(rawGeom instanceof Uint8Array)) continue;

          const geometry = decodeGpkgGeometry(rawGeom);
          if (!geometry) continue;

          const bbox = computeGeometryBbox(geometry);
          if (bbox) {
            if (bbox[0] < minX) minX = bbox[0];
            if (bbox[1] < minY) minY = bbox[1];
            if (bbox[2] > maxX) maxX = bbox[2];
            if (bbox[3] > maxY) maxY = bbox[3];
          }

          const properties: Record<string, any> = {};
          for (let i = 0; i < columns.length; i++) {
            if (i === geomIdx) continue;
            properties[columns[i]] = values[i];
          }

          features.push({
            type: "Feature",
            geometry,
            properties
          });
        }
      }

      const metaMinX = typeof row[6] === "number" ? row[6] : minX;
      const metaMinY = typeof row[7] === "number" ? row[7] : minY;
      const metaMaxX = typeof row[8] === "number" ? row[8] : maxX;
      const metaMaxY = typeof row[9] === "number" ? row[9] : maxY;
      const bounds: [number, number, number, number] | null =
        Number.isFinite(metaMinX) &&
        Number.isFinite(metaMinY) &&
        Number.isFinite(metaMaxX) &&
        Number.isFinite(metaMaxY)
          ? [metaMinX, metaMinY, metaMaxX, metaMaxY]
          : null;

      parsedLayers.push({
        tableName,
        identifier,
        description,
        geometryType,
        srsId,
        featureCount: features.length,
        bounds,
        geoJson: {
          type: "FeatureCollection",
          features
        }
      });
    }

    return {
      fileName,
      applicationId,
      userVersion,
      isValidGpkgSignature,
      layers: parsedLayers
    };
  } finally {
    db.close();
  }
}
