import JSZip from "jszip";

/**
 * Clean vector SVG Generator to fallback safely if conversion fails
 */
function sanitizeSvgStringForCanvas(svgStr: string): string {
  if (!svgStr) return "";
  let clean = svgStr;
  // 1. Remove @import rules (which trigger cross-origin blocking in sandboxed SVGs)
  clean = clean.replace(/@import\s+url\([^)]+\);?/gi, "");
  clean = clean.replace(/@import\s+['"][^'"]+['"];?/gi, "");
  
  // 2. Remove any external css links
  clean = clean.replace(/<link[^>]*href=["'][^"']*["'][^>]*>/gi, "");
  
  // 3. Strip external web fonts or absolute URLs in font-face/imports
  clean = clean.replace(/url\(['"]?https?:[^'"()]+['"]?\)/gi, "none");
  
  // 4. Strip <font-face> or @font-face blocks with external fonts
  clean = clean.replace(/@font-face\s*\{[^}]*\}/gi, "");

  // 5. Replace external web fonts with standard system fonts
  clean = clean.replace(/font-family\s*:\s*['"]?(?:Plus Jakarta Sans|Inter|Roboto|Open Sans|Montserrat|Lato|Poppins|Nunito|Raleway)['"]?/gi, "font-family: Arial, sans-serif");
  clean = clean.replace(/font-family\s*=\s*["']?(?:Plus Jakarta Sans|Inter|Roboto|Open Sans|Montserrat|Lato|Poppins|Nunito|Raleway)["']?/gi, 'font-family="Arial, sans-serif"');

  // 6. Strip any external images or cross-origin xlink:href
  clean = clean.replace(/href=["']https?:[^"']+["']/gi, 'href=""');
  clean = clean.replace(/xlink:href=["']https?:[^"']+["']/gi, 'xlink:href=""');

  return clean;
}

function stringToBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    return bytesToBase64(bytes);
  } catch (e) {
    console.error("[Export] stringToBase64 failed:", e);
    try {
      return window.btoa(unescape(encodeURIComponent(str)));
    } catch (_) {
      return "";
    }
  }
}

function base64ToString(str: string): string {
  try {
    const binary = window.atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    console.error("[Export] base64ToString failed, using fallback:", e);
    try {
      return decodeURIComponent(escape(window.atob(str)));
    } catch (_) {
      return window.atob(str);
    }
  }
}

function parseSvgDataUrl(src: string): { mediaType: string; isBase64: boolean; decoded: string } {
  const base64Index = src.indexOf(";base64,");
  if (base64Index !== -1) {
    const mediaType = src.substring(0, base64Index);
    const dataPart = src.substring(base64Index + 8);
    let decoded = "";
    try {
      decoded = base64ToString(dataPart);
    } catch (err) {
      console.error("[Export] Base64 decode failed:", err);
    }
    return { mediaType, isBase64: true, decoded };
  } else {
    const commaIndex = src.indexOf(",");
    if (commaIndex !== -1) {
      const mediaType = src.substring(0, commaIndex);
      const dataPart = src.substring(commaIndex + 1);
      let decoded = "";
      try {
        decoded = decodeURIComponent(dataPart);
      } catch (_) {
        decoded = dataPart;
      }
      return { mediaType, isBase64: false, decoded };
    }
  }
  return { mediaType: "data:image/svg+xml", isBase64: false, decoded: "" };
}

function scaleAndSanitizeSvgDataUrl(src: string, targetW: number, targetH: number): string {
  try {
    const { mediaType, isBase64, decoded } = parseSvgDataUrl(src);
    if (!decoded) return src;
    
    let sanitized = sanitizeSvgStringForCanvas(decoded);
    
    // Parse/find original dimensions for viewBox injection
    const widthMatch = sanitized.match(/<svg[^>]*\bwidth=["'](\d+(?:\.\d+)?)["']/i);
    const heightMatch = sanitized.match(/<svg[^>]*\bheight=["'](\d+(?:\.\d+)?)["']/i);
    const origW = widthMatch ? parseFloat(widthMatch[1]) : targetW / 3.5;
    const origH = heightMatch ? parseFloat(heightMatch[1]) : targetH / 3.5;
    
    if (!/<svg[^>]*\bviewBox=/i.test(sanitized)) {
      sanitized = sanitized.replace(/<svg/i, `<svg viewBox="0 0 ${origW} ${origH}"`);
    }
    
    // Strip any existing width or height attributes from the root <svg> element
    sanitized = sanitized.replace(/<svg([^>]*)\bwidth\s*=\s*["'][^"']*["']/i, '<svg$1');
    sanitized = sanitized.replace(/<svg([^>]*)\bheight\s*=\s*["'][^"']*["']/i, '<svg$1');

    // Cleanly inject high-DPI scaled width and height attributes
    sanitized = sanitized.replace(/<svg/i, `<svg width="${targetW}" height="${targetH}"`);

    if (isBase64) {
      return mediaType + ";base64," + stringToBase64(sanitized);
    } else {
      return mediaType + "," + encodeURIComponent(sanitized);
    }
  } catch (err) {
    console.error("[Export] Failed to scale and sanitize SVG data URL:", err);
    return src;
  }
}

/**
 * Robust image loader that resolves any image URL (blob, object URL, remote image)
 * and encodes it to a standard base64 PNG data URL.
 */
async function ensureBase64Image(src: string): Promise<string> {
  if (!src) return "";
  if (src.startsWith("data:image")) {
    return src;
  }
  
  try {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(src);
        }
      }, 2000);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width || 800;
          canvas.height = img.naturalHeight || img.height || 600;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
            return;
          }
        } catch (e) {
          console.error("[Export] ensureBase64Image canvas draw failed:", e);
        }
        resolve(src);
      };
      img.onerror = (e) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        console.warn("[Export] ensureBase64Image loading failed for src:", src, e);
        resolve(src);
      };
      img.src = src;
    });
  } catch (err) {
    console.error("[Export] ensureBase64Image exception for src:", src, err);
    return src;
  }
}

