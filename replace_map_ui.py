import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    lines = f.readlines()

# 1. We need to add showRegionNames toggle to UI
# We'll find: <label className="text-[8px] font-bold text-slate-500">Font Size</label>
# And add a toggle before it, or somewhere near stateFontSize UI.
start_idx = -1
for i, line in enumerate(lines):
    if 'value={stateFontSize}' in line:
        start_idx = i
        break

if start_idx != -1:
    ui_toggle = '''                    <label className="flex items-center gap-1.5 cursor-pointer mt-3">
                      <input type="checkbox" checked={showRegionNames} onChange={(e) => setShowRegionNames(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-2.5 h-2.5" />
                      <span className="text-[9px] font-bold text-slate-600">Show Region Names</span>
                    </label>
'''
    # Find the beginning of this styling group, which is probably `<div>` above
    # Let's just insert it above the `Font Size` field
    lines.insert(start_idx - 5, ui_toggle)

# 2. Fix the GeoJSON label rendering loop
# We look for `if (baseLabel) {` around line 1139
for i, line in enumerate(lines):
    if 'const baseLabel = String(f.properties?.[layer.labelKey] || "");' in line:
        # replace the block
        old_block_end = i + 10 # approximate
        new_block = '''                if (showRegionNames && baseLabel) {
                  const labelText = nameOverrides[baseLabel] || baseLabel;
                  const labelLower = labelText.trim().toLowerCase();
                  if (!drawnNames.has(labelLower)) {
                    drawnNames.add(labelLower);
                    ctx.font = `${stateFontStyle} ${stateFontSize || layer.labelSize || 9}px ${stateFontFamily || "sans-serif"}`;
                    ctx.fillStyle = stateFontColor || layer.labelColor || "#0f172a";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(labelText, sx, sy);
                  }
                }
'''
        # Let's find exactly where it ends:
        j = i + 1
        while j < len(lines) and '}' not in lines[j] or 'ctx.fillText' in lines[j-1]:
            if 'ctx.fillText' in lines[j]:
                j += 2
                break
            j += 1
        lines[i+1:j] = [new_block]
        break

# 3. Add drawnNames and showRegionNames to dependency array of useEffect
for i, line in enumerate(lines):
    if 'stateFontSize,' in line:
        lines.insert(i + 1, '    showRegionNames,\n    drawnNames,\n')
        break

# 4. Fix Centroid drawing
centroid_start = -1
for i, line in enumerate(lines):
    if 'screenCentroids.forEach(({ sx, sy, g }) => {' in line:
        centroid_start = i
        break

if centroid_start != -1:
    new_centroid = '''    // Draw Centroids as text labels
    if (showRegionNames) {
      screenCentroids.forEach(({ sx, sy, g }) => {
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) return;
        
        let displayName = nameOverrides[g.name] || g.name;
        if (useShortNames) {
          displayName = getShortName(displayName, reportingLevel, useShortNames);
        }
        const shortName = displayName.length > 15 ? displayName.substring(0, 13) + ".." : displayName;
        const labelLower = displayName.trim().toLowerCase();
        
        if (!drawnNames.has(labelLower)) {
          drawnNames.add(labelLower);
          ctx.save();
          ctx.font = `${stateFontStyle} ${stateFontSize}px ${stateFontFamily}`;
          ctx.fillStyle = stateFontColor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(shortName, sx, sy);
          ctx.restore();
        }
      });
    }
'''
    j = centroid_start + 1
    while j < len(lines):
        if '});' in lines[j]:
            j += 1
            break
        j += 1
    lines[centroid_start - 1:j] = [new_centroid]


with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.writelines(lines)
