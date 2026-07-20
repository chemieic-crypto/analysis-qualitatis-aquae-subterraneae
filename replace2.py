import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Canvas resolution
code = code.replace(
    'width={currentLayout.width}',
    'width={currentLayout.width * pixelRatio}'
).replace(
    'height={currentLayout.height}',
    'height={currentLayout.height * pixelRatio}'
)

# Replace 3D canvas styles and remove cinematic/isometric
canvas_style_regex = re.compile(r'style=\{\{[\s\S]*?objectFit: "contain",\s*\}\}', re.MULTILINE)
code = canvas_style_regex.sub('style={{ width: "100%", height: "100%", objectFit: "contain" }}', code)
code = code.replace(
    'className={`w-full h-full block bg-transparent ${isCinematic ? "transition-none" : "transition-transform duration-700 ease-out"} pointer-events-auto ${\n              isDragging ? "cursor-grabbing" : "cursor-grab"\n            }`}',
    'className={`w-full h-full block bg-transparent pointer-events-auto ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}'
)

# Remove the Advanced Rendering Modes menu
advanced_menu_regex = re.compile(r'<div className="bg-slate-50/50 p-2 rounded-xl border border-slate-100">\s*<h4 className="text-slate-800 font-bold text-\[10px\] uppercase mb-2">Advanced Rendering Modes</h4>.*?</div>\s*</div>', re.DOTALL)
code = advanced_menu_regex.sub('</div>', code)

# Remove 3d isometric tooltip condition
code = code.replace('{!isIsometric && hoveredGroup && (', '{hoveredGroup && (')

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
