import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# 1. replace sideBySide state with a computed value from seasonFilter
code = re.sub(
    r'const \[sideBySide, setSideBySide\] = useState<boolean>\(false\);',
    r'const sideBySide = seasonFilter === "both";',
    code
)

# 2. Add second canvas in JSX if sideBySide is true
jsx_canvas = r'''        <div className={`\$\{currentLayout\.style\} relative flex-1 min-w-0 border border-slate-100 rounded-2xl bg-slate-50/30 overflow-hidden select-none`}>
          <canvas
            ref=\{canvasRef\}
            width=\{currentLayout\.width \* pixelRatio\}
            height=\{currentLayout\.height \* pixelRatio\}
            onMouseDown=\{handleMouseDown\}
            onMouseMove=\{handleMouseMove\}
            onMouseUp=\{handleMouseUp\}
            onMouseLeave=\{handleMouseUp\}
            className=\{`w-full h-full block bg-transparent pointer-events-auto \$\{isDragging \? "cursor-grabbing" : "cursor-grab"\}`\}
            style=\{\{ width: "100%", height: "100%", objectFit: "contain" \}\}
          />'''

new_jsx_canvas = '''        <div className={`flex flex-col sm:flex-row gap-4 ${currentLayout.style} relative flex-1 min-w-0 border border-slate-100 rounded-2xl bg-slate-50/30 overflow-hidden select-none`}>
          <div className="flex-1 relative min-w-0 h-full">
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
            />
          </div>
          {sideBySide && (
            <div className="flex-1 relative min-w-0 h-full border-l border-slate-200/50">
              <canvas
                ref={canvasPostRef}
                width={currentLayout.width * pixelRatio}
                height={currentLayout.height * pixelRatio}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`w-full h-full block bg-transparent pointer-events-auto ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}'''
code = re.sub(jsx_canvas, new_jsx_canvas, code)

# 3. Add year to map title
# the map title is currently generated in renderMap
render_map_code = r'''  const renderMap = \(\) => \{
    if \(canvasRef\.current\) \{
      const gList = sideBySide \? groupListPre : groupList;
      const title = sideBySide \? `Heat Map For \$\{activeParam\} \(Pre\)` : customMapTitle \|\| `Heat Map For \$\{activeParam\}`;
      const subtitle = sideBySide \? `Pre-Monsoon` : `\$\{seasonFilter === "both" \? "All Seasons" : seasonFilter === "pre" \? "Pre-Monsoon" : "Post-Monsoon"\}`;
      drawMapOnCanvas\(canvasRef\.current, gList, title, subtitle\);
    \}
    if \(sideBySide && canvasPostRef\.current\) \{
      const title = `Heat Map For \$\{activeParam\} \(Post\)`;
      const subtitle = `Post-Monsoon`;
      drawMapOnCanvas\(canvasPostRef\.current, groupListPost, title, subtitle\);
    \}
  \};'''

new_render_map_code = '''  const renderMap = () => {
    let yearStr = "";
    if (rawData && rawData.length > 0 && headers.year) {
      const years = Array.from(new Set(rawData.map((d: any) => d[headers.year]).filter(Boolean)));
      if (years.length > 0) yearStr = ` ${years.join(", ")}`;
    }

    if (canvasRef.current) {
      const gList = sideBySide ? groupListPre : groupList;
      const baseTitle = sideBySide ? `Heat Map For ${activeParam} (Pre)` : customMapTitle || `Heat Map For ${activeParam}`;
      const title = `${baseTitle}${yearStr}`;
      const subtitle = sideBySide ? `Pre-Monsoon` : `${seasonFilter === "both" ? "All Seasons" : seasonFilter === "pre" ? "Pre-Monsoon" : "Post-Monsoon"}`;
      drawMapOnCanvas(canvasRef.current, gList, title, subtitle);
    }
    if (sideBySide && canvasPostRef.current) {
      const baseTitle = `Heat Map For ${activeParam} (Post)`;
      const title = `${baseTitle}${yearStr}`;
      const subtitle = `Post-Monsoon`;
      drawMapOnCanvas(canvasPostRef.current, groupListPost, title, subtitle);
    }
  };'''
code = code.replace(render_map_code, new_render_map_code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
