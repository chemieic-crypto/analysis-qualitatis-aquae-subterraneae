import HighchartsImport from "highcharts";
import HighchartsCore, { resolveHighchartsCore, safeInitPlugin } from "./initHighcharts";
// @ts-ignore
import Highcharts3D from "highcharts/highcharts-3d";
// @ts-ignore
import Cylinder from "highcharts/modules/cylinder";
// @ts-ignore
import Exporting from "highcharts/modules/exporting";
// @ts-ignore
import OfflineExporting from "highcharts/modules/offline-exporting";

export function getHighchartsCore(raw?: any): any {
  return resolveHighchartsCore(raw || HighchartsImport) || HighchartsCore;
}

export const Highcharts = getHighchartsCore(HighchartsImport);

export function initHighchartsModule(module: any, rawCore?: any) {
  safeInitPlugin(module, rawCore || HighchartsCore);
}

// Auto-initialize plugins in chartHelpers
safeInitPlugin(Highcharts3D, HighchartsCore);
safeInitPlugin(Cylinder, HighchartsCore);
safeInitPlugin(Exporting, HighchartsCore);
safeInitPlugin(OfflineExporting, HighchartsCore);

if (HighchartsCore && typeof HighchartsCore.setOptions === "function") {
  try {
    HighchartsCore.setOptions({
      chart: {
        style: {
          fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif",
          fontSize: "12px",
          fontWeight: "500",
        },
        resetZoomButton: {
          theme: {
            style: {
              fontSize: "11px",
              fontWeight: "bold",
            }
          }
        }
      },
      title: {
        style: {
          color: "#0f172a",
          fontSize: "15px",
          fontWeight: "800",
          letterSpacing: "0.01em"
        }
      },
      subtitle: {
        style: {
          color: "#475569",
          fontSize: "12px",
          fontWeight: "600"
        }
      },
      xAxis: {
        labels: {
          style: {
            color: "#1e293b",
            fontSize: "11px",
            fontWeight: "600"
          }
        },
        title: {
          style: {
            color: "#0f172a",
            fontSize: "12px",
            fontWeight: "700"
          }
        },
        lineColor: "#64748b",
        lineWidth: 1.5,
        tickColor: "#64748b",
        tickWidth: 1.5
      },
      yAxis: {
        labels: {
          style: {
            color: "#1e293b",
            fontSize: "11px",
            fontWeight: "600"
          }
        },
        title: {
          style: {
            color: "#0f172a",
            fontSize: "12px",
            fontWeight: "700"
          }
        },
        gridLineColor: "#e2e8f0",
        gridLineWidth: 1
      },
      legend: {
        itemStyle: {
          color: "#0f172a",
          fontSize: "11px",
          fontWeight: "700"
        },
        itemHoverStyle: {
          color: "#2563eb"
        }
      },
      plotOptions: {
        series: {
          states: {
            hover: {
              halo: {
                size: 9,
                opacity: 0.25
              }
            }
          },
          dataLabels: {
            style: {
              fontSize: "11px",
              fontWeight: "700",
              textOutline: "2px #ffffff"
            }
          }
        }
      },
      exporting: {
        scale: 4,
        chartOptions: {
          chart: {
            backgroundColor: "#ffffff"
          }
        }
      },
      credits: {
        enabled: false
      }
    });
  } catch (err) {
    console.warn("Highcharts setOptions failed:", err);
  }
}

export function safeStringToBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    const len = bytes.length;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize) as unknown as number[]
      );
    }
    return window.btoa(binary);
  } catch (e) {
    console.error("safeStringToBase64 failed:", e);
    try {
      return window.btoa(unescape(encodeURIComponent(str)));
    } catch (_) {
      return "";
    }
  }
}

export function safeBase64ToString(str: string): string {
  try {
    const binary = window.atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    try {
      return decodeURIComponent(escape(window.atob(str)));
    } catch (_) {
      return window.atob(str);
    }
  }
}

/**
 * Clean vector SVG Generator to fallback safely if Highcharts fails for any reason
 */
