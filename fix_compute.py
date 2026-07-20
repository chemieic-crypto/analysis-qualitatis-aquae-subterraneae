import re

with open('src/components/GisChoroplethMap.tsx', 'r') as f:
    code = f.read()

old_compute = r'''  const computeGroupList = \(dataSubset: any\[\]\) => \{
    const safeHeaders = headers \|\| \{\};
    const groupKey =
      reportingLevel === "State"
        \? safeHeaders\.state
        : reportingLevel === "District"
        \? safeHeaders\.district
        : safeHeaders\.block;

    if \(!groupKey\) return \[\];

    const groups: Record<string, \{ lats: number\[\]; lons: number\[\]; vals: number\[\] \}> = \{\};

    const safeSubset = dataSubset \|\| \[\];

    safeSubset\.forEach\(\(row\) => \{
      if \(!row\) return;
      const gName = String\(row\[groupKey\] \|\| "Unknown"\)\.trim\(\);
      const lat = parseCoordinate\(row\[safeHeaders\.latitude\]\);
      const lon = parseCoordinate\(row\[safeHeaders\.longitude\]\);
      let val = NaN;
      if \(activeParam === "SAR" \|\| activeParam === "RSC"\) \{
        val = Number\(row\[activeParam\]\);
      \} else \{
        const key = headerMap\[activeParam\] \|\| activeParam;
        val = Number\(row\[key\]\);
      \}

      if \(!isNaN\(val\)\) \{
        if \(!groups\[gName\]\) \{
          groups\[gName\] = \{ lats: \[\], lons: \[\], vals: \[\] \};
        \}
        if \(lat !== null\) groups\[gName\]\.lats\.push\(lat\);
        if \(lon !== null\) groups\[gName\]\.lons\.push\(lon\);
        groups\[gName\]\.vals\.push\(val\);
      \}
    \}\);

    const list: GroupData\[\] = \[\];

    Object\.entries\(groups\)\.forEach\(\(\[name, data\]\) => \{
      if \(data\.vals\.length === 0\) return;

      // Calculate centroid of coordinates
      let centroidLon = 78\.96;
      let centroidLat = 20\.59;
      if \(data\.lons\.length > 0 && data\.lats\.length > 0\) \{
        centroidLon = data\.lons\.reduce\(\(a, b\) => a \+ b, 0\) / data\.lons\.length;
        centroidLat = data\.lats\.reduce\(\(a, b\) => a \+ b, 0\) / data\.lats\.length;
      \}

      // Calculate exceedance rate
      let failCount = 0;
      let sum = 0;

      data\.vals\.forEach\(\(v\) => \{
        sum \+= v;
        if \(activeParam === "SAR"\) \{
          if \(v > 26\) failCount\+\+;
        \} else if \(activeParam === "pH"\) \{
          if \(v < activeConfig\.b1 \|\| v > activeConfig\.b2\) failCount\+\+;
        \} else if \(activeConfig\.b1 === activeConfig\.b2\) \{
          if \(v > activeConfig\.b1\) failCount\+\+;
        \} else \{
          if \(v > activeConfig\.b2\) failCount\+\+;
        \}
      \}\);

      const pctExceedance = \(failCount / data\.vals\.length\) \* 100;
      const avgValue = sum / data\.vals\.length;

      list\.push\(\{
        name,
        centroidLon,
        centroidLat,
        totalSamples: data\.vals\.length,
        failCount,
        pctExceedance,
        avgValue,
      \}\);
    \}\);

    return list;
  \};'''

new_compute = '''  const computeGroupList = (dataSubset: any[]) => {
    const safeHeaders = headers || {};
    const groupKey =
      reportingLevel === "State"
        ? safeHeaders.state
        : reportingLevel === "District"
        ? safeHeaders.district
        : safeHeaders.block;

    const subGroupKey = 
      reportingLevel === "State"
        ? safeHeaders.district
        : reportingLevel === "District"
        ? safeHeaders.block
        : safeHeaders.location || "Location";

    if (!groupKey) return [];

    const groups: Record<string, { lats: number[]; lons: number[]; vals: number[]; subGroups: Record<string, number[]> }> = {};

    const safeSubset = dataSubset || [];

    safeSubset.forEach((row) => {
      if (!row) return;
      const gName = String(row[groupKey] || "Unknown").trim();
      const subGName = String(row[subGroupKey] || "Unknown").trim();
      const lat = parseCoordinate(row[safeHeaders.latitude]);
      const lon = parseCoordinate(row[safeHeaders.longitude]);
      let val = NaN;
      if (activeParam === "SAR" || activeParam === "RSC") {
        val = Number(row[activeParam]);
      } else {
        const key = headerMap[activeParam] || activeParam;
        val = Number(row[key]);
      }

      if (!isNaN(val)) {
        if (!groups[gName]) {
          groups[gName] = { lats: [], lons: [], vals: [], subGroups: {} };
        }
        if (lat !== null) groups[gName].lats.push(lat);
        if (lon !== null) groups[gName].lons.push(lon);
        groups[gName].vals.push(val);

        if (!groups[gName].subGroups[subGName]) {
          groups[gName].subGroups[subGName] = [];
        }
        groups[gName].subGroups[subGName].push(val);
      }
    });

    const list: GroupData[] = [];

    Object.entries(groups).forEach(([name, data]) => {
      if (data.vals.length === 0) return;

      // Calculate centroid of coordinates
      let centroidLon = 78.96;
      let centroidLat = 20.59;
      if (data.lons.length > 0 && data.lats.length > 0) {
        centroidLon = data.lons.reduce((a, b) => a + b, 0) / data.lons.length;
        centroidLat = data.lats.reduce((a, b) => a + b, 0) / data.lats.length;
      }

      // Calculate exceedance rate
      let subRegionFailCount = 0;
      let sampleFailCount = 0;
      let sum = 0;

      const checkExceed = (v: number) => {
        if (activeParam === "SAR") return v > 26;
        if (activeParam === "pH") return v < activeConfig.b1 || v > activeConfig.b2;
        if (activeConfig.b1 === activeConfig.b2) return v > activeConfig.b1;
        return v > activeConfig.b2;
      };

      data.vals.forEach((v) => {
        sum += v;
        if (checkExceed(v)) sampleFailCount++;
      });

      // Check sub-groups for partial affection
      Object.values(data.subGroups).forEach(subVals => {
        if (subVals.some(checkExceed)) {
          subRegionFailCount++;
        }
      });

      const pctExceedance = (sampleFailCount / data.vals.length) * 100;
      const avgValue = sum / data.vals.length;

      list.push({
        name,
        centroidLon,
        centroidLat,
        totalSamples: data.vals.length,
        failCount: subRegionFailCount, // failCount now represents affected sub-regions (districts/blocks)
        pctExceedance,
        avgValue,
      });
    });

    return list;
  };'''

code = re.sub(old_compute, new_compute, code)

# Update the labels
code = code.replace('"Total Exceeded Legend"', '"Affected Regions Legend"')
code = code.replace('"Total Exceeded"', '"Affected Regions"')
code = code.replace('"Exceeded Samples:"', '"Affected Sub-Regions:"')

with open('src/components/GisChoroplethMap.tsx', 'w') as f:
    f.write(code)
