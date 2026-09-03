export const hexToRgb = (hexStr: string) => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hexStr.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return res
    ? {
        r: parseInt(res[1], 16),
        g: parseInt(res[2], 16),
        b: parseInt(res[3], 16),
      }
    : { r: 59, g: 130, b: 246 };
};

export const parseColorArgs = (argsStr: string): string[] => {
  return argsStr.replace(/[\/,]/g, " ").trim().split(/\s+/).filter(Boolean);
};

// Precise OKLCH to RGB parsing and conversion to avoid html2canvas crash in Tailwind CSS v4 environment
export const oklchToRgbStr = (oklchStr: string): string => {
  try {
    const cleaned = oklchStr.trim();
    if (!cleaned.toLowerCase().startsWith("oklch")) return oklchStr;
    const content = cleaned.replace(/^oklch\s*\(/i, "").replace(/\)$/, "");

    const args = parseColorArgs(content);
    if (args.length < 3) return "rgb(128, 128, 128)";

    let l = parseFloat(args[0]);
    if (args[0].includes('%')) l /= 100;
    let c = parseFloat(args[1]);
    if (args[1].includes('%')) c /= 100;
    let h = parseFloat(args[2]);
    if (args[2].includes('%')) h = (parseFloat(args[2]) / 100) * 360;

    let alpha = 1;
    if (args[3]) {
      if (args[3].includes('%')) {
        alpha = parseFloat(args[3]) / 100;
      } else {
        alpha = parseFloat(args[3]);
      }
    }

    const hueRad = (h * Math.PI) / 180;
    const a = c * Math.cos(hueRad);
    const b = c * Math.sin(hueRad);

    const l_lms = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_lms = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_lms = l - 0.0894841775 * a - 1.2914855414 * b;

    const l_cube = Math.pow(Math.max(0, l_lms), 3);
    const m_cube = Math.pow(Math.max(0, m_lms), 3);
    const s_cube = Math.pow(Math.max(0, s_lms), 3);

    let r_lin =  4.0767416621 * l_cube - 3.3077115913 * m_cube + 0.2309699292 * s_cube;
    let g_lin = -1.2684380046 * l_cube + 2.6097574011 * m_cube - 0.3413193965 * s_cube;
    let b_lin = -0.0041960863 * l_cube - 0.7034186147 * m_cube + 1.7076147010 * s_cube;

    const toSRGB = (x: number) => {
      const clamped = Math.max(0, Math.min(1, x));
      return clamped > 0.0031308
        ? 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
        : 12.92 * clamped;
    };

    const r = Math.round(toSRGB(r_lin) * 255);
    const g = Math.round(toSRGB(g_lin) * 255);
    const srgb_b = Math.round(toSRGB(b_lin) * 255);

    if (isNaN(r) || isNaN(g) || isNaN(srgb_b)) {
      return "rgb(128, 128, 128)";
    }

    if (alpha === 1) {
      return `rgb(${r}, ${g}, ${srgb_b})`;
    } else {
      return `rgba(${r}, ${g}, ${srgb_b}, ${alpha})`;
    }
  } catch (e) {
    return "rgb(128, 128, 128)";
  }
};