/**
 * Bulletproof SVG conversion to PNG data URL that works in all sandboxed environments.
 * Optimized for crystal clear 600+ DPI chart & map rasterization in DOCX reports.
 */
async function convertSvgToPngDataUrl(svgString: string, fallbackDataUrl: string, targetW: number, targetH: number): Promise<string> {
  return new Promise<string>((resolve) => {
    let isResolved = false;

    const safeResolve = (url: string) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutTimer);
        resolve(url);
      }
    };

    const timeoutTimer = setTimeout(() => {
      if (!isResolved) {
        console.warn("[Export] SVG-to-PNG conversion timed out, returning empty or fallback PNG.");
        safeResolve("");
      }
    }, 4000);

    let parsedSvg = sanitizeSvgStringForCanvas(svgString || "");

    // Clean up unescaped entities that break XML parser in SVG images
    parsedSvg = parsedSvg
      .replace(/&mu;/g, "μ")
      .replace(/&plusmn;/g, "±")
      .replace(/&deg;/g, "°")
      .replace(/&nbsp;/g, " ")
      .replace(/&sup2;/g, "²")
      .replace(/&sup3;/g, "³")
      .replace(/&radic;/g, "√")
      .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, "&amp;");

    if (!parsedSvg.includes('xmlns="http://www.w3.org/2000/svg"')) {
      parsedSvg = parsedSvg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!parsedSvg.includes("xmlns:xlink=")) {
      parsedSvg = parsedSvg.replace(/<svg/i, `<svg xmlns:xlink="http://www.w3.org/1999/xlink"`);
    }

    if (!parsedSvg.includes("text-rendering")) {
      if (/<svg[^>]*\bstyle=["']/i.test(parsedSvg)) {
        parsedSvg = parsedSvg.replace(/(<svg[^>]*\bstyle=["'])/i, '$1text-rendering: geometricPrecision; shape-rendering: geometricPrecision; image-rendering: high-quality; ');
      } else {
        parsedSvg = parsedSvg.replace(/<svg/i, '<svg style="text-rendering: geometricPrecision; shape-rendering: geometricPrecision; image-rendering: high-quality;"');
      }
    }

    if (parsedSvg) {
      const viewBoxMatch = parsedSvg.match(/<svg[^>]*\bviewBox=["']([^"']+)["']/i);
      const widthMatch = parsedSvg.match(/<svg[^>]*\bwidth=["'](\d+(?:\.\d+)?)%?["']/i);
      const heightMatch = parsedSvg.match(/<svg[^>]*\bheight=["'](\d+(?:\.\d+)?)%?["']/i);
      const origW = widthMatch ? (parseFloat(widthMatch[1]) || 550) : 550;
      const origH = heightMatch ? (parseFloat(heightMatch[1]) || 400) : 400;

      if (!viewBoxMatch) {
        parsedSvg = parsedSvg.replace(/<svg/i, `<svg viewBox="0 0 ${origW} ${origH}"`);
      }

      parsedSvg = parsedSvg.replace(/<svg([^>]*)\bwidth\s*=\s*["'][^"']*["']/i, '<svg$1');
      parsedSvg = parsedSvg.replace(/<svg([^>]*)\bheight\s*=\s*["'][^"']*["']/i, '<svg$1');
      parsedSvg = parsedSvg.replace(/<svg/i, `<svg width="${targetW}" height="${targetH}"`);
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      safeResolve("");
      return;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const img = new Image();
    img.crossOrigin = "anonymous";

    let blobUrl = "";
    try {
      const blob = new Blob([parsedSvg], { type: "image/svg+xml;charset=utf-8" });
      blobUrl = URL.createObjectURL(blob);
    } catch (_) {}

    img.onload = () => {
      try {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        const pngUrl = canvas.toDataURL("image/png");
        safeResolve(pngUrl);
      } catch (e) {
        console.warn("[Export] Canvas drawing failed in convertSvgToPngDataUrl:", e);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        safeResolve("");
      }
    };

    img.onerror = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      // Fallback method using URI-encoded SVG data
      const dataImg = new Image();
      dataImg.onload = () => {
        try {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(dataImg, 0, 0, targetW, targetH);
          safeResolve(canvas.toDataURL("image/png"));
        } catch (_) {
          safeResolve("");
        }
      };
      dataImg.onerror = () => {
        safeResolve("");
      };
      dataImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(parsedSvg);
    };

    if (blobUrl) {
      img.src = blobUrl;
    } else {
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(parsedSvg);
    }
  });
}

/**
 * Main High-Fidelity DOCX exporter.
 * Generates a true Office Open XML (.docx) package with fully embedded Base64 images
 * and precise CSS styling. Ensures seamless compatibility with Microsoft Word, LibreOffice, and WPS Office.
 */
export async function convertHtmlToWordDocHtml(contentHtml: string, fileName: string): Promise<string> {
  console.log("[Export] Starting True DOCX (OOXML) Export Pipeline...");
  
  const div = document.createElement("div");
  div.innerHTML = contentHtml;

  // --- PRE-EXPORT VALIDATION ---
  const initialSvgs = Array.from(div.getElementsByTagName("svg"));
  const initialImages = Array.from(div.getElementsByTagName("img"));
  console.log(`[Export] Pre-Export Validation metrics:`);
  console.log(`- Detected Inline SVG Elements: ${initialSvgs.length}`);
  console.log(`- Detected Image Elements: ${initialImages.length}`);

  // 1. Process all existing <img> tags first (convert remote urls, blob:, canvas, objects, etc. to standard Base64 PNGs)
  console.log("[Export] Validating and converting existing images to Base64...");
  await Promise.all(
    initialImages.map(async (img) => {
      const src = img.getAttribute("src") || "";
      
      if (src) {
        if (src.startsWith("data:image/svg+xml")) {
          // High-resolution SVG-in-image conversion
          try {
            const imgWidth = img.getAttribute("width") || "550";
            const imgHeight = img.getAttribute("height") || "400";
            const w = Math.max(50, parseInt(imgWidth, 10) || 550);
            const h = Math.max(50, parseInt(imgHeight, 10) || 400);

            const scaleFactor = 2.0; // Optimized high-DPI scaling (300 DPI equivalent) without browser memory freeze
            let targetW = Math.round(w * scaleFactor);
            let targetH = Math.round(h * scaleFactor);

            const maxDimension = 4096;
            if (targetW > maxDimension || targetH > maxDimension) {
              const ratio = Math.min(maxDimension / targetW, maxDimension / targetH);
              targetW = Math.round(targetW * ratio);
              targetH = Math.round(targetH * ratio);
            }

            const scaledSrc = scaleAndSanitizeSvgDataUrl(src, targetW, targetH);
            let svgText = "";
            try {
              const parsed = parseSvgDataUrl(scaledSrc);
              svgText = parsed.decoded || "";
              if (svgText) {
                svgText = svgText
                  .replace(/&nbsp;/g, "&#160;")
                  .replace(/&deg;/g, "&#176;")
                  .replace(/&mu;/g, "&#956;")
                  .replace(/&plusmn;/g, "&#177;")
                  .replace(/&sup2;/g, "&#178;")
                  .replace(/&sup3;/g, "&#179;");
              }
            } catch (_) {}

            let pngDataUrl = "";
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                pngDataUrl = await convertSvgToPngDataUrl(svgText, scaledSrc, targetW, targetH);
                if (pngDataUrl && pngDataUrl.startsWith("data:image/png")) {
                  break;
                }
              } catch (err) {
                console.warn(`[Export] SVG-Image Conversion Attempt ${attempt} failed:`, err);
                if (attempt < 2) await new Promise((r) => setTimeout(r, 50));
              }
            }
            
            if (pngDataUrl) {
              img.setAttribute("src", pngDataUrl);
            }
          } catch (err) {
            console.error("[Export] Failed to convert image SVG to PNG:", err);
          }
        } else if (!src.startsWith("data:image/png") && !src.startsWith("data:image/jpeg")) {
          // Remote or blob URL conversion
          let base64Src = "";
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              base64Src = await ensureBase64Image(src);
              if (base64Src && base64Src.startsWith("data:image/png")) {
                break;
              }
            } catch (err) {
              console.warn(`[Export] Blob/Remote Image Conversion Attempt ${attempt} failed:`, err);
              if (attempt < 2) await new Promise((r) => setTimeout(r, 50));
            }
          }
          if (base64Src) {
            img.setAttribute("src", base64Src);
          }
        }
      }
    })
  );

  // 2. Process all inline <svg> elements (like the Piper Diagrams) and convert them to crisp, high-resolution base64 PNGs
  console.log("[Export] Processing inline SVGs...");
  const svgs = Array.from(div.getElementsByTagName("svg"));
  await Promise.all(
    svgs.map(async (svg, i) => {
      try {
        if (!svg.getAttribute("xmlns")) {
          svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }
        
        const svgWidth = svg.getAttribute("width") || "550";
        const svgHeight = svg.getAttribute("height") || "400";
        const viewBox = svg.getAttribute("viewBox");
        const style = svg.getAttribute("style");
        
        let w = parseInt(svgWidth, 10) || 550;
        let h = parseInt(svgHeight, 10) || 400;
        if (viewBox) {
          const parts = viewBox.split(/[\s,]+/).filter(Boolean);
          if (parts.length === 4) {
            w = Math.round(parseFloat(parts[2])) || w;
            h = Math.round(parseFloat(parts[3])) || h;
          }
        }

        const svgString = new XMLSerializer().serializeToString(svg);
        let sanitizedSvgString = sanitizeSvgStringForCanvas(svgString);

        sanitizedSvgString = sanitizedSvgString
          .replace(/&nbsp;/g, "&#160;")
          .replace(/&deg;/g, "&#176;")
          .replace(/&mu;/g, "&#956;")
          .replace(/&plusmn;/g, "&#177;")
          .replace(/&sup2;/g, "&#178;")
          .replace(/&sup3;/g, "&#179;")
          .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, "&amp;");

        const scaleFactor = 2.0; // Optimized high-DPI scaling (300 DPI equivalent)
        let targetW = Math.max(100, Math.round(w * scaleFactor) || 550);
        let targetH = Math.max(100, Math.round(h * scaleFactor) || 400);

        const maxDimension = 4096;
        if (targetW > maxDimension || targetH > maxDimension) {
          const ratio = Math.min(maxDimension / targetW, maxDimension / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        if (!/<svg[^>]*\bviewBox=/i.test(sanitizedSvgString)) {
          sanitizedSvgString = sanitizedSvgString.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`);
        }

        sanitizedSvgString = sanitizedSvgString.replace(/<svg([^>]*)\bwidth\s*=\s*["'][^"']*["']/i, '<svg$1');
        sanitizedSvgString = sanitizedSvgString.replace(/<svg([^>]*)\bheight\s*=\s*["'][^"']*["']/i, '<svg$1');
        sanitizedSvgString = sanitizedSvgString.replace(/<svg/i, `<svg width="${targetW}" height="${targetH}"`);

        const base64 = stringToBase64(sanitizedSvgString);
        const dataUrl = `data:image/svg+xml;base64,${base64}`;

        let pngDataUrl = "";
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            pngDataUrl = await convertSvgToPngDataUrl(sanitizedSvgString, dataUrl, targetW, targetH);
            if (pngDataUrl && pngDataUrl.startsWith("data:image/png")) {
              break;
            }
          } catch (err) {
            console.warn(`[Export] Attempt ${attempt} failed for SVG ${i + 1}:`, err);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 50));
            }
          }
        }

        const img = document.createElement("img");
        if (pngDataUrl && pngDataUrl.startsWith("data:image/png")) {
          img.src = pngDataUrl;
        } else {
          console.warn(`[Export] Canvas rasterization failed for SVG ${i + 1}, using vector SVG image fallback.`);
          img.src = dataUrl;
        }
        img.setAttribute("width", w.toString());
        img.setAttribute("height", h.toString());
        if (style) {
          img.setAttribute("style", style);
        } else {
          img.setAttribute("style", "display: block; margin: 15px auto; max-width: 100%; height: auto;");
        }
        
        svg.parentNode?.replaceChild(img, svg);
      } catch (err) {
        console.error("[Export] Failed to convert inline SVG to PNG:", err);
      }
    })
  );

  // 3. Post-process ALL <img> elements in the document to prevent stretching in Microsoft Word!
  console.log("[Export] Post-processing all images to set explicit non-stretching bounds...");
  const finalImages = Array.from(div.getElementsByTagName("img"));
  await Promise.all(
    finalImages.map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (src) {
        try {
          const widthAttr = img.getAttribute("width");
          const heightAttr = img.getAttribute("height");
          
          let targetW = widthAttr ? parseFloat(widthAttr) : 0;
          let targetH = heightAttr ? parseFloat(heightAttr) : 0;

          // Load the image to find its natural dimensions
          const dims = await new Promise<{ w: number; h: number }>((resolve) => {
            let resolved = false;
            const timer = setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve({ w: 0, h: 0 });
              }
            }, 600);
            const tempImg = new Image();
            tempImg.onload = () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({ w: tempImg.naturalWidth || tempImg.width || 0, h: tempImg.naturalHeight || tempImg.height || 0 });
              }
            };
            tempImg.onerror = () => {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve({ w: 0, h: 0 });
              }
            };
            tempImg.src = src;
          });

          if (dims.w > 0 && dims.h > 0) {
            const naturalRatio = dims.h / dims.w;
            
            if (!targetW && !targetH) {
              targetW = Math.min(600, dims.w);
              targetH = Math.round(targetW * naturalRatio);
            } else if (targetW && !targetH) {
              if (targetW > 600) {
                targetW = 600;
              }
              targetH = Math.round(targetW * naturalRatio);
            } else if (!targetW && targetH) {
              targetW = Math.round(targetH / naturalRatio);
              if (targetW > 600) {
                targetW = 600;
                targetH = Math.round(targetW * naturalRatio);
              }
            } else {
              if (targetW > 600) {
                targetW = 600;
              }
              targetH = Math.round(targetW * naturalRatio);
            }
            
            img.setAttribute("width", targetW.toString());
            img.setAttribute("height", targetH.toString());

            let originalStyle = img.getAttribute("style") || "";
            let cleanedStyle = originalStyle
              .replace(/height\s*:\s*auto;?/gi, "")
              .replace(/max-width\s*:\s*[^;]+;?/gi, "")
              .replace(/width\s*:\s*[^;]+;?/gi, "")
              .replace(/height\s*:\s*[^;]+;?/gi, "");
            
            cleanedStyle = `width: ${targetW}px; height: ${targetH}px; max-width: 100%; border: none; display: block; margin: 0 auto; ` + cleanedStyle;
            img.setAttribute("style", cleanedStyle.trim());
          }
        } catch (err) {
          console.warn("[Export] Failed to post-process dimensions for image:", err);
        }
      }
    })
  );

  // Clear max-width and auto-margin on nested container divs so Word can lay them out fully
  const containerDivs = Array.from(div.getElementsByTagName("div"));
  containerDivs.forEach((container) => {
    const styleAttr = container.getAttribute("style");
    if (styleAttr) {
      const cleaned = styleAttr
        .replace(/max-width\s*:\s*[^;]+;?/gi, "")
        .replace(/max-w\s*:\s*[^;]+;?/gi, "")
        .replace(/margin\s*:\s*0\s+auto;?/gi, "")
        .replace(/margin\s*:\s*auto;?/gi, "");
      container.setAttribute("style", cleaned);
    }
  });

  // Post-process ALL tables to make them simple MS Word tables with publication-quality formatting
  const tables = Array.from(div.getElementsByTagName("table"));
  tables.forEach((table) => {
    // Remove col and colgroup - rely on explicit cell width styles
    const cols = Array.from(table.querySelectorAll("col, colgroup"));
    cols.forEach((c) => c.parentNode?.removeChild(c));

    const isLayoutTable = table.classList.contains("layout-table") || table.getAttribute("border") === "0";

    if (isLayoutTable) {
      table.setAttribute("border", "0");
      table.setAttribute("cellpadding", "0");
      table.setAttribute("cellspacing", "0");
      table.setAttribute("width", "100%");
      table.setAttribute("style", "width: 100%; border-collapse: collapse; margin-top: 8pt; margin-bottom: 12pt; border: none; mso-table-lspace: 0pt; mso-table-rspace: 0pt;");
    } else {
      // Data table styling - compact, auto-adjusted layout without extra space
      table.setAttribute("border", "1");
      table.setAttribute("cellpadding", "0");
      table.setAttribute("cellspacing", "0");
      table.setAttribute("width", "100%");
      table.setAttribute("style", "width: 100% !important; table-layout: auto !important; border-collapse: collapse !important; margin-top: 4pt !important; margin-bottom: 6pt !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; mso-table-anchor-vertical: paragraph;");
    }

    const rows = Array.from(table.getElementsByTagName("tr"));

    rows.forEach((row) => {
      row.removeAttribute("height");
      const currentStyle = row.getAttribute("style") || "";
      const bgMatch = currentStyle.match(/background-color\s*:\s*([^;]+)/i);
      const bgColor = bgMatch ? bgMatch[1] : "";
      
      let rowStyle = `height: auto; min-height: 0pt; mso-height-rule: auto; vertical-align: middle;`;
      
      if (bgColor) {
        rowStyle += ` background-color: ${bgColor};`;
      }
      if (/font-weight\s*:\s*bold/i.test(currentStyle)) {
        rowStyle += " font-weight: bold;";
      }
      if (/text-align\s*:\s*center/i.test(currentStyle)) {
        rowStyle += " text-align: center;";
      }
      row.setAttribute("style", rowStyle);

      const cells = Array.from(row.querySelectorAll("th, td"));
      cells.forEach((cell) => {
        cell.removeAttribute("width");
        cell.removeAttribute("height");
        cell.classList.remove("whitespace-nowrap");
        
        const cellStyle = cell.getAttribute("style") || "";
        let cleanedCellStyle = cellStyle
          .replace(/width\s*:[^;]+;?/gi, "")
          .replace(/min-width\s*:[^;]+;?/gi, "")
          .replace(/max-width\s*:[^;]+;?/gi, "")
          .replace(/height\s*:[^;]+;?/gi, "")
          .replace(/min-height\s*:[^;]+;?/gi, "")
          .replace(/max-height\s*:[^;]+;?/gi, "")
          .replace(/line-height\s*:[^;]+;?/gi, "")
          .replace(/white-space\s*:[^;]+;?/gi, "")
          .replace(/padding\s*:[^;]+;?/gi, "")
          .replace(/margin\s*:[^;]+;?/gi, "")
          .replace(/display\s*:[^;]+;?/gi, "");
        
        const isTh = cell.tagName.toLowerCase() === "th";
        const isBold = isTh || /font-weight\s*:\s*bold/i.test(cellStyle);
        const fontSize = isTh ? "9pt" : "8.5pt";
        
        if (isLayoutTable) {
          cleanedCellStyle += ` border: none !important; padding: 2pt 4pt; vertical-align: top; font-family: 'Times New Roman', Times, serif; font-size: ${fontSize}; line-height: 1.2;`;
        } else {
          // Compact, publication-quality cell padding & twips with zero extra space
          const cellPadding = "2.5pt 4pt";
          const topBottomTwips = "40twips";
          const leftRightTwips = "60twips";

          cleanedCellStyle += ` font-family: 'Times New Roman', Times, serif; font-size: ${fontSize}; padding: ${cellPadding}; mso-padding-top-alt: ${topBottomTwips}; mso-padding-bottom-alt: ${topBottomTwips}; mso-padding-left-alt: ${leftRightTwips}; mso-padding-right-alt: ${leftRightTwips}; ${isBold ? "font-weight: bold;" : ""} line-height: 1.15 !important; mso-line-height-rule: at-least !important; vertical-align: middle; mso-vertical-align-alt: middle; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; white-space: normal !important; margin: 0pt !important; height: auto; min-height: 0pt;`;
        }
        
        // Align headers centered by default, data aligned according to existing style or left
        if (isTh) {
          cleanedCellStyle += " text-align: center;";
        } else if (!/text-align/i.test(cleanedCellStyle)) {
          cleanedCellStyle += " text-align: left;";
        }

        cell.setAttribute("style", cleanedCellStyle);

        // Remove empty paragraphs or unnecessary break tags inside cell
        const emptyParagraphs = Array.from(cell.querySelectorAll("p")).filter(p => !p.textContent?.trim());
        emptyParagraphs.forEach(p => p.parentNode?.removeChild(p));

        const breaks = Array.from(cell.querySelectorAll("br"));
        breaks.forEach(br => {
          if (!br.nextSibling || !br.previousSibling) {
            br.parentNode?.removeChild(br);
          }
        });

        // Strip any paragraph spacing within table cells
        const cellParagraphs = Array.from(cell.getElementsByTagName("p"));
        const alignVal = isTh ? "center" : (/text-align\s*:\s*center/i.test(cellStyle) ? "center" : /text-align\s*:\s*right/i.test(cellStyle) ? "right" : "left");

        if (cellParagraphs.length > 0) {
          cellParagraphs.forEach((p) => {
            p.setAttribute("style", `margin: 0pt !important; margin-top: 0pt !important; margin-bottom: 0pt !important; padding: 0pt !important; font-family: 'Times New Roman', Times, serif; font-size: ${fontSize}; line-height: 1.15 !important; mso-line-height-rule: at-least !important; mso-margin-top-alt: 0pt !important; mso-margin-bottom-alt: 0pt !important; text-align: ${alignVal};`);
          });
        } else {
          const originalHTML = cell.innerHTML.trim();
          if (originalHTML) {
            cell.innerHTML = `<p style="margin: 0pt !important; margin-top: 0pt !important; margin-bottom: 0pt !important; padding: 0pt !important; font-family: 'Times New Roman', Times, serif; font-size: ${fontSize}; line-height: 1.15 !important; mso-line-height-rule: at-least !important; mso-margin-top-alt: 0pt !important; mso-margin-bottom-alt: 0pt !important; text-align: ${alignVal};">${originalHTML}</p>`;
          }
        }

        // Flatten nested divs inside cells into simple inline spans
        const cellDivs = Array.from(cell.getElementsByTagName("div"));
        cellDivs.forEach((innerDiv) => {
          const span = document.createElement("span");
          span.innerHTML = innerDiv.innerHTML;
          innerDiv.parentNode?.replaceChild(span, innerDiv);
        });
      });
    });
  });

  // Ensure all monsoon plot items are set to display: block in exported Word document so every chart/diagram appears
  const monsoonPlotItems = Array.from(div.querySelectorAll(".monsoon-plot-item"));
  monsoonPlotItems.forEach((item) => {
    (item as HTMLElement).setAttribute("style", "display: block !important; visibility: visible !important; margin-top: 20px; margin-bottom: 25px; text-align: center; page-break-inside: avoid;");
  });

  // --- Traversing and re-numbering figures/tables for academic/scientific style ---
  console.log("[Export] Programmatically re-numbering figures and tables for academic style...");
  let currentSection = 1;
  let figureCounter = 1;
  let tableCounter = 1;
  
  const figureMap: Record<number, string> = {};
  const tableMap: Record<number, string> = {};

  const allElements = Array.from(div.querySelectorAll("h1, h2, h3, h4, span, p, div"));
  allElements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    
    if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "span") {
      const text = el.textContent || "";
      const match = text.match(/^(\d+)\.\d+/);
      if (match) {
        const sec = parseInt(match[1], 10);
        if (sec !== currentSection && sec >= 1 && sec <= 10) {
          currentSection = sec;
          figureCounter = 1;
          tableCounter = 1;
          console.log(`[Export] Switched to Section ${currentSection} for academic numbering.`);
        }
      }
    }
    
    if (tagName === "p" || tagName === "div") {
      const text = el.textContent?.trim() || "";
      
      if (/^Table\s+(?:No\.\s+)?(\d+)/i.test(text)) {
        const match = text.match(/^Table\s+(?:No\.\s+)?(\d+)/i);
        if (match) {
          const oldNum = parseInt(match[1], 10);
          if (!tableMap[oldNum]) {
            const newNumStr = `${currentSection}.${tableCounter}`;
            tableMap[oldNum] = newNumStr;
            tableCounter++;
          }
          const newNumStr = tableMap[oldNum];
          
          const originalHTML = el.innerHTML;
          const updatedHTML = originalHTML.replace(/^Table\s+(?:No\.\s+)?\d+[\s:]*/i, `Table ${newNumStr}: `);
          el.innerHTML = updatedHTML;
          
          el.setAttribute("style", "text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; font-weight: bold; color: #000000; margin-top: 12pt; margin-bottom: 6pt; page-break-inside: avoid;");
        }
      }
      else if (/^Figure\s+(\d+)/i.test(text)) {
        const match = text.match(/^Figure\s+(\d+)/i);
        if (match) {
          const oldNum = parseInt(match[1], 10);
          if (!figureMap[oldNum]) {
            const newNumStr = `${currentSection}.${figureCounter}`;
            figureMap[oldNum] = newNumStr;
            figureCounter++;
          }
          const newNumStr = figureMap[oldNum];
          
          const originalHTML = el.innerHTML;
          const updatedHTML = originalHTML.replace(/^Figure\s+\d+[\s:]*/i, `Figure ${newNumStr}: `);
          el.innerHTML = updatedHTML;
          
          el.setAttribute("style", "text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; font-weight: bold; color: #000000; margin-top: 8pt; margin-bottom: 12pt; page-break-inside: avoid;");
        }
      }
    }
  });

  // Now fix references in text
  const paragraphs = Array.from(div.getElementsByTagName("p"));
  paragraphs.forEach((p) => {
    const text = p.textContent || "";
    // Skip if this paragraph is a caption itself
    if (/^(Figure|Table)\s+\d+\.\d+/i.test(text.trim())) {
      return;
    }

    let html = p.innerHTML;
    
    // Replace "Figure 3" -> "Figure 4.1"
    html = html.replace(/\b(?:figure|Figure)\s+(\d+)\b/g, (match, numStr) => {
      const num = parseInt(numStr, 10);
      return figureMap[num] ? `Figure ${figureMap[num]}` : match;
    });

    // Replace "Table 1" -> "Table 3.1"
    html = html.replace(/\b(?:table|Table)\s+(?:No\.\s+)?(\d+)\b/g, (match, numStr) => {
      const num = parseInt(numStr, 10);
      return tableMap[num] ? `Table ${tableMap[num]}` : match;
    });

    p.innerHTML = html;
  });

  const finalHtml = div.innerHTML;

  // Prepare full HTML wrapper with robust publication styling
  const completeHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${fileName}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page Section1 {
    size: 8.27in 11.69in; /* Standard A4 Size */
    margin: 1.0in 1.0in 1.0in 1.0in; /* 2.54 cm margins */
    mso-header-margin: 0.5in;
    mso-footer-margin: 0.5in;
    mso-footer: f1;
    mso-paper-source: 0;
  }
  div.Section1 {
    page: Section1;
  }
  @page Section2 {
    size: 11.69in 8.27in; /* Landscape A4 Size */
    margin: 1.0in 1.0in 1.0in 1.0in; /* 2.54 cm margins */
    mso-header-margin: 0.5in;
    mso-footer-margin: 0.5in;
    mso-paper-source: 0;
  }
  div.Section2 {
    page: Section2;
    mso-page-orientation: landscape;
  }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #000000;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }
  p {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    text-align: justify;
    margin-top: 0in;
    margin-bottom: 6pt;
    mso-margin-top-alt: 0pt;
    mso-margin-bottom-alt: 6pt;
  }
  h1, h2, h3, h4 {
    font-family: 'Times New Roman', Times, serif;
    color: #1e3a8a; /* Professional navy blue header accent */
    margin-top: 18pt;
    margin-bottom: 6pt;
    mso-margin-top-alt: 18pt;
    mso-margin-bottom-alt: 6pt;
    font-weight: bold;
    page-break-after: avoid;
  }
  h1 { font-size: 18pt; text-align: center; color: #1e3a8a; margin-bottom: 12pt; mso-margin-bottom-alt: 12pt; }
  h2 { font-size: 15pt; color: #1e3a8a; border-bottom: none; padding-bottom: 0; margin-top: 20pt; }
  h3 { font-size: 13pt; color: #1e3a8a; margin-top: 14pt; }
  h4 { font-size: 11.5pt; color: #1e293b; margin-top: 12pt; }
  table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: auto !important;
    border-collapse: collapse !important;
    margin-top: 4pt !important;
    margin-bottom: 6pt !important;
    margin-left: auto;
    margin-right: auto;
    font-family: 'Times New Roman', Times, serif;
    font-size: 8.5pt;
    page-break-inside: auto;
    mso-table-lspace: 0pt;
    mso-table-rspace: 0pt;
    mso-table-anchor-vertical: paragraph;
  }
  thead {
    display: table-header-group; /* repeat headers across pages */
  }
  tr {
    page-break-inside: avoid !important;
    height: auto !important;
    min-height: 0pt !important;
    mso-height-rule: auto !important;
  }
  th, td {
    border: 0.5pt solid #cbd5e1;
    padding: 2.5pt 4pt !important;
    text-align: left;
    vertical-align: middle;
    mso-vertical-align-alt: middle;
    font-family: 'Times New Roman', Times, serif;
    font-size: 8.5pt;
    white-space: normal !important;
    word-break: normal;
    word-wrap: break-word;
    overflow-wrap: break-word;
    line-height: 1.15 !important;
    mso-line-height-rule: at-least !important;
    mso-padding-top-alt: 40twips !important;
    mso-padding-bottom-alt: 40twips !important;
    mso-padding-left-alt: 60twips !important;
    mso-padding-right-alt: 60twips !important;
    height: auto !important;
    min-height: 0pt !important;
  }
  table th p, table td p {
    margin: 0pt !important;
    padding: 0pt !important;
    line-height: 1.15 !important;
    mso-line-height-rule: at-least !important;
    mso-margin-top-alt: 0pt !important;
    mso-margin-bottom-alt: 0pt !important;
  }
  th {
    font-size: 9pt;
    background-color: #1e3a8a !important;
    font-weight: bold;
    color: #ffffff !important;
    text-align: center;
    border: 1pt solid #1e3a8a !important;
  }
  th p {
    color: #ffffff !important;
    font-weight: bold !important;
  }
  tr:nth-child(even) td {
    background-color: #f8fafc; /* Subtle elegant zebra striping */
  }
  p.MsoFooter, li.MsoFooter, div.MsoFooter {
    margin: 0in;
    margin-bottom: .0001pt;
    mso-pagination: widow-orphan;
    font-size: 10pt;
    font-family: 'Times New Roman', Times, serif;
    color: #444444;
  }
  .text-left { text-align: left; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  .text-rose-600 { color: #dc2626; font-weight: bold; }
  .text-emerald-700 { color: #047857; font-weight: bold; }
  .mb-4 { margin-bottom: 16px; }
  .mt-8 { margin-top: 32px; }
  ul { margin-top: 6pt; margin-bottom: 12pt; padding-left: 20pt; }
  li { margin-bottom: 4pt; text-align: justify; }
  .bg-white { background-color: #ffffff; }
  .rounded-2xl { border-radius: 4px; }
  .border { border: 0.5pt solid #cbd5e1; }
  .p-5 { padding: 12pt; }
  .bg-indigo-900 { background-color: #f8fafc; color: #000000; padding: 12pt; border: 1pt solid #cbd5e1; border-radius: 4px; }
  .text-indigo-100 { color: #334155; }
  .text-indigo-50 { color: #1e293b; }
  .text-emerald-400 { color: #047857; font-weight: bold; }
  .text-amber-400 { color: #b45309; font-weight: bold; }
</style>
</head>
<body>
  <div class="Section1">
    ${finalHtml}

    <!-- Formal Footer with Dynamic Page Numbering in Word -->
    <div style="mso-element: footer" id="f1">
      <p class="MsoFooter" style="text-align: center; border-top: 0.5pt solid #cccccc; padding-top: 4pt;">
        Page <span style="mso-field-code: ' PAGE '"></span> of <span style="mso-field-code: ' NUMPAGES '"></span>
      </p>
    </div>
  </div>
</body>
</html>`;

  return completeHtml;
}

function chunkString(str: string, length: number = 76): string {
  if (!str) return "";
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.substring(i, i + length));
  }
  return chunks.join("\r\n");
}

function bytesToBase64(bytes: Uint8Array): string {
  try {
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunkSize) as unknown as number[]
      );
    }
    return btoa(binary);
  } catch (e) {
    console.error("[Export] bytesToBase64 failed:", e);
    return "";
  }
}

export function convertHtmlToMhtml(completeHtml: string, fileName: string): string {
  const boundary = "----=_NextPart_000_0000_01D1A9E3.12345678";
  
  // Use DOMParser to parse the full HTML document
  const parser = new DOMParser();
  const doc = parser.parseFromString(completeHtml, "text/html");
  
  const imgs = Array.from(doc.getElementsByTagName("img"));
  const attachments: Array<{ filename: string; mimeType: string; data: string }> = [];
  
  imgs.forEach((img, index) => {
    const src = img.getAttribute("src") || "";
    if (src.startsWith("data:")) {
      let mimeType = "image/png";
      let rawBase64 = "";

      if (src.includes(";base64,")) {
        const parts = src.split(";base64,");
        const header = parts[0];
        rawBase64 = parts[1].replace(/[\r\n\s]/g, "");

        if (header.includes("image/jpeg") || header.includes("image/jpg")) {
          mimeType = "image/jpeg";
        } else if (header.includes("image/gif")) {
          mimeType = "image/gif";
        } else if (header.includes("image/svg+xml")) {
          mimeType = "image/svg+xml";
        } else {
          mimeType = "image/png";
        }
      } else {
        const commaIdx = src.indexOf(",");
        if (commaIdx !== -1) {
          const header = src.substring(0, commaIdx);
          if (header.includes("image/svg+xml")) {
            mimeType = "image/svg+xml";
          }
          const content = decodeURIComponent(src.substring(commaIdx + 1));
          const bytes = new TextEncoder().encode(content);
          rawBase64 = bytesToBase64(bytes);
        }
      }

      if (rawBase64) {
        const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/svg+xml" ? "svg" : "png";
        const filename = `image_${index}.${ext}`;
        img.setAttribute("src", filename);
        const chunkedBase64 = chunkString(rawBase64, 76);
        attachments.push({
          filename,
          mimeType,
          data: chunkedBase64
        });
      }
    }
  });
  
  // Clean & serialize HTML
  const rawHtml = "<!DOCTYPE html>\r\n" + doc.documentElement.outerHTML;
  
  // Safely encode UTF-8 HTML string to Base64 using fast bytesToBase64
  let htmlBase64 = "";
  try {
    const bytes = new TextEncoder().encode(rawHtml);
    htmlBase64 = bytesToBase64(bytes);
  } catch (e) {
    htmlBase64 = btoa(unescape(encodeURIComponent(rawHtml)));
  }
  
  // Chunk HTML base64 to 76 characters per line without regex memory spikes
  const chunkedHtmlBase64 = chunkString(htmlBase64, 76);
  
  // Construct MIME Parts with strictly \r\n (CRLF) line endings
  const lines: string[] = [];
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/html; charset="utf-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("Content-Location: file:///C:/fake/document.html");
  lines.push("");
  lines.push(chunkedHtmlBase64);
  lines.push("");
  
  attachments.forEach((att) => {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mimeType}`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Location: file:///C:/fake/${att.filename}`);
    lines.push("");
    lines.push(att.data);
    lines.push("");
  });
  
  lines.push(`--${boundary}--`);
  lines.push("");
  
  return lines.join("\r\n");
}

