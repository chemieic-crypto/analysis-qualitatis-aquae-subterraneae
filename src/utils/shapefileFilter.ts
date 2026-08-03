/**
 * Utility functions for filtering shapefiles and GeoJSON layers by state and district selection.
 */

export function norm(s: string): string {
  if (!s) return "";
  let str = s.toLowerCase()
    .replace(/\band\b/g, "")
    .replace(/&/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (str === "orissa") str = "odisha";
  if (str === "uttaranchal") str = "uttarakhand";
  if (str === "pondicherry") str = "puducherry";
  if (str === "chattisgarh") str = "chhattisgarh";
  if (str === "telengana") str = "telangana";
  if (str === "jk" || str === "jandk" || str === "jammuandkashmir") str = "jammuandkashmir";
  if (str === "wb" || str === "westbengal") str = "westbengal";
  if (str === "up" || str === "uttarpradesh") str = "uttarpradesh";
  if (str === "mp" || str === "madhyapradesh") str = "madhyapradesh";
  if (str === "ap" || str === "andhrapradesh") str = "andhrapradesh";
  if (str === "tn" || str === "tamilnadu") str = "tamilnadu";
  if (str === "mh" || str === "maharashtra") str = "maharashtra";
  if (str === "rj" || str === "rajasthan") str = "rajasthan";
  if (str === "gj" || str === "gujarat") str = "gujarat";
  if (str === "ka" || str === "karnataka") str = "karnataka";
  return str;
}

export function buildDistrictStateMap(rawData: any[], headerMap?: Record<string, string>, headers?: any): Record<string, string> {
  const map: Record<string, string> = {};
  if (!rawData || !Array.isArray(rawData)) return map;

  const stateKey = (headerMap && headerMap["state"]) || (headers && headers.state) || "State";
  const districtKey = (headerMap && headerMap["district"]) || (headers && headers.district) || "District";

  rawData.forEach(row => {
    const st = String(row[stateKey] || "").trim();
    const dt = String(row[districtKey] || "").trim();
    if (st && dt && dt !== "Unknown" && st !== "Unknown") {
      map[dt.toLowerCase()] = st;
      map[dt] = st;
      const cleanDt = norm(dt);
      if (cleanDt) map[cleanDt] = st;
    }
  });

  return map;
}

export function isStateAll(state?: string): boolean {
  if (!state) return true;
  const s = state.trim().toLowerCase();
  return !s || s === "all" || s === "national" || s === "all india" || s === "select state";
}

export function isDistrictAll(district?: string): boolean {
  if (!district) return true;
  const d = district.trim().toLowerCase();
  return !d || d === "all" || d === "select district";
}

/**
 * Determines whether a GeoJSON feature matches the selected state and district filters.
 */
export function featureMatchesSelection(
  feature: any,
  selectedState?: string,
  selectedDistrict?: string,
  districtStateMap?: Record<string, string>
): boolean {
  if (!feature || !feature.properties) return true;

  const isAllSt = isStateAll(selectedState);
  const isAllDt = isDistrictAll(selectedDistrict);

  // If no specific state or district filter is active, show all features
  if (isAllSt && isAllDt) {
    return true;
  }

  const props = feature.properties;

  // National boundary feature (like India outline) - when a state or district filter is active,
  // do not draw the national background shape
  const pName = String(props.name || props.Name || props.NAME || "").trim().toLowerCase();
  if (pName === "india" || props.isNationalBoundary) {
    return isAllSt && isAllDt;
  }

  const selStateNorm = norm(selectedState || "");
  const selDistNorm = norm(selectedDistrict || "");

  // Helper to extract property value by keys
  const getPropByKeys = (candidateKeys: string[]): string => {
    for (const k of Object.keys(props)) {
      const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (candidateKeys.some(ck => kClean === ck || (ck.length >= 3 && kClean.includes(ck)))) {
        const val = String(props[k] || "").trim();
        if (val) return val;
      }
    }
    return "";
  };

  const stateKeys = [
    "state", "statename", "stname", "stnm", "st", "statecode", "stcode", 
    "name1", "state_name", "state_nam", "st_name", "st_nm", "adm1", "admin1", 
    "state_n", "st_name_e", "state_nm", "st_name_1", "state_name_1"
  ];
  const districtKeys = [
    "district", "districtname", "distname", "dtname", "distnm", "dt", "districtn", 
    "name2", "dist_name", "dist_nm", "dt_name", "district_n", "district_name", "adm2", "admin2"
  ];

  let featureState = getPropByKeys(stateKeys);
  let featureDistrict = getPropByKeys(districtKeys);

  // Fallback: If feature has a 'name' or 'NAME' or 'Name' property, check if it matches state/district or districtStateMap
  if (!featureState && !featureDistrict && (props.name || props.Name || props.NAME || props.label || props.LABEL)) {
    const rawName = String(props.name || props.Name || props.NAME || props.label || props.LABEL || "").trim();
    const normName = norm(rawName);
    if (!isAllSt && (normName === selStateNorm || normName.includes(selStateNorm) || selStateNorm.includes(normName))) {
      featureState = rawName;
    } else if (!isAllDt && (normName === selDistNorm || normName.includes(selDistNorm) || selDistNorm.includes(normName))) {
      featureDistrict = rawName;
    } else if (districtStateMap) {
      const mapped = districtStateMap[rawName.toLowerCase()] || districtStateMap[normName] || districtStateMap[rawName];
      if (mapped) {
        featureDistrict = rawName;
        featureState = mapped;
      }
    }
  }

  const fStateNorm = norm(featureState);
  const fDistNorm = norm(featureDistrict);

  // 1. Check if feature is a District feature (has a district property)
  if (fDistNorm) {
    // If a specific district is selected (e.g. "Jaipur")
    if (!isAllDt) {
      const matchDist = fDistNorm === selDistNorm || fDistNorm.includes(selDistNorm) || selDistNorm.includes(fDistNorm);
      if (!matchDist) return false;
    }

    // If state is selected (e.g. "Rajasthan"), check if district belongs to selected state
    if (!isAllSt) {
      // a) Check feature's own state property if present
      if (fStateNorm) {
        return fStateNorm === selStateNorm || fStateNorm.includes(selStateNorm) || selStateNorm.includes(fStateNorm);
      }
      // b) Check districtStateMap lookup using feature's district name
      if (districtStateMap) {
        const mappedState = districtStateMap[featureDistrict.trim().toLowerCase()] ||
                            districtStateMap[fDistNorm] ||
                            districtStateMap[featureDistrict.trim()];
        if (mappedState) {
          const mappedNorm = norm(mappedState);
          return mappedNorm === selStateNorm || mappedNorm.includes(selStateNorm) || selStateNorm.includes(mappedNorm);
        }
        // Try fuzzy match in districtStateMap keys
        const foundKey = Object.keys(districtStateMap).find(k => {
          const kn = norm(k);
          return kn && (kn === fDistNorm || kn.includes(fDistNorm) || fDistNorm.includes(kn));
        });
        if (foundKey && districtStateMap[foundKey]) {
          const mappedNorm = norm(districtStateMap[foundKey]);
          return mappedNorm === selStateNorm || mappedNorm.includes(selStateNorm) || selStateNorm.includes(mappedNorm);
        }
      }
      // If a specific district was selected and matched, allow it
      if (!isAllDt) {
        return fDistNorm === selDistNorm || fDistNorm.includes(selDistNorm) || selDistNorm.includes(fDistNorm);
      }
      // When a specific state is selected and district has no explicit contradictory state property, keep the district feature
      return true;
    }

    return true;
  }

  // 2. Check if feature is a State feature (has a state property, but no district property)
  if (fStateNorm) {
    if (!isAllSt) {
      return fStateNorm === selStateNorm || fStateNorm.includes(selStateNorm) || selStateNorm.includes(fStateNorm);
    }
    // If a district is selected but state is "All", show state boundary for that district's state
    if (!isAllDt) {
      if (districtStateMap) {
        const targetState = districtStateMap[selDistNorm] || districtStateMap[selectedDistrict?.trim().toLowerCase() || ""];
        if (targetState) {
          const tNorm = norm(targetState);
          return fStateNorm === tNorm || fStateNorm.includes(tNorm) || tNorm.includes(fStateNorm);
        }
      }
      return true;
    }
  }

  // 3. Generic feature check (e.g. custom shapefile layers without explicit state/district property keys)
  if (!isAllSt) {
    for (const val of Object.values(props)) {
      const valStr = String(val || "").trim();
      if (!valStr) continue;
      const vNorm = norm(valStr);
      if (vNorm && (vNorm === selStateNorm || vNorm.includes(selStateNorm) || selStateNorm.includes(vNorm))) {
        return true;
      }
      if (districtStateMap) {
        const mappedState = districtStateMap[valStr.toLowerCase()] || districtStateMap[vNorm] || districtStateMap[valStr];
        if (mappedState) {
          const mappedNorm = norm(mappedState);
          if (mappedNorm === selStateNorm || mappedNorm.includes(selStateNorm) || selStateNorm.includes(mappedNorm)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  if (!isAllDt) {
    for (const val of Object.values(props)) {
      const valStr = String(val || "").trim();
      if (!valStr) continue;
      const vNorm = norm(valStr);
      if (vNorm && (vNorm === selDistNorm || vNorm.includes(selDistNorm) || selDistNorm.includes(vNorm))) {
        return true;
      }
    }
    return false;
  }

  return true;
}

/**
 * Returns a new GeoJSON object containing only features matching the selection.
 */
export function getFilteredGeoJson(
  geoJson: any,
  selectedState?: string,
  selectedDistrict?: string,
  districtStateMap?: Record<string, string>
): any {
  if (!geoJson) return geoJson;

  if (isStateAll(selectedState) && isDistrictAll(selectedDistrict)) {
    return geoJson;
  }

  if (geoJson.type === "FeatureCollection" && Array.isArray(geoJson.features)) {
    const filteredFeatures = geoJson.features.filter((f: any) =>
      featureMatchesSelection(f, selectedState, selectedDistrict, districtStateMap)
    );
    return {
      ...geoJson,
      features: filteredFeatures
    };
  } else if (geoJson.type === "Feature") {
    if (featureMatchesSelection(geoJson, selectedState, selectedDistrict, districtStateMap)) {
      return geoJson;
    }
    return { type: "FeatureCollection", features: [] };
  }

  return geoJson;
}

/**
 * Calculates latitude/longitude bounding box of a GeoJSON object.
 */
export function getGeoJsonBounds(geoJson: any): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  if (!geoJson) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const processCoords = (coords: any) => {
    if (Array.isArray(coords) && typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lng = coords[0];
      const lat = coords[1];
      if (typeof lng === "number" && !isNaN(lng) && typeof lat === "number" && !isNaN(lat)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    } else if (Array.isArray(coords)) {
      coords.forEach(processCoords);
    }
  };

  const processFeature = (f: any) => {
    if (f && f.geometry && f.geometry.coordinates) {
      processCoords(f.geometry.coordinates);
    }
  };

  if (geoJson.type === "FeatureCollection" && Array.isArray(geoJson.features)) {
    geoJson.features.forEach(processFeature);
  } else if (geoJson.type === "Feature") {
    processFeature(geoJson);
  } else if (geoJson.coordinates) {
    processCoords(geoJson.coordinates);
  }

  if (minLat === Infinity || maxLat === -Infinity || minLng === Infinity || maxLng === -Infinity) {
    return null;
  }

  return { minLat, maxLat, minLng, maxLng };
}
