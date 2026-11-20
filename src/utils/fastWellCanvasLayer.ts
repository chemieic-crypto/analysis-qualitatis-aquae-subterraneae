import L from "leaflet";

export interface FastWellDot {
  lat: number;
  lon: number;
  color: string;
  rowIndex: number;
  val: number;
  label?: string;
}

export interface FastWellCanvasOptions {
  radius?: number;
  opacity?: number;
  strokeThreshold?: number;
  onHoverDot?: (dot: FastWellDot | null, latlng: L.LatLng | null) => void;
  onClickDot?: (dot: FastWellDot, latlng: L.LatLng) => void;
}

const DEG_TO_RAD = Math.PI / 180;
const FOUR_PI = Math.PI * 4;
const TWO_PI = Math.PI * 2;
const MAX_MERCATOR_LAT = 85.05112878;

/**
 * High-performance single-Canvas Leaflet Layer for 25,000+ groundwater well markers.
 * - Pre-projects normalized Web Mercator coordinates into typed arrays once in setData().
 * - Renders onto an overscanned buffer canvas ONLY on moveend/zoomend/viewreset/resize,
 *   letting Leaflet GPU-translate the canvas during drag/pan with zero JS frame cost.
 * - Deduplicates stacked markers on a 2px screen grid when density is high.
 * - Uses flat typed arrays for zero-GC hit-testing with throttled hover probing.
 */
