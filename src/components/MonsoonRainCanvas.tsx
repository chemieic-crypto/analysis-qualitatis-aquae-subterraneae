import React, { useEffect, useRef } from "react";

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  wind: number;
  alpha: number;
  width: number;
  depth: number;
}

interface WaterRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

const MonsoonRainCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animId = 0;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const drops: RainDrop[] = [];
    const ripples: WaterRipple[] = [];

    const createDrop = (randomY: boolean): RainDrop => {
      const depth = Math.random(); // 0 = far background, 1 = close foreground
      return {
        x: Math.random() * (width + 80) - 40,
        y: randomY ? Math.random() * height : -20 - Math.random() * 60,
        len: 12 + depth * 22,
        speed: 5.5 + depth * 8.5,
        wind: 1.2 + depth * 1.4,
        alpha: 0.14 + depth * 0.42,
        width: 0.75 + depth * 1.05,
        depth,
      };
    };

    const initRain = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      width = Math.max(320, Math.round(rect?.width || canvas.clientWidth || 1200));
      height = Math.max(80, Math.round(rect?.height || canvas.clientHeight || 120));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = Math.max(45, Math.min(95, Math.round(width / 15)));
      drops.length = 0;
      for (let i = 0; i < targetCount; i++) {
        drops.push(createDrop(true));
      }
    };

    const renderFrame = (animate: boolean) => {
      ctx.clearRect(0, 0, width, height);

      // Subtle glossy water-horizon reflection band at bottom of header
      const floorGrad = ctx.createLinearGradient(0, height - 24, 0, height);
      floorGrad.addColorStop(0, "rgba(56, 189, 248, 0)");
      floorGrad.addColorStop(1, "rgba(56, 189, 248, 0.14)");
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, height - 24, width, 24);

      // Render raindrops with bright tip specular gradient
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const tailX = d.x - d.wind * (d.len / d.speed);
        const tailY = d.y - d.len;

        const grad = ctx.createLinearGradient(tailX, tailY, d.x, d.y);
        grad.addColorStop(0, "rgba(186, 230, 253, 0)");
        grad.addColorStop(0.7, `rgba(125, 211, 252, ${(d.alpha * 0.65).toFixed(3)})`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${Math.min(0.95, d.alpha + 0.25).toFixed(3)})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = d.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();

        if (animate) {
          d.x += d.wind;
          d.y += d.speed;

          if (d.y >= height - 6) {
            if (d.depth > 0.35 && ripples.length < 28) {
              ripples.push({
                x: d.x,
                y: height - 3 - Math.random() * 5,
                radius: 1.5,
                maxRadius: 9 + d.depth * 14,
                alpha: 0.48 * d.depth + 0.18,
              });
            }
            const next = createDrop(false);
            drops[i] = next;
          } else if (d.x > width + 50) {
            d.x = -30;
          }
        }
      }

      // Render elliptical splash ripples along the bottom water line
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        ctx.strokeStyle = `rgba(186, 230, 253, ${r.alpha.toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.26, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (animate) {
          r.radius += 0.55;
          r.alpha *= 0.91;
          if (r.radius >= r.maxRadius || r.alpha < 0.03) {
            ripples.splice(i, 1);
          }
        }
      }

      if (animate) {
        animId = requestAnimationFrame(() => renderFrame(true));
      }
    };

    initRain();
    renderFrame(!prefersReducedMotion);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => initRain())
        : null;
    if (resizeObserver && canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full z-[2]"
    />
  );
};

export default MonsoonRainCanvas;
