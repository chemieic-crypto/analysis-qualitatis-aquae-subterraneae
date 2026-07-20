import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace the broken div with the correct canvas wrapper
bad_div = '''<div className={`${currentLayout.style} relative flex-1 min-w-0 border border-slate-100 rounded-2xl bg-slate-50/30 overflow-hidden select-none`} style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />'''

good_div = '''<div className={`${currentLayout.style} relative flex-1 min-w-0 border border-slate-100 rounded-2xl bg-slate-50/30 overflow-hidden select-none`}>
          <canvas
            ref={canvasRef}
            width={currentLayout.width * pixelRatio}
            height={currentLayout.height * pixelRatio}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full block bg-transparent pointer-events-auto ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />'''

code = code.replace(bad_div, good_div)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