export class FastWellCanvasLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private dots: FastWellDot[] = [];

  // Pre-projected typed arrays (rebuilt only when setData is called)
  private count: number = 0;
  private mercX: Float64Array = new Float64Array(0);
  private mercY: Float64Array = new Float64Array(0);
  private colorIndices: Uint16Array = new Uint16Array(0);
  private palette: string[] = [];

  // Reusable visible-dot hit-test buffers (container coordinates at last draw)
  private visX: Float32Array = new Float32Array(0);
  private visY: Float32Array = new Float32Array(0);
  private visDotIdx: Int32Array = new Int32Array(0);
  private visCount: number = 0;

  // Reusable 2px occupancy grid for high-density deduplication
  private occGrid: Uint8Array = new Uint8Array(0);

  // Reusable per-palette coordinate buckets (flat x,y pairs per color)
  private bucketCoords: number[][] = [];

  private rafId: number | null = null;
  private hoverRafId: number | null = null;
  private lastHoverTs: number = 0;
  private lastHoveredIndex: number = -1;
  private isDragging: boolean = false;

  private opts: Required<Omit<FastWellCanvasOptions, "onHoverDot" | "onClickDot">> &
    Pick<FastWellCanvasOptions, "onHoverDot" | "onClickDot">;

  constructor(options: FastWellCanvasOptions = {}) {
    super();
    this.opts = {
      radius: options.radius ?? 3.2,
      opacity: options.opacity ?? 0.86,
      strokeThreshold: options.strokeThreshold ?? 1800,
      onHoverDot: options.onHoverDot,
      onClickDot: options.onClickDot
    };
  }

  public setOptions(next: Partial<FastWellCanvasOptions>) {
    let needsRedraw = false;
    if (next.radius !== undefined && next.radius !== this.opts.radius) {
      this.opts.radius = next.radius;
      needsRedraw = true;
    }
    if (next.opacity !== undefined && next.opacity !== this.opts.opacity) {
      this.opts.opacity = next.opacity;
      needsRedraw = true;
    }
    if (next.strokeThreshold !== undefined && next.strokeThreshold !== this.opts.strokeThreshold) {
      this.opts.strokeThreshold = next.strokeThreshold;
      needsRedraw = true;
    }
    if (next.onHoverDot !== undefined) this.opts.onHoverDot = next.onHoverDot;
    if (next.onClickDot !== undefined) this.opts.onClickDot = next.onClickDot;
    if (needsRedraw) this.scheduleDraw();
  }

  public setData(dots: FastWellDot[]) {
    this.dots = dots;
    const n = dots.length;
    this.count = n;
    this.lastHoveredIndex = -1;

    if (n === 0) {
      this.mercX = new Float64Array(0);
      this.mercY = new Float64Array(0);
      this.colorIndices = new Uint16Array(0);
      this.palette = [];
      this.visCount = 0;
      this.scheduleDraw();
      return;
    }

    const mx = new Float64Array(n);
    const my = new Float64Array(n);
    const cIdx = new Uint16Array(n);
    const paletteMap = new Map<string, number>();
    const palette: string[] = [];

    for (let i = 0; i < n; i++) {
      const d = dots[i];
      mx[i] = (d.lon + 180) / 360;
      const clampedLat = d.lat > MAX_MERCATOR_LAT ? MAX_MERCATOR_LAT : d.lat < -MAX_MERCATOR_LAT ? -MAX_MERCATOR_LAT : d.lat;
      const sinLat = Math.sin(clampedLat * DEG_TO_RAD);
      my[i] = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / FOUR_PI;

      let ci = paletteMap.get(d.color);
      if (ci === undefined) {
        ci = palette.length;
        paletteMap.set(d.color, ci);
        palette.push(d.color);
      }
      cIdx[i] = ci;
    }

    this.mercX = mx;
    this.mercY = my;
    this.colorIndices = cIdx;
    this.palette = palette;
    this.bucketCoords = palette.map(() => []);

    if (this.visX.length < n) {
      this.visX = new Float32Array(n);
      this.visY = new Float32Array(n);
      this.visDotIdx = new Int32Array(n);
    }

    this.scheduleDraw();
  }

  public clearData() {
    this.dots = [];
    this.count = 0;
    this.visCount = 0;
    this.lastHoveredIndex = -1;
    this.palette = [];
    if (this.canvas) {
      const ctx = this.canvas.getContext("2d");
      ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  override onAdd(map: L.Map): this {
    this._map = map;
    // leaflet-zoom-hide prevents blurry stretching during CSS zoom animation
    const canvas = L.DomUtil.create(
      "canvas",
      "leaflet-layer leaflet-zoom-hide fast-well-canvas"
    ) as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "410";

    const pane = map.getPane("overlayPane");
    if (pane) pane.appendChild(canvas);
    this.canvas = canvas;

    // Redraw ONLY when pan/zoom finishes — Leaflet GPU-translates overlayPane during drag!
    map.on("moveend zoomend viewreset resize", this.onViewChange, this);
    map.on("movestart zoomstart", this.onMoveStart, this);
    map.on("mousemove", this.onMouseMove, this);
    map.on("mouseout", this.onMouseOut, this);
    map.on("click", this.onMapClick, this);

    this.scheduleDraw();
    return this;
  }

  override onRemove(map: L.Map): this {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.hoverRafId !== null) cancelAnimationFrame(this.hoverRafId);
    this.rafId = null;
    this.hoverRafId = null;

    map.off("moveend zoomend viewreset resize", this.onViewChange, this);
    map.off("movestart zoomstart", this.onMoveStart, this);
    map.off("mousemove", this.onMouseMove, this);
    map.off("mouseout", this.onMouseOut, this);
    map.off("click", this.onMapClick, this);

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.visCount = 0;
    return this;
  }

  private onMoveStart = () => {
    this.isDragging = true;
    if (this.lastHoveredIndex !== -1) {
      this.lastHoveredIndex = -1;
      this.opts.onHoverDot?.(null, null);
    }
  };

  private onViewChange = () => {
    this.isDragging = false;
    this.scheduleDraw();
  };

  public scheduleDraw() {
    if (!this._map || !this.canvas) return;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.draw();
    });
  }

  private draw() {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    const size = map.getSize();
    if (!size || size.x <= 0 || size.y <= 0) return;

    // Overscan buffer (~20%) so rapid dragging reveals pre-drawn wells smoothly before moveend
    const padX = Math.min(260, Math.round(size.x * 0.2));
    const padY = Math.min(220, Math.round(size.y * 0.2));
    const cssW = size.x + padX * 2;
    const cssH = size.y + padY * 2;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft.subtract([padX, padY]));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const n = this.count;
    if (n === 0) {
      this.visCount = 0;
      return;
    }

    const zoom = map.getZoom();
    const worldSize = 256 * Math.pow(2, zoom);
    const pixelOrigin = map.getPixelOrigin();
    const originX = pixelOrigin.x + topLeft.x;
    const originY = pixelOrigin.y + topLeft.y;

    const mx = this.mercX;
    const my = this.mercY;
    const cIdx = this.colorIndices;
    const numColors = this.palette.length;

    for (let c = 0; c < numColors; c++) {
      this.bucketCoords[c].length = 0;
    }

    // Screen-space 2px occupancy deduplication when dataset is large
    const useDedup = n > 3500;
    const cellShift = 1; // 2px grid
    const gridW = (cssW >> cellShift) + 2;
    const gridH = (cssH >> cellShift) + 2;
    const gridLen = gridW * gridH;
    let occ: Uint8Array | null = null;
    if (useDedup) {
      if (this.occGrid.length < gridLen) {
        this.occGrid = new Uint8Array(gridLen);
      } else {
        this.occGrid.fill(0, 0, gridLen);
      }
      occ = this.occGrid;
    }

    const visX = this.visX;
    const visY = this.visY;
    const visDotIdx = this.visDotIdx;
    let vCount = 0;
    let drawnCount = 0;

    const minCx = -padX - 6;
    const maxCx = size.x + padX + 6;
    const minCy = -padY - 6;
    const maxCy = size.y + padY + 6;

    for (let i = 0; i < n; i++) {
      // Container coordinates via pure linear math (zero trig, zero object allocation)
      const cx = mx[i] * worldSize - originX;
      if (cx < minCx || cx > maxCx) continue;
      const cy = my[i] * worldSize - originY;
      if (cy < minCy || cy > maxCy) continue;

      const drawX = cx + padX;
      const drawY = cy + padY;

      if (occ) {
        const gx = drawX >> cellShift;
        const gy = drawY >> cellShift;
        if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
          const cellIdx = gy * gridW + gx;
          if (occ[cellIdx] !== 0) {
            continue;
          }
          occ[cellIdx] = 1;
        }
      }

      // Track visible dots within viewport for fast click/hover hit-testing
      if (cx >= -8 && cx <= size.x + 8 && cy >= -8 && cy <= size.y + 8) {
        visX[vCount] = cx;
        visY[vCount] = cy;
        visDotIdx[vCount] = i;
        vCount++;
      }

      const bucket = this.bucketCoords[cIdx[i]];
      bucket.push(drawX, drawY);
      drawnCount++;
    }

    this.visCount = vCount;
    if (drawnCount === 0) return;

    const r = drawnCount > 4500 ? Math.max(2.0, this.opts.radius - 0.9) : this.opts.radius;
    const drawStroke = drawnCount <= this.opts.strokeThreshold;
    const useFastRect = drawnCount > 4200 && !drawStroke;
    const diam = r * 2;

    ctx.globalAlpha = this.opts.opacity;
    if (drawStroke) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.8;
    }

    for (let c = 0; c < numColors; c++) {
      const coords = this.bucketCoords[c];
      const len = coords.length;
      if (len === 0) continue;

      ctx.fillStyle = this.palette[c];
      if (useFastRect) {
        for (let k = 0; k < len; k += 2) {
          ctx.fillRect(coords[k] - r, coords[k + 1] - r, diam, diam);
        }
      } else {
        ctx.beginPath();
        for (let k = 0; k < len; k += 2) {
          const x = coords[k];
          const y = coords[k + 1];
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TWO_PI);
        }
        ctx.fill();
        if (drawStroke) {
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  private findNearestScreenDot(cx: number, cy: number, maxDistPx: number = 9): FastWellDot | null {
    const vCount = this.visCount;
    if (vCount === 0) return null;
    const visX = this.visX;
    const visY = this.visY;
    const visDotIdx = this.visDotIdx;
    const maxSq = maxDistPx * maxDistPx;
    let bestSq = maxSq;
    let bestIdx = -1;

    for (let i = vCount - 1; i >= 0; i--) {
      const dx = visX[i] - cx;
      if (dx > maxDistPx || dx < -maxDistPx) continue;
      const dy = visY[i] - cy;
      if (dy > maxDistPx || dy < -maxDistPx) continue;
      const dSq = dx * dx + dy * dy;
      if (dSq <= bestSq) {
        bestSq = dSq;
        bestIdx = visDotIdx[i];
        if (dSq < 4) break;
      }
    }
    return bestIdx >= 0 ? this.dots[bestIdx] : null;
  }

  private onMouseMove = (ev: L.LeafletMouseEvent) => {
    if (this.isDragging || !this.opts.onHoverDot || this.visCount === 0) return;
    const now = performance.now();
    if (now - this.lastHoverTs < 32) return;
    this.lastHoverTs = now;

    const cx = ev.containerPoint.x;
    const cy = ev.containerPoint.y;
    if (this.hoverRafId !== null) return;

    this.hoverRafId = requestAnimationFrame(() => {
      this.hoverRafId = null;
      if (this.isDragging) return;
      const hit = this.findNearestScreenDot(cx, cy, 8);
      const hitIdx = hit ? hit.rowIndex : -1;
      if (hitIdx !== this.lastHoveredIndex) {
        this.lastHoveredIndex = hitIdx;
        this.opts.onHoverDot?.(hit, hit ? L.latLng(hit.lat, hit.lon) : null);
      }
    });
  };

  private onMouseOut = () => {
    if (this.lastHoveredIndex !== -1) {
      this.lastHoveredIndex = -1;
      this.opts.onHoverDot?.(null, null);
    }
  };

  private onMapClick = (ev: L.LeafletMouseEvent) => {
    if (!this.opts.onClickDot || this.visCount === 0) return;
    const hit = this.findNearestScreenDot(ev.containerPoint.x, ev.containerPoint.y, 10);
    if (hit) {
      this.opts.onClickDot(hit, L.latLng(hit.lat, hit.lon));
    }
  };
}
