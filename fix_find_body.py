import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_body = r'''    groupList.forEach\(\(g\) => \{
      const targetName = nameOverrides\[g.name\] \|\| g.name;'''
good_body = '''    gList.forEach((g) => {
      const targetName = nameOverrides[g.name] || g.name;'''
code = re.sub(bad_body, good_body, code)

# Let's also verify that featureMatchCache caches the name, not the object!
# Because if it caches the old GroupData object, the map colors still won't update
# Wait, I didn't change it to cache name because the replace failed. Let's do it now.

bad_cache = r'''    if \(bestScore >= 0\.55\) \{
      featureMatchCache\.current\.set\(f, bestGroup\);
      return bestGroup;
    \}
    featureMatchCache\.current\.set\(f, null\);
    return null;
  \};'''

good_cache = '''    if (bestScore >= 0.55 && bestGroup) {
      featureMatchCache.current.set(f, bestGroup.name);
      return bestGroup;
    }
    featureMatchCache.current.set(f, null);
    return null;
  };'''

code = re.sub(bad_cache, good_cache, code)

# And also the top of the function:
bad_top = r'''    if \(featureMatchCache\.current\.has\(f\)\) \{
      return featureMatchCache\.current\.get\(f\);
    \}'''

good_top = '''    if (featureMatchCache.current.has(f)) {
      const cachedName = featureMatchCache.current.get(f);
      if (cachedName) return gList.find(g => g.name === cachedName) || null;
      return null;
    }'''

code = re.sub(bad_top, good_top, code)

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