// Precise OKLab to RGB parsing and conversion
export const oklabToRgbStr = (oklabStr: string): string => {
  try {
    const cleaned = oklabStr.trim();
    if (!cleaned.toLowerCase().startsWith("oklab")) return oklabStr;
    const content = cleaned.replace(/^oklab\s*\(/i, "").replace(/\)$/, "");

    const args = parseColorArgs(content);
    if (args.length < 3) return "rgb(128, 128, 128)";

    let l = parseFloat(args[0]);
    if (args[0].includes('%')) l /= 100;
    let a = parseFloat(args[1]);
    if (args[1].includes('%')) a = (parseFloat(args[1]) / 100) * 0.4;
    let b = parseFloat(args[2]);
    if (args[2].includes('%')) b = (parseFloat(args[2]) / 100) * 0.4;

    let alpha = 1;
    if (args[3]) {
      if (args[3].includes('%')) {
        alpha = parseFloat(args[3]) / 100;
      } else {
        alpha = parseFloat(args[3]);
      }
    }

    const l_lms = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_lms = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_lms = l - 0.0894841775 * a - 1.2914855414 * b;

    const l_cube = Math.pow(Math.max(0, l_lms), 3);
    const m_cube = Math.pow(Math.max(0, m_lms), 3);
    const s_cube = Math.pow(Math.max(0, s_lms), 3);

    let r_lin =  4.0767416621 * l_cube - 3.3077115913 * m_cube + 0.2309699292 * s_cube;
    let g_lin = -1.2684380046 * l_cube + 2.6097574011 * m_cube - 0.3413193965 * s_cube;
    let b_lin = -0.0041960863 * l_cube - 0.7034186147 * m_cube + 1.7076147010 * s_cube;

    const toSRGB = (x: number) => {
      const clamped = Math.max(0, Math.min(1, x));
      return clamped > 0.0031308
        ? 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
        : 12.92 * clamped;
    };

    const r = Math.round(toSRGB(r_lin) * 255);
    const g = Math.round(toSRGB(g_lin) * 255);
    const srgb_b = Math.round(toSRGB(b_lin) * 255);

    if (isNaN(r) || isNaN(g) || isNaN(srgb_b)) {
      return "rgb(128, 128, 128)";
    }

    if (alpha === 1) {
      return `rgb(${r}, ${g}, ${srgb_b})`;
    } else {
      return `rgba(${r}, ${g}, ${srgb_b}, ${alpha})`;
    }
  } catch (e) {
    return "rgb(128, 128, 128)";
  }
};

// Robust parser supporting arbitrary nested parentheses for oklch() and oklab() occurrences
export const replaceOklabAndOklchNested = (str: string): string => {
  if (!str) return str;
  const lower = str.toLowerCase();
  if (!lower.includes("oklch") && !lower.includes("oklab")) {
    return str;
  }

  let result = "";
  let i = 0;
  const len = str.length;

  while (i < len) {
    const char = str[i];
    const isOklch = (char === 'o' || char === 'O') && str.slice(i, i + 6).toLowerCase() === "oklch(";
    const isOklab = (char === 'o' || char === 'O') && str.slice(i, i + 6).toLowerCase() === "oklab(";

    if (isOklch || isOklab) {
      const startIdx = i;
      i += 6; // Move past oklch( or oklab(

      let parenCount = 1;
      let content = "";
      while (i < len && parenCount > 0) {
        const c = str[i];
        if (c === "(") {
          parenCount++;
        } else if (c === ")") {
          parenCount--;
        }
        if (parenCount > 0) {
          content += c;
        }
        i++;
      }

      const fullExpr = (isOklch ? "oklch(" : "oklab(") + content + ")";
      let converted = "rgb(128, 128, 128)";
      if (isOklch) {
        converted = oklchToRgbStr(fullExpr);
      } else {
        converted = oklabToRgbStr(fullExpr);
      }
      result += converted;
    } else {
      result += char;
      i++;
    }
  }

  if (result.toLowerCase().includes("oklab") || result.toLowerCase().includes("oklch")) {
    result = result
      .replace(/oklab\s*\([^)]+\)/gi, "rgb(128, 128, 128)")
      .replace(/oklch\s*\([^)]+\)/gi, "rgb(128, 128, 128)");
  }

  return result;
};

export const convertOklchAndOklabInStyle = (styleValue: string): string => {
  return replaceOklabAndOklchNested(styleValue);
};

