import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_if = r'''            // Guard against divide by zero, infinite values, or extreme shapes
            if \(Number\.isFinite\(minY\) && Number\.isFinite\(maxY\) && maxY > minY\) \{
              // Apply a premium flat glossy sheen overlay clipped to the polygon ring bounds
              ctx\.save\(\);
            \}'''
code = re.sub(bad_if, '', code)
with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
