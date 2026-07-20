import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

# Replace hardcoded groupList in hover logic
hover_logic = r'''      // Find nearest centroid in screen coordinates to trigger interactive tooltips
      const width = canvas\.width;
      const height = canvas\.height;
      let nearest: GroupData \| null = null;
      let minDist = 35; // Maximum distance to trigger tooltip \(in pixels\)

      groupList\.forEach\(\(g\) => \{'''

new_hover_logic = '''      // Find nearest centroid in screen coordinates to trigger interactive tooltips
      const width = canvas.width;
      const height = canvas.height;
      let nearest: GroupData | null = null;
      let minDist = 35; // Maximum distance to trigger tooltip (in pixels)
      
      const isPostCanvas = sideBySide && canvas === canvasPostRef.current;
      const gList = isPostCanvas ? groupListPost : (sideBySide ? groupListPre : groupList);

      gList.forEach((g) => {'''

code = re.sub(hover_logic, new_hover_logic, code)

# Fix handleCanvasClickEvent
click_logic = r'''    \} else \{
      // Fallback: Check if clicked near any of the centroids in gList
      const gList = sideBySide \? groupListPre : groupList;'''

new_click_logic = '''    } else {
      // Fallback: Check if clicked near any of the centroids in gList
      const isPostCanvas = sideBySide && canvas === canvasPostRef.current;
      const gList = isPostCanvas ? groupListPost : (sideBySide ? groupListPre : groupList);'''

code = re.sub(click_logic, new_click_logic, code)


with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
