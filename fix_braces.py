with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'if (count > 0) {' in line:
        start_idx = i
        break

new_block = '''            if (count > 0) {
              const lon = avgLon / count;
              const lat = avgLat / count;
              const [sx, sy] = project(lon, lat, width, height);
              
              if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) {
                const baseLabel = String(f.properties?.[layer.labelKey] || "");
                if (showRegionNames && baseLabel) {
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
              }
            }
          }
'''

end_idx = start_idx
while end_idx < len(lines):
    if '} catch (err) {' in lines[end_idx]:
        break
    end_idx += 1

lines[start_idx:end_idx] = [new_block]

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.writelines(lines)
