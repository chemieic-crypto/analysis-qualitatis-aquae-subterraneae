import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

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

code = re.sub(render_map_code, new_render_map_code, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