export function generateFallbackSvg(options: Highcharts.Options, width: number, height: number): string {
  const title = (options.title && options.title.text) ? options.title.text : "Water Quality Analytics Chart";
  const series: any = options.series && options.series[0];
  const isPie = options.chart?.type === "pie" || (options.series?.[0] as any)?.type === "pie";

  if (isPie) {
    // Generate an elegant fallback Donut Chart in clean vector markup
    const dataPoints: any[] = series?.data || [];
    let itemsHtml = "";
    let totalValue = dataPoints.reduce((sum, item) => sum + (typeof item === 'object' ? (item ? item.y || 0 : 0) : item), 0);
    if (!totalValue) totalValue = 1;

    let currentAngle = 0;
    const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#6b7280"];
    
    // Draw slices
    const cx = 220, cy = 240, r = 110, innerR = 60;
    let paths = "";
    
    dataPoints.forEach((point, i) => {
      let name = "";
      let yVal = 0;
      if (typeof point === 'object' && point !== null) {
        name = point.name || "";
        yVal = point.y || 0;
      } else {
        name = `Range ${i + 1}`;
        yVal = point;
      }

      const pct = yVal / totalValue;
      const angle = pct * 360;
      const color = colors[i % colors.length];

      if (pct >= 0.999) {
        paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${r - innerR}" />`;
      } else if (pct > 0) {
        const x1 = cx + r * Math.cos((currentAngle - 90) * Math.PI / 180);
        const y1 = cy + r * Math.sin((currentAngle - 90) * Math.PI / 180);
        const x2 = cx + r * Math.cos((currentAngle + angle - 90) * Math.PI / 180);
        const y2 = cy + r * Math.sin((currentAngle + angle - 90) * Math.PI / 180);

        const innerX1 = cx + innerR * Math.cos((currentAngle - 90) * Math.PI / 180);
        const innerY1 = cy + innerR * Math.sin((currentAngle - 90) * Math.PI / 180);
        const innerX2 = cx + innerR * Math.cos((currentAngle + angle - 90) * Math.PI / 180);
        const innerY2 = cy + innerR * Math.sin((currentAngle + angle - 90) * Math.PI / 180);

        const largeArc = angle > 180 ? 1 : 0;

        paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${innerX2} ${innerY2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerX1} ${innerY1} Z" fill="${color}" stroke="#ffffff" stroke-width="2" />`;
      }

      const legendY = 120 + i * 32;
      itemsHtml += `
        <g transform="translate(430, ${legendY})">
          <rect width="16" height="16" rx="4" fill="${color}" />
          <text x="26" y="13" font-family="'Times New Roman', Times, serif" font-size="12px" font-weight="bold" font-style="italic" fill="#334155">${name}: ${yVal} (${(pct * 100).toFixed(1)}%)</text>
        </g>
      `;

      currentAngle += angle;
    });

    const bgFill = options.chart?.backgroundColor === "transparent" ? "none" : "#ffffff";
    const centerCircleFill = options.chart?.backgroundColor === "transparent" ? "none" : "#ffffff";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="${bgFill}" rx="12" />
        <text x="350" y="55" text-anchor="middle" font-family="'Times New Roman', Times, serif" font-size="12pt" font-weight="bold" fill="#1e3a8a">${title.replace(/<br>/g, " - ")}</text>
        <g>${paths}</g>
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="${centerCircleFill}" />
        <g>${itemsHtml}</g>
      </svg>
    `;
  } else {
    // Generate an elegant fallback clean vector Column/Cylinder Chart
    const categories: string[] = (options.xAxis && (options.xAxis as any).categories) || [];
    const dataPoints: any[] = series?.data || [];
    
    let columnsHtml = "";
    let labelsHtml = "";
    
    const maxVal = dataPoints.reduce((max, d) => {
      const val = typeof d === 'object' ? (d ? d.y || 0 : 0) : d;
      return val > max ? val : max;
    }, 5);

    const chartHeight = 380;
    const scale = chartHeight / (maxVal * 1.25);

    dataPoints.forEach((point, i) => {
      let val = 0;
      let name = categories[i] || "";
      if (typeof point === 'object' && point !== null) {
        val = point.y || 0;
        if (!name) name = point.name || "";
      } else {
        val = point;
      }
      if (isNaN(val)) val = 0;

      const barWidth = Math.min(75, (width - 250) / (dataPoints.length || 1));
      const spacing = (width - 200) / (dataPoints.length || 1);
      const x = 120 + i * spacing + (spacing - barWidth) / 2;
      const barH = val * scale;
      const y = 500 - barH;

      const fillColor = val > 0 ? "#e11d48" : "#475569";

      columnsHtml += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="6" fill="${fillColor}" opacity="0.85" stroke="#334155" stroke-width="1.5" />
        <text x="${x + barWidth / 2}" y="${y - 12}" text-anchor="middle" font-family="'Times New Roman', Times, serif" font-size="12pt" font-weight="bold" fill="#be123c">${val.toFixed(2)}%</text>
      `;

      labelsHtml += `
        <text x="${x + barWidth / 2}" y="530" text-anchor="middle" font-family="'Times New Roman', Times, serif" font-size="12pt" font-weight="700" fill="#1e3a8a" transform="rotate(-15, ${x + barWidth / 2}, 530)">${name}</text>
      `;
    });

    const bgFill = options.chart?.backgroundColor === "transparent" ? "none" : "#ffffff";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="${bgFill}" rx="12" />
        <text x="600" y="60" text-anchor="middle" font-family="'Times New Roman', Times, serif" font-size="12pt" font-weight="bold" fill="#1e3a8a">${title.replace(/<br>/g, " - ")}</text>
        <line x1="80" y1="500" x2="${width - 80}" y2="500" stroke="#475569" stroke-width="2.5" />
        <g>${columnsHtml}</g>
        <g>${labelsHtml}</g>
      </svg>
    `;
  }
}

export function sanitizeSvgStringForCanvas(svgStr: string): string {
  if (!svgStr) return "";
  let clean = svgStr;
  
  // 1. Remove @import rules (which trigger cross-origin blocking in sandboxed SVGs)
  clean = clean.replace(/@import\s+url\([^)]+\);?/gi, "");
  clean = clean.replace(/@import\s+['"][^'"]+['"];?/gi, "");
  
  // 2. Remove any external css links
  clean = clean.replace(/<link[^>]*href=["'][^"']*["'][^>]*>/gi, "");
  
  // 3. Strip external web fonts / urls in style attributes or font-face
  clean = clean.replace(/url\(['"]?https?:[^'"()]+['"]?\)/gi, "none");

  // 4. Strip <font-face> or @font-face blocks with external fonts
  clean = clean.replace(/@font-face\s*\{[^}]*\}/gi, "");

  // 5. Replace external web fonts with standard system fonts to prevent canvas tainting in Chrome/WebKit
  clean = clean.replace(/font-family\s*:\s*['"]?(?:Plus Jakarta Sans|Inter|Roboto|Open Sans|Montserrat|Lato|Poppins|Nunito|Raleway)['"]?/gi, "font-family: Arial, sans-serif");
  clean = clean.replace(/font-family\s*=\s*["']?(?:Plus Jakarta Sans|Inter|Roboto|Open Sans|Montserrat|Lato|Poppins|Nunito|Raleway)["']?/gi, 'font-family="Arial, sans-serif"');

  // 6. Strip any external images or cross-origin xlink:href
  clean = clean.replace(/href=["']https?:[^"']+["']/gi, 'href=""');
  clean = clean.replace(/xlink:href=["']https?:[^"']+["']/gi, 'xlink:href=""');

  return clean;
}

export function scaleSvgStringToHighRes(svgStr: string, targetW: number, targetH: number): string {
  let clean = svgStr;
  
  // Parse/find the original width and height
  const widthMatch = clean.match(/<svg[^>]*\bwidth=["'](\d+(?:\.\d+)?)["']/i);
  const heightMatch = clean.match(/<svg[^>]*\bheight=["'](\d+(?:\.\d+)?)["']/i);
  
  const origW = widthMatch ? parseFloat(widthMatch[1]) : targetW / 3;
  const origH = heightMatch ? parseFloat(heightMatch[1]) : targetH / 3;
  
  // Ensure we have a viewBox that covers the original dimensions
  if (!/<svg[^>]*\bviewBox=/i.test(clean)) {
    clean = clean.replace(/<svg/i, `<svg viewBox="0 0 ${origW} ${origH}"`);
  }
  
  // Replace width and height with the target ones
  if (widthMatch) {
    clean = clean.replace(/\bwidth=["']\d+(?:\.\d+)?["']/i, `width="${targetW}"`);
  } else {
    clean = clean.replace(/<svg/i, `<svg width="${targetW}"`);
  }
  
  if (heightMatch) {
    clean = clean.replace(/\bheight=["']\d+(?:\.\d+)?["']/i, `height="${targetH}"`);
  } else {
    clean = clean.replace(/<svg/i, `<svg height="${targetH}"`);
  }
  
  return clean;
}

/**
 * Trims transparent and white margins from an HTML5 canvas to tightly fit the content.
 * Highly optimized using pixel-step sampling to prevent browser blocking.
 */
function cropCanvasToContent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch (_) {
    // Canvas is tainted by cross-origin data or CORS - return uncropped canvas safely
    return canvas;
  }
  const data = imgData.data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let hasContent = false;

  // Optimize: Sample pixels (checking every 4th pixel) to reduce iteration count by 16x.
  const stepX = 4;
  const stepY = 4;

  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const idx = (y * w + x) * 4;
      if (idx >= data.length) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Pixel is non-blank if it is NOT transparent and NOT pure white
      const isTransparent = a < 15;
      const isWhite = r > 252 && g > 252 && b > 252 && a > 200;

      if (!isTransparent && !isWhite) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasContent) {
    return canvas;
  }

  // Tight crop margin around content, generous padding to avoid clipping text labels
  const padding = 50;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);

  const croppedW = maxX - minX + 1;
  const croppedH = maxY - minY + 1;

  if (croppedW <= 0 || croppedH <= 0) {
    return canvas;
  }

  try {
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = croppedW;
    croppedCanvas.height = croppedH;
    const croppedCtx = croppedCanvas.getContext("2d");
    if (!croppedCtx) return canvas;

    // Fill solid white background for high quality DOCX & PDF exports
    croppedCtx.fillStyle = "#ffffff";
    croppedCtx.fillRect(0, 0, croppedW, croppedH);

    croppedCtx.drawImage(
      canvas,
      minX,
      minY,
      croppedW,
      croppedH,
      0,
      0,
      croppedW,
      croppedH
    );

    return croppedCanvas;
  } catch (_) {
    return canvas;
  }
}

/**
 * Converts a Base64 encoded SVG string to a cropped PNG Base64 string.
 */
function convertSvgToCroppedPng(base64Svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve) => {
    const scale = 1.5;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    let decodedSvg = "";
    if (base64Svg && base64Svg.startsWith("data:image/svg+xml")) {
      try {
        const commaIndex = base64Svg.indexOf(",");
        const isBase64 = base64Svg.includes(";base64,");
        decodedSvg = isBase64
          ? safeBase64ToString(base64Svg.substring(commaIndex + 1))
          : decodeURIComponent(base64Svg.substring(commaIndex + 1));

        // Sanitize SVG before generating canvas to avoid tainted canvas
        decodedSvg = sanitizeSvgStringForCanvas(decodedSvg);

        if (!/<svg[^>]*\bviewBox=/i.test(decodedSvg)) {
          decodedSvg = decodedSvg.replace(/<svg/i, `<svg viewBox="0 0 ${width} ${height}"`);
        }
        decodedSvg = decodedSvg.replace(/<svg([^>]*)\bwidth\s*=\s*["'][^"']*["']/i, '<svg$1');
        decodedSvg = decodedSvg.replace(/<svg([^>]*)\bheight\s*=\s*["'][^"']*["']/i, '<svg$1');
        decodedSvg = decodedSvg.replace(/<svg/i, `<svg width="${targetW}" height="${targetH}"`);
      } catch (err) {
        console.warn("Failed to decode base64Svg in convertSvgToCroppedPng:", err);
      }
    }

    if (!decodedSvg) {
      resolve(base64Svg);
      return;
    }

    try {
      const svgBlob = new Blob([decodedSvg], { type: "image/svg+xml;charset=utf-8" });
      const blobUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(blobUrl);
            resolve(base64Svg);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetW, targetH);
          
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          
          ctx.drawImage(img, 0, 0, targetW, targetH);
          URL.revokeObjectURL(blobUrl);

          let resultPng = "";
          try {
            const croppedCanvas = cropCanvasToContent(canvas);
            resultPng = croppedCanvas.toDataURL("image/png");
          } catch (_) {
            try {
              resultPng = canvas.toDataURL("image/png");
            } catch (_) {
              resultPng = base64Svg;
            }
          }
          resolve(resultPng || base64Svg);
        } catch (_) {
          URL.revokeObjectURL(blobUrl);
          resolve(base64Svg);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        // Fallback to data URI string if Blob URL fails
        const fallbackImg = new Image();
        fallbackImg.crossOrigin = "anonymous";
        fallbackImg.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(base64Svg); return; }
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(fallbackImg, 0, 0, targetW, targetH);

            let resultPng = "";
            try {
              const croppedCanvas = cropCanvasToContent(canvas);
              resultPng = croppedCanvas.toDataURL("image/png");
            } catch (_) {
              try {
                resultPng = canvas.toDataURL("image/png");
              } catch (_) {
                resultPng = base64Svg;
              }
            }
            resolve(resultPng || base64Svg);
          } catch (_) {
            resolve(base64Svg);
          }
        };
        fallbackImg.onerror = () => resolve(base64Svg);
        fallbackImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(decodedSvg);
      };
      img.src = blobUrl;
    } catch (_) {
      resolve(base64Svg);
    }
  });
}

/**
 * Pure offline base64 PNG rendering engine for Highcharts.
 * Perfect for embedding customized chart data inside exported Microsoft Word reports.
 */
export async function generateOfflineChartBase64(
  options: Highcharts.Options,
  width = 1200,
  height = 700
): Promise<string> {
  return new Promise((resolve) => {
    let container: HTMLDivElement | null = null;
    let chart: any = null;
    try {
      container = document.createElement("div");
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "-9999px";
      document.body.appendChild(container);

      // Disable animation for instant crisp capture
      const chartOptions: Highcharts.Options = {
        ...options,
        chart: {
          ...options.chart,
          animation: false,
          width: width,   // Render high resolution native vectors
          height: height, // Render high resolution native vectors
          backgroundColor: options.chart?.backgroundColor || "#ffffff",
          plotBackgroundColor: options.chart?.plotBackgroundColor || "#ffffff",
          style: {
            fontFamily: "'Times New Roman', Times, serif",
            ...(options.chart?.style || {})
          }
        },
        legend: {
          ...options.legend,
          itemStyle: {
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: "10pt",
            ...(options.legend?.itemStyle || {}),
          },
        },
        plotOptions: {
          ...options.plotOptions,
          series: {
            ...options.plotOptions?.series,
            animation: false,
          },
        },
      };

      let svg = "";
      const coreH = getHighchartsCore(HighchartsImport);
      try {
        chart = coreH.chart(container, chartOptions);
        svg = typeof (chart as any).getSVG === "function" ? (chart as any).getSVG() : "";
        if (chart) {
          try { chart.destroy(); } catch (_) {}
          chart = null;
        }
      } catch (firstErr) {
        console.warn("Highcharts 3D/Cylinder render failed. Stripping 3D options and trying 2D fallback...", firstErr);
        
        // Strip 3D and Cylinder specific configurations of Series/Type
        const fallbackType = chartOptions.chart?.type === "pie" ? "pie" : "column";
        const fallbackOptions: Highcharts.Options = {
          ...chartOptions,
          chart: {
            ...chartOptions.chart,
            type: fallbackType,
            options3d: { enabled: false }
          },
          plotOptions: {
            ...chartOptions.plotOptions,
            ...(fallbackType === "pie" ? {
              pie: {
                ...chartOptions.plotOptions?.pie,
                innerSize: "60%"
              }
            } : {
              column: {
                ...chartOptions.plotOptions?.column,
                dataLabels: {
                  enabled: true,
                  format: "{y:.2f}%"
                }
              }
            })
          },
          series: chartOptions.series?.map((s: any) => ({
            ...s,
            type: fallbackType
          }))
        };

        try {
          chart = coreH.chart(container, fallbackOptions);
          svg = typeof (chart as any).getSVG === "function" ? (chart as any).getSVG() : "";
          if (chart) {
            try { chart.destroy(); } catch (_) {}
            chart = null;
          }
        } catch (fallbackErr) {
          console.error("Highcharts fallback 2D render also failed. Resorting to clean programmatic vector SVG...", fallbackErr);
          if (chart) {
            try { chart.destroy(); } catch (_) {}
            chart = null;
          }
        }
      }

      if (container && container.parentNode) {
        try { document.body.removeChild(container); } catch (_) {}
        container = null;
      }

      // If SVG generation failed completely, create outstanding dynamic programmatic vectors!
      if (!svg) {
        try {
          svg = generateFallbackSvg(chartOptions, width, height);
        } catch (svgErr) {
          console.error("Native SVG construction crashed. Ultimate empty fallback resolved.", svgErr);
          resolve("");
          return;
        }
      }

      const sanitizedSvg = sanitizeSvgStringForCanvas(svg);
      let cleanSvg = scaleSvgStringToHighRes(sanitizedSvg, width * 1.5, height * 1.5);
      const base64Svg = "data:image/svg+xml;base64," + safeStringToBase64(cleanSvg);
      convertSvgToCroppedPng(base64Svg, width, height).then(resolve);
      return;
    } catch (e) {
      console.error("Ultimate chart helpers catch crashed safely.", e);
      if (chart) {
        try { chart.destroy(); } catch (_) {}
      }
      if (container && container.parentNode) {
        try { document.body.removeChild(container); } catch (_) {}
      }
      // Guarantee returning a fallback vector so the outer bulletin generator continues smoothly
      try {
        const ultimateSvg = generateFallbackSvg(options, width, height);
        const sanUltimate = sanitizeSvgStringForCanvas(ultimateSvg);
        const cleanUltimate = scaleSvgStringToHighRes(sanUltimate, width * 3.0, height * 3.0);
        const base64Svg = "data:image/svg+xml;base64," + safeStringToBase64(cleanUltimate);
        convertSvgToCroppedPng(base64Svg, width, height).then(resolve);
      } catch (_) {
        resolve("");
      }
    }
  });
}

/**
 * Builds standard 3D Cylinder / Column chart options.
 */
export function buildColumnsChartOptions(title: string, categories: string[], data: any[], yAxisMax = 100): Highcharts.Options {
  const rawMax = data.reduce((max, item) => {
    let val = 0;
    if (typeof item === "number") {
      val = item;
    } else if (item && typeof item === "object") {
      val = typeof item.y === "number" ? item.y : (typeof item[1] === "number" ? item[1] : 0);
    }
    return val > max ? val : max;
  }, 0);
  const computedMax = rawMax > 0 ? Math.min(100, Math.ceil(rawMax / 10) * 10) : 10;

  return {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      plotBackgroundColor: "transparent",
      spacingTop: 10,
      spacingBottom: 10,
      spacingLeft: 5,
      spacingRight: 5,
    },
    title: {
      text: title,
      style: { fontSize: "12pt", fontWeight: "bold", color: "#1e293b", fontFamily: "'Times New Roman', Times, serif" },
    },
    xAxis: {
      categories: categories,
      title: { text: "Sampling Locations", style: { fontWeight: "bold", color: "#1e293b", fontSize: "12pt", fontFamily: "'Times New Roman', Times, serif" } },
      labels: { style: { fontWeight: "bold", color: "#475569", fontSize: "12pt", fontFamily: "'Times New Roman', Times, serif" } },
    },
    yAxis: {
      title: { text: "% of Samples Exceeding Permissible Limit", style: { fontWeight: "bold", color: "#1e293b", fontSize: "12pt", fontFamily: "'Times New Roman', Times, serif" } },
      labels: { style: { fontSize: "12pt", color: "#1e293b", fontFamily: "'Times New Roman', Times, serif" } },
      max: computedMax,
    },
    plotOptions: {
      column: {
        colorByPoint: true,
        dataLabels: {
          enabled: true,
          format: "{point.y:.2f}%",
          style: { fontSize: "12pt", color: "#1e293b", textOutline: "none", fontFamily: "'Times New Roman', Times, serif" },
        },
      },
    },
    series: [
      {
        name: "Exceedance %",
        type: "column",
        data: data,
        showInLegend: false,
      },
    ],
    credits: { enabled: false },
  };
}

/**
 * Builds standard 3D Pie / Donut chart options.
 */
export function buildDonutChartOptions(title: string, dataPoints: any[], size = "62%", isDarkTheme = false): Highcharts.Options {
  const finalSize = size;
  const textColor = isDarkTheme ? "#f8fafc" : "#0f172a";
  const titleFontSize = "18pt";
  const labelFontSize = "13pt";
  
  // Filter out zero-count slices to prevent overlapping zero-degree callouts
  const validPoints = (dataPoints || []).filter((p: any) => p && typeof p.y === "number" && p.y > 0);
  const chartData = validPoints.length > 0 ? validPoints : dataPoints;

  return {
    chart: {
      type: "pie",
      options3d: {
        enabled: true,
        alpha: 32,  // Smooth 3D tilt perspective
        beta: 0,
        depth: 40,  // Rich 3D glossy thickness
      },
      backgroundColor: "#ffffff",
      plotBackgroundColor: "#ffffff",
      spacingTop: 20,
      spacingBottom: 20,
      spacingLeft: 15,
      spacingRight: 15,
      style: {
        fontFamily: "'Times New Roman', Times, serif"
      }
    },
    title: {
      text: title,
      margin: 15,
      style: { 
        fontSize: titleFontSize,
        fontWeight: "bold", 
        color: textColor, 
        fontFamily: "'Times New Roman', Times, serif" 
      },
    },
    plotOptions: {
      pie: {
        innerSize: "48%",
        depth: 40,
        size: finalSize,
        borderWidth: 2,
        borderColor: "#ffffff",
        allowPointSelect: false,
        cursor: "pointer",
        slicedOffset: 15,
        dataLabels: {
          enabled: true,
          useHTML: false, // MANDATORY: Must be false so getSVG captures dataLabels inside vector SVG
          allowOverlap: true,
          crop: false,
          overflow: "allow",
          softConnector: true,
          formatter: function (this: any) {
            const name = this.point.name || "";
            const pct = this.point.percentage ? this.point.percentage.toFixed(1) : "0.0";
            const count = this.point.y !== undefined ? this.point.y : 0;
            return `<b>${name}</b><br/><b>${pct}%</b> (${count} samples)`;
          },
          distance: 20,
          connectorWidth: 2.2,
          connectorColor: "#334155",
          connectorPadding: 4,
          style: { 
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: labelFontSize,
            fontWeight: "bold",
            color: isDarkTheme ? "#f8fafc" : "#0f172a",
            textOutline: "2.5px #ffffff", // White halo stroke around text for publication readability
          },
        } as any,
        showInLegend: false,
      },
    },
    legend: {
      enabled: false,
    },
    series: [
      {
        type: "pie",
        name: "Samples",
        data: chartData,
      },
    ],
    credits: { enabled: false },
  };
}

/**
 * High quality wrapper for quick generating parameter donut chart as base64 string
 */
export async function generateParamDonutChart(title: string, dataPoints: any[], isDarkTheme = false): Promise<string> {
  const options = buildDonutChartOptions(title, dataPoints, "62%", isDarkTheme);
  return generateOfflineChartBase64(options, 1000, 560); // Fast, responsive high-DPI donut chart
}
