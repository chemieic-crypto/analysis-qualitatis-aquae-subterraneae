import re
with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

bad_find = r'''  const findGroupForFeature = \(f: any\) => \{
    if \(!f \|\| !f\.properties\) return null;
    
    if \(featureMatchCache\.current\.has\(f\)\) \{
      return featureMatchCache\.current\.get\(f\);
    \}

    const propValues = Object\.values\(f\.properties\)\.map\(v => String\(v\)\.trim\(\)\);

    const getFuzzyScore = \(s1: string, s2: string\): number => \{
      const str1 = s1\.toLowerCase\(\);
      const str2 = s2\.toLowerCase\(\);
      if \(str1 === str2\) return 1;
      if \(str1\.includes\(str2\) \|\| str2\.includes\(str1\)\) return 0\.8;
      
      const set1 = new Set\(str1\.split\(""\)\);
      const set2 = new Set\(str2\.split\(""\)\);
      const intersection = new Set\(\[...set1\]\.filter\(x => set2\.has\(x\)\)\);
      const union = new Set\(\[...set1, ...set2\]\);
      return intersection\.size / union\.size;
    \};

    let bestGroup = null;
    let bestScore = -1;

    groupList\.forEach\(\(g\) => \{
      const targetName = nameOverrides\[g\.name\] \|\| g\.name;
      
      let localBest = -1;
      propValues\.forEach\(v => \{
        const score = getFuzzyScore\(v, targetName\);
        if \(score > localBest\) localBest = score;
      \}\);

      if \(localBest > bestScore\) \{
        bestScore = localBest;
        bestGroup = g;
      \}
    \}\);

    // Require a confidence threshold
    if \(bestScore >= 0\.55\) \{
      featureMatchCache\.current\.set\(f, bestGroup\);
      return bestGroup;
    \}
    featureMatchCache\.current\.set\(f, null\);
    return null;
  \};'''

good_find = '''  const findGroupForFeature = (f: any, gList: any[]) => {
    if (!f || !f.properties) return null;
    
    let matchedName = featureMatchCache.current.get(f);

    if (matchedName === undefined) {
      const propValues = Object.values(f.properties).map(v => String(v).trim());

      const getFuzzyScore = (s1: string, s2: string): number => {
        const str1 = s1.toLowerCase();
        const str2 = s2.toLowerCase();
        if (str1 === str2) return 1;
        if (str1.includes(str2) || str2.includes(str1)) return 0.8;
        
        const set1 = new Set(str1.split(""));
        const set2 = new Set(str2.split(""));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
      };

      let bestGroup = null;
      let bestScore = -1;

      gList.forEach((g) => {
        const targetName = nameOverrides[g.name] || g.name;
        
        let localBest = -1;
        propValues.forEach(v => {
          const score = getFuzzyScore(v, targetName);
          if (score > localBest) localBest = score;
        });

        if (localBest > bestScore) {
          bestScore = localBest;
          bestGroup = g;
        }
      });

      if (bestScore >= 0.55 && bestGroup) {
        matchedName = bestGroup.name;
        featureMatchCache.current.set(f, matchedName);
      } else {
        matchedName = null;
        featureMatchCache.current.set(f, null);
      }
    }

    if (matchedName) {
      return gList.find(g => g.name === matchedName) || null;
    }
    return null;
  };'''

code = re.sub(bad_find, good_find, code)

# Update callers
code = code.replace('const matchedGroup = findGroupForFeature(f);', 'const matchedGroup = findGroupForFeature(f, gList);')

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
