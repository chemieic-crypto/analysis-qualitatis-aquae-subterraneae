import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

draw_map_orig = '''  const drawMapOnCanvas = (canvas: HTMLCanvasElement, gList: GroupData[], titleText: string, subtitleText: string) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;'''

draw_map_new = '''  const drawMapOnCanvas = (canvas: HTMLCanvasElement, gList: GroupData[], titleText: string, subtitleText: string) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset transform before scaling to avoid cumulative scales
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(pixelRatio, pixelRatio);

    const width = canvas.width / pixelRatio;
    const height = canvas.height / pixelRatio;'''

code = code.replace(draw_map_orig, draw_map_new)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