export const sanitizeColorsForHtml2canvas = (clonedDoc: Document) => {
  // 1. Sanitize style attributes for oklch, oklab, backdrop-filters, and inset box shadows
  try {
    const allElements = clonedDoc.querySelectorAll("*");
    allElements.forEach((el: any) => {
      if (!(el instanceof HTMLElement)) return;
      try {
        if (el.style) {
          // Remove backdrop-filter which causes solid black/grey box distortions in html2canvas
          if (el.style.backdropFilter) {
            el.style.backdropFilter = "none";
          }
          if ((el.style as any).webkitBackdropFilter) {
            (el.style as any).webkitBackdropFilter = "none";
          }

          // Strip CSS filters (e.g. drop-shadow) that cause text vertical offset or blur artifacting in html2canvas
          if (el.style.filter && (el.style.filter.includes("drop-shadow") || el.style.filter.includes("blur"))) {
            el.style.filter = "none";
          }

          // Strip hover/transition transforms on cards & badges so they capture flat and aligned
          if (el.style.transform && (el.style.transform.includes("translate") || el.style.transform.includes("scale"))) {
            if (!el.tagName.toLowerCase().includes("path") && !el.tagName.toLowerCase().includes("g")) {
              el.style.transform = "none";
            }
          }

          // Fix box shadows with inset or multiple layers that html2canvas cannot render
          const bs = el.style.boxShadow;
          if (bs && (bs.includes("inset") || bs.split(",").length > 2)) {
            el.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.08)";
          }

          // Prevent text clipping in html2canvas caused by tight line-heights or overflow:hidden/truncate
          const tagName = el.tagName.toLowerCase();
          if (["span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "b", "strong", "a"].includes(tagName)) {
            el.style.setProperty("overflow", "visible", "important");
            el.style.setProperty("text-overflow", "clip", "important");
            
            const lh = el.style.lineHeight;
            if (!lh || lh === "1" || lh === "none" || lh.includes("none")) {
              el.style.setProperty("line-height", "1.35", "important");
            }
          }

          // Ensure card containers don't clip text or subpixel elements
          if (el.classList.contains("group") || el.classList.contains("rounded-2xl") || el.classList.contains("rounded-xl")) {
            el.style.setProperty("overflow", "visible", "important");
          }

          const styleProps = ["color", "backgroundColor", "borderColor", "border", "background", "boxShadow"];
          styleProps.forEach((prop) => {
            const val = el.style[prop as any];
            if (val && typeof val === "string") {
              if (val.toLowerCase().includes("oklch") || val.toLowerCase().includes("oklab")) {
                const newVal = replaceOklabAndOklchNested(val);
                if (newVal !== val) {
                  el.style[prop as any] = newVal;
                }
              }
            }
          });
        }
      } catch (err) {}
    });
  } catch (err) {}

  // 2. Convert inside style sheet text
  try {
    const styleTags = clonedDoc.querySelectorAll("style");
    styleTags.forEach((styleTag) => {
      try {
        let cssText = styleTag.textContent || "";
        const lowerCss = cssText.toLowerCase();
        if (lowerCss.includes("oklch") || lowerCss.includes("oklab")) {
          styleTag.textContent = replaceOklabAndOklchNested(cssText);
        }
      } catch (err) {}
    });
  } catch (err) {}
};

