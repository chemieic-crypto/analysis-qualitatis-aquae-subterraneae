function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractNumericBreakdown(raw: unknown): Array<[string, number]> {
  if (!isPlainObject(raw)) return [];
  const entries: Array<[string, number]> = [];
  for (const [key, val] of Object.entries(raw)) {
    const label = key.trim();
    const count = asNonNegativeInt(val);
    if (label && count !== null) {
      entries.push([label, count]);
    }
  }
  return entries.sort((a, b) => b[1] - a[1]);
}

/**
 * Browser-safe, conservative deterministic fallback hydrogeological summary generator.
 * Used both by the server when upstream AI is unavailable and client-side when hosted on
 * static platforms (such as GitHub Pages) where `/api/ai/*` endpoints are not available.
 */
export function generateDeterministicHydroReport(context: unknown, _userQuery?: string): string {
  const ctx: Record<string, unknown> = isPlainObject(context) ? context : {};

  const samples =
    asNonNegativeInt(ctx.samplesCount) ??
    asNonNegativeInt(ctx.totalDatasetSamples);

  const filters = isPlainObject(ctx.activeFilters) ? ctx.activeFilters : {};
  const district = sanitizeText(filters.district);
  const state = sanitizeText(filters.state);
  const season = sanitizeText(filters.season) || "Not specified";
  const year = sanitizeText(filters.year) || "Not specified";
  const loc = [district, state].filter(Boolean).join(", ") || "Not specified";

  const avg = isPlainObject(ctx.averageParameters) ? ctx.averageParameters : {};
  const avgEc = asFiniteNumber(avg.ec);
  const avgTds = asFiniteNumber(avg.tds);
  const avgPh = asFiniteNumber(avg.ph);
  const avgSar = asFiniteNumber(avg.sar);

  const faciesEntries = extractNumericBreakdown(ctx.faciesBreakdown);
  const faciesList = faciesEntries
    .map(([name, count]) => {
      if (samples !== null && samples > 0) {
        return `**${name}**: ${count} samples (${Math.round((count / samples) * 100)}%)`;
      }
      return `**${name}**: ${count} samples`;
    })
    .join(", ");

  const usslEntries = extractNumericBreakdown(ctx.usslBreakdown);
  const usslList = usslEntries
    .map(([cls, count]) => `**${cls}**: ${count} samples`)
    .join(", ");

  const rawExceedances = ctx.exceedancesSummary;
  const hasValidExceedanceArray = Array.isArray(rawExceedances);
  const validExceedances: Array<{
    parameter: string;
    count: number;
    limitStr: string;
    maxStr: string;
  }> = [];

  if (hasValidExceedanceArray) {
    for (const item of rawExceedances) {
      if (!isPlainObject(item)) continue;
      const paramName = sanitizeText(item.parameter);
      const count = asNonNegativeInt(item.count);
      if (!paramName || count === null) continue;
      const unit = sanitizeText(item.unit) || "";
      const limitVal =
        typeof item.limit === "number" && Number.isFinite(item.limit)
          ? String(item.limit)
          : sanitizeText(item.limit);
      const maxVal =
        typeof item.maxVal === "number" && Number.isFinite(item.maxVal)
          ? String(item.maxVal)
          : sanitizeText(item.maxVal);

      validExceedances.push({
        parameter: paramName,
        count,
        limitStr: limitVal ? `${limitVal}${unit ? ` ${unit}` : ""}` : "limit not specified",
        maxStr: maxVal ? `${maxVal}${unit ? ` ${unit}` : ""}` : "not specified",
      });
    }
  }

  let exceedanceSectionText: string;
  if (!hasValidExceedanceArray) {
    exceedanceSectionText =
      "- **Exceedance Status Indeterminate:** Exceedance summary data was not provided or was malformed in the supplied context; BIS IS 10500:2012 compliance cannot be verified.";
  } else if (rawExceedances.length === 0) {
    if (samples === 0) {
      exceedanceSectionText =
        "- **No Evaluable Records:** Zero samples were reported in the supplied summary (`exceedancesSummary` is empty); compliance cannot be inferred.";
    } else {
      exceedanceSectionText =
        "- No BIS IS 10500:2012 exceedances were listed in the supplied exceedance summary.";
    }
  } else if (validExceedances.length === 0) {
    exceedanceSectionText =
      "- **Exceedance Status Indeterminate:** Supplied exceedance entries were malformed and could not be parsed reliably.";
  } else {
    exceedanceSectionText = validExceedances
      .map(
        (e) =>
          `- **${e.parameter}**: ${e.count} samples exceed limit (${e.limitStr}), peak observed: **${e.maxStr}**`
      )
      .join("\n");
  }

  const samplesDisplay = samples !== null ? String(samples) : "Not provided";
  const samplesSentence =
    samples !== null
      ? `The supplied summary reports **${samples} evaluated sample(s)** for spatial domain **${loc}**.`
      : `Sample count was not provided in the supplied context for spatial domain **${loc}**.`;

  const hasAnyAvg = avgEc !== null || avgTds !== null || avgPh !== null;
  const avgSummary = hasAnyAvg
    ? `Reported mean values — EC: **${avgEc !== null ? `${avgEc} µS/cm` : "Not provided"}**, TDS: **${avgTds !== null ? `${avgTds} mg/L` : "Not provided"}**, pH: **${avgPh !== null ? String(avgPh) : "Not provided"}**.`
    : "Average hydrochemical parameter values (EC, TDS, pH) were not provided in the supplied context.";

  const healthWarnings: string[] = [];
  if (validExceedances.some((e) => e.parameter.toLowerCase().includes("fluor"))) {
    healthWarnings.push(
      "- **Fluoride Note:** Supplied exceedances include Fluoride; elevated Fluoride above 1.5 mg/L is associated with dental and skeletal fluorosis."
    );
  }
  if (validExceedances.some((e) => e.parameter.toLowerCase().includes("nitrat"))) {
    healthWarnings.push(
      "- **Nitrate Note:** Supplied exceedances include Nitrate; elevated Nitrate above 45 mg/L poses methemoglobinemia risk in infants."
    );
  }

  return `### AquaIntel Offline Hydrogeological Summary
**Spatial Domain:** ${loc} | **Samples Evaluated:** ${samplesDisplay} | **Season / Year:** ${season} / ${year}

---

#### 1. Dataset Overview
${samplesSentence} ${avgSummary}

#### 2. Hydrochemical Facies (Piper Classification)
- **Supplied Facies Breakdown:** ${faciesList || "Not provided in the supplied dataset summary."}

#### 3. Irrigation Suitability (USSL Classification)
- **Supplied USSL Breakdown:** ${usslList || "Not provided in the supplied dataset summary."}
- **Reported Mean SAR:** ${avgSar !== null ? `**${avgSar}**` : "Not provided"}

#### 4. BIS IS 10500:2012 Exceedance Summary
${exceedanceSectionText}
${healthWarnings.length > 0 ? `\n**Parameter-Specific Health Context (From Supplied Exceedances):**\n${healthWarnings.join("\n")}\n` : ""}
#### 5. General Hydrogeological Guidance (Not Dataset-Derived)
*Note: The recommendations below are general groundwater management practices for reference only and are not derived from automated statistical analysis of your dataset.*
1. **Managed Aquifer Recharge (MAR):** Where locally appropriate, check dams, percolation tanks, and recharge shafts can support groundwater replenishment and dilution.
2. **Targeted Treatment Verification:** Confirm any suspected BIS IS 10500 exceedances with accredited laboratory testing before selecting treatment (e.g., RO, activated alumina, or ion exchange).
3. **Seasonal Monitoring:** Track pre- and post-monsoon water quality across representative monitoring wells to observe temporal trends.`;
}