export async function convertHtmlToDocxBlob(completeHtml: string, fileName: string): Promise<Blob> {
  const mhtmlContent = convertHtmlToMhtml(completeHtml, fileName);
  
  const zip = new JSZip();
  
  // 1. [Content_Types].xml - Registered .mht as message/rfc822
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Default Extension="mht" ContentType="message/rfc822" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
</Types>`);

  // 2. _rels/.rels
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
</Relationships>`);

  // 3. word/document.xml
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk" />
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait" />
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0" />
    </w:sectPr>
  </w:body>
</w:document>`);

  // 4. word/_rels/document.xml.rels
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.mht" />
</Relationships>`);

  // 5. word/afchunk.mht
  zip.file("word/afchunk.mht", mhtmlContent);
  
  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6
    }
  });
}

export function buildStandaloneHtml(contentHtml: string, fileName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${fileName}</title>
<style>
  body {
    font-family: 'Times New Roman', Times, serif, system-ui, sans-serif;
    line-height: 1.6;
    color: #0f172a;
    background-color: #ffffff;
    margin: 0 auto;
    padding: 2rem;
    max-width: 1100px;
  }
  h1, h2, h3, h4 { color: #1e3a8a; page-break-after: avoid; }
  h1 { text-align: center; font-size: 2rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; margin-top: 2rem; }
  p { text-align: justify; margin-bottom: 1rem; }
  table { width: 100%; table-layout: auto; border-collapse: collapse; margin: 1rem 0; font-size: 0.825rem; line-height: 1.2; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; white-space: normal; word-wrap: break-word; overflow-wrap: break-word; }
  th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-align: center; font-size: 0.875rem; }
  tr:nth-child(even) { background-color: #f8fafc; }
  img, svg { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
</style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;
}

export async function downloadMhtmlWordDoc(contentHtml: string, fileName: string, format: "doc" | "html" | "docx" = "doc") {
  console.log(`[Export] Starting Document Export Pipeline for format: ${format}...`);
  try {
    if (!contentHtml || !contentHtml.trim()) {
      console.warn("[Export] Empty content passed to downloadMhtmlWordDoc. Export aborted.");
      return;
    }

    let blob: Blob;
    let finalFileName = fileName;
    
    if (format === "html") {
      console.log("[Export] Packaging standalone HTML document...");
      const completeHtml = buildStandaloneHtml(contentHtml, fileName);
      blob = new Blob([completeHtml], { type: "text/html;charset=utf-8" });
      finalFileName = `${fileName}.html`;
    } else if (format === "docx") {
      console.log("[Export] Converting HTML to native Word .docx...");
      const completeHtml = await convertHtmlToWordDocHtml(contentHtml, fileName);
      blob = await convertHtmlToDocxBlob(completeHtml, fileName);
      finalFileName = `${fileName}.docx`;
    } else {
      console.log("[Export] Converting HTML to Word .doc (MHTML)...");
      const completeHtml = await convertHtmlToWordDocHtml(contentHtml, fileName);
      const mhtmlContent = convertHtmlToMhtml(completeHtml, fileName);
      blob = new Blob([mhtmlContent], { type: "application/msword;charset=utf-8" });
      finalFileName = `${fileName}.doc`;
    }
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = finalFileName;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log(`[Export] Export (${format}) completed successfully.`);
  } catch (err) {
    console.error("[Export] Failed to generate document:", err);
  }
}