// Global wrapper that temporarily sanitizes main document styles to prevent html2canvas parsing crashes
export const safeHtml2canvas = async (
  element: HTMLElement,
  options?: any
): Promise<HTMLCanvasElement> => {
  const html2canvasModule = await import("html2canvas");
  const html2canvas = html2canvasModule.default;

  // 1. Capture original text of all <style> elements on the main document to restore later
  const styleElements = Array.from(document.querySelectorAll("style"));
  const originalStyles = styleElements.map((tag) => ({
    tag,
    text: tag.textContent || "",
  }));

  // 2. Temporarily sanitize oklch and oklab colors in the main document's style tags
  styleElements.forEach((tag) => {
    try {
      const text = tag.textContent || "";
      if (text.includes("oklch") || text.includes("oklab")) {
        tag.textContent = convertOklchAndOklabInStyle(text);
      }
    } catch (err) {
      console.warn("Failed to temporarily sanitize style tag:", err);
    }
  });

  // 2b. Monkeypatch the main window's getComputedStyle to sanitize on-the-fly
  const originalGetComputedStyle = window.getComputedStyle;
  const styleProxyHandler = {
    get(target: any, prop: string | symbol) {
      if (prop === 'getPropertyValue') {
        return (propertyName: string) => {
          const val = target.getPropertyValue(propertyName);
          if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
            return replaceOklabAndOklchNested(val);
          }
          return val;
        };
      }
      const val = target[prop];
      if (typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
        return replaceOklabAndOklchNested(val);
      }
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    }
  };

  try {
    window.getComputedStyle = function (el, pseudoElt) {
      const style = originalGetComputedStyle.call(this, el, pseudoElt);
      return new Proxy(style, styleProxyHandler);
    };
  } catch (err) {
    console.warn("Failed to monkeypatch window.getComputedStyle:", err);
  }

  // Calculate target dimensions
  const finalOptions = { ...options };
  const targetWidth = finalOptions.width || element.offsetWidth || 1200;
  const targetHeight = finalOptions.height || element.offsetHeight || 800;

  // Assign a temporary unique ID if the element doesn't have one to find it in the cloned iframe document
  const originalId = element.id;
  const tempId = originalId || "safe-html2canvas-temp-id-" + Math.random().toString(36).substring(2, 11);
  if (!originalId) {
    element.id = tempId;
  }

  // Save scroll position of all parent elements to prevent scrolled containers from clipping
  const scrollableParents: { el: HTMLElement; scrollTop: number; scrollLeft: number }[] = [];
  try {
    let parent = element.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      if (parent.scrollTop > 0 || parent.scrollLeft > 0) {
        scrollableParents.push({
          el: parent,
          scrollTop: parent.scrollTop,
          scrollLeft: parent.scrollLeft
        });
        parent.scrollTop = 0;
        parent.scrollLeft = 0;
      }
      parent = parent.parentElement;
    }
  } catch (e) {
    console.warn("Failed to reset parent scroll positions:", e);
  }

  // Save scroll position to prevent scrolled page from clipping the captured element in html2canvas
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;

  // Temporarily force scroll-behavior to auto to prevent smooth scroll transition delays
  const htmlScrollBehavior = document.documentElement.style.scrollBehavior;
  const bodyScrollBehavior = document.body.style.scrollBehavior;
  try {
    document.documentElement.style.scrollBehavior = "auto";
    document.body.style.scrollBehavior = "auto";
  } catch (e) {}

  // Instant scroll to top left
  try {
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    document.body.scrollTop = 0;
    document.body.scrollLeft = 0;
  } catch (e) {}
  window.scrollTo(0, 0);

  // Define onclone to sanitize OKLCH colors, box shadows, and grid containers in the cloned document
  const originalOnClone = finalOptions.onclone;
  finalOptions.onclone = (clonedDoc: Document) => {
    // Find the cloned target element inside the iframe's cloned document
    let iframeClonedElement = clonedDoc.getElementById(tempId);
    if (!iframeClonedElement && originalId) {
      iframeClonedElement = clonedDoc.getElementById(originalId);
    }

    // Unconstrain ancestor elements without breaking display: flex / display: grid
    if (iframeClonedElement) {
      try {
        iframeClonedElement.style.setProperty("transform", "none", "important");
        iframeClonedElement.style.setProperty("max-width", "none", "important");
        iframeClonedElement.style.setProperty("max-height", "none", "important");

        if (targetWidth > 0) {
          iframeClonedElement.style.setProperty("width", `${targetWidth}px`, "important");
          iframeClonedElement.style.setProperty("min-width", `${targetWidth}px`, "important");
        }

        let current: HTMLElement | null = iframeClonedElement.parentElement;
        while (current && current !== clonedDoc.body && current !== clonedDoc.documentElement) {
          current.style.setProperty("max-width", "none", "important");
          current.style.setProperty("max-height", "none", "important");
          current.style.setProperty("overflow", "visible", "important");
          current.style.setProperty("transform", "none", "important");
          current.style.setProperty("clip-path", "none", "important");
          current.style.setProperty("mask", "none", "important");
          if (targetWidth > 0) {
            current.style.setProperty("width", `${targetWidth}px`, "important");
          }
          current = current.parentElement;
        }

        const effectiveW = Math.max(1600, targetWidth);

        if (clonedDoc.body) {
          clonedDoc.body.style.setProperty("overflow", "visible", "important");
          clonedDoc.body.style.setProperty("width", `${effectiveW}px`, "important");
          clonedDoc.body.style.setProperty("margin", "0", "important");
          clonedDoc.body.style.setProperty("padding", "0", "important");
        }
        if (clonedDoc.documentElement) {
          clonedDoc.documentElement.style.setProperty("overflow", "visible", "important");
          clonedDoc.documentElement.style.setProperty("width", `${effectiveW}px`, "important");
          clonedDoc.documentElement.style.setProperty("margin", "0", "important");
          clonedDoc.documentElement.style.setProperty("padding", "0", "important");
        }
      } catch (unconstrainErr) {
        console.warn("Failed to unconstrain ancestor elements in cloned document:", unconstrainErr);
      }
    }

    try {
      sanitizeColorsForHtml2canvas(clonedDoc);
    } catch (err) {
      console.warn("Failed to sanitize cloned document colors:", err);
    }

    try {
      const cropOverlay = clonedDoc.getElementById("draggable-crop-box");
      if (cropOverlay) {
        cropOverlay.remove();
      }
    } catch (err) {}

    try {
      const exportHideElements = clonedDoc.querySelectorAll('[data-export-hide="true"], .export-hide');
      exportHideElements.forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    } catch (err) {}

    // Monkeypatch getComputedStyle in the cloned iframe's window as well
    try {
      const clonedWin = clonedDoc.defaultView;
      if (clonedWin) {
        const originalClonedGetComputedStyle = clonedWin.getComputedStyle;
        clonedWin.getComputedStyle = function (el, pseudoElt) {
          const style = originalClonedGetComputedStyle.call(this, el, pseudoElt);
          return new Proxy(style, styleProxyHandler);
        };
      }
    } catch (err) {
      console.warn("Failed to monkeypatch cloned window.getComputedStyle:", err);
    }

    if (originalOnClone) {
      try {
        originalOnClone(clonedDoc, iframeClonedElement || undefined as any);
      } catch (err) {
        console.warn("Error in original onclone callback:", err);
      }
    }
  };

  try {
    const renderScale = Math.min(3, Math.max(2, finalOptions.scale || 3));
    const effectiveWindowW = Math.max(1600, targetWidth);
    const effectiveWindowH = Math.max(1200, targetHeight);

    const html2canvasOptions = {
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      ...finalOptions,
      // Enforce controlled scale and window dimensions
      scale: renderScale,
      windowWidth: effectiveWindowW,
      windowHeight: effectiveWindowH
    };

    const { onAfterCapture, ...pureHtml2canvasOptions } = html2canvasOptions;

    // Run html2canvas directly on the original element!
    let canvas = await html2canvas(element, pureHtml2canvasOptions);

    if (onAfterCapture) {
      canvas = await onAfterCapture(canvas);
    }
    return canvas;
  } finally {
    // Restore parent scroll positions
    scrollableParents.forEach(({ el, scrollTop, scrollLeft }) => {
      try {
        el.scrollTop = scrollTop;
        el.scrollLeft = scrollLeft;
      } catch (e) {}
    });

    // Restore scroll position and scroll behavior
    try {
      window.scrollTo(originalScrollX, originalScrollY);
      document.documentElement.style.scrollBehavior = htmlScrollBehavior;
      document.body.style.scrollBehavior = bodyScrollBehavior;
    } catch (e) {}

    // Restore original getComputedStyle
    try {
      window.getComputedStyle = originalGetComputedStyle;
    } catch (err) {
      console.warn("Failed to restore window.getComputedStyle:", err);
    }

    // Restore original style tags on the main document
    originalStyles.forEach(({ tag, text }) => {
      try {
        tag.textContent = text;
      } catch (err) {
        console.warn("Failed to restore style tag content:", err);
      }
    });

    // Restore original ID if it was temporarily assigned
    if (!originalId) {
      try {
        element.removeAttribute("id");
      } catch (e) {}
    }
  }
};
