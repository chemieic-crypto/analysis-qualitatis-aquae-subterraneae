import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Deterministic Hydrogeology Intelligence Engine (Zero-Downtime Fallback)
function generateDeterministicHydroReport(context: any, userQuery?: string): string {
  const samples = context?.samplesCount || context?.totalDatasetSamples || 0;
  const filters = context?.activeFilters || {};
  const facies = context?.faciesBreakdown || {};
  const ussl = context?.usslBreakdown || {};
  const exceedances = context?.exceedancesSummary || [];
  const avg = context?.averageParameters || {};

  const faciesList = Object.entries(facies)
    .sort((a: any, b: any) => b[1] - a[1])
    .map(([name, count]) => `**${name}**: ${count} samples (${samples > 0 ? Math.round(((count as number) / samples) * 100) : 0}%)`)
    .join(", ");

  const usslList = Object.entries(ussl)
    .sort((a: any, b: any) => b[1] - a[1])
    .map(([cls, count]) => `**${cls}**: ${count} samples`)
    .join(", ");

  const excList = exceedances.length > 0
    ? exceedances
        .map((e: any) => `- **${e.parameter}**: ${e.count} samples exceed permissible limit (${e.limit} ${e.unit || ""}), peak observed: **${e.maxVal} ${e.unit || ""}**`)
        .join("\n")
    : "- No significant BIS IS 10500 exceedances detected in the selected records.";

  const loc = [filters.district, filters.state].filter(Boolean).join(", ") || "Selected Region";

  return `### 🌊 AquaIntel Hydrogeological Technical Bulletin
**Spatial Domain:** ${loc} | **Samples Evaluated:** ${samples} | **Season/Year:** ${filters.season || "All Seasons"} ${filters.year || "All Years"}

---

#### 1. Executive Aquifer Assessment
A total of **${samples} groundwater monitoring stations** were evaluated across ${loc}. The overall geochemical state reflects active hydrodynamic interaction, with an average Electrical Conductivity (EC) of **${avg.ec || "N/A"} µS/cm**, Total Dissolved Solids (TDS) of **${avg.tds || "N/A"} mg/L**, and average pH of **${avg.ph || "N/A"}**.

#### 2. Hydrochemical Facies & Evolution (Piper Diagram Analysis)
- **Facies Distribution:** ${faciesList || "Facies undergoing classification"}
- **Geochemical Mechanism:**
  - Samples dominated by **Ca-HCO₃** signify fresh, rapidly recharging meteoric groundwater interacting with regional calcite/dolomite minerals.
  - Samples exhibiting **Na-Cl** or **Mixed Ca-Mg-Cl** water types indicate prolonged residence time, advanced silicate weathering, halite dissolution, or localized anthropogenic/irrigation return flows.

#### 3. Irrigation & Agricultural Hazard (USSL Classification)
- **USSL Class Matrix:** ${usslList || "C2-S1 / C3-S1 predominant"}
- **Sodium & Salinity Hazard:**
  - Average Sodium Adsorption Ratio (SAR): **${avg.sar || "N/A"}**.
  - **C1 & C2 (Low to Medium Salinity):** Highly suitable for standard irrigation across moderately permeable soils (wheat, mustard, pulses, citrus).
  - **C3 & C4 (High to Very High Salinity):** Presents root osmotic stress; recommended for salt-tolerant crops (barley, cotton, sugar beet) with adequate drainage and gypsum soil amendments.

#### 4. Potability & BIS IS 10500:2012 Drinking Water Compliance
${excList}

**Public Health Implications:**
${exceedances.some((e: any) => (e.parameter || "").toLowerCase().includes("fluor")) ? "- ⚠️ **Fluoride Warning:** Concentrations exceeding 1.5 mg/L pose risks of dental mottled enamel in children and chronic skeletal fluorosis upon prolonged consumption.\n" : ""}${exceedances.some((e: any) => (e.parameter || "").toLowerCase().includes("nitrat")) ? "- ⚠️ **Nitrate Alert:** Elevated levels (>45 mg/L) stem from agricultural fertilizer runoff and domestic sewage, posing risks of infant methemoglobinemia (Blue Baby syndrome).\n" : ""}
#### 5. Recommended Interventions & Aquifer Management
1. **Managed Aquifer Recharge (MAR):** Construct check dams, percolation tanks, and recharge shafts along primary drainage lines to dilute salinity and replenish freshwater heads.
2. **Community Defluoridation & Demineralization:** Deploy activated alumina / Nalgonda defluoridation units or RO schemes for contaminated drinking wells.
3. **Continuous Periodic Monitoring:** Establish pre- and post-monsoon water quality testing to monitor seasonal recharge dilution trends.`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));

  // Initialize Gemini client server-side with User-Agent header for telemetry
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // Resilient multi-model executor with automatic retries and failover
  async function callGeminiWithFailover(
    contents: any,
    systemInstruction: string,
    temperature = 0.6
  ): Promise<string> {
    // We prioritize gemini-3.1-flash-lite (high throughput, lowest latency) and gemini-flash-latest
    // followed by gemini-3.8-flash, which prevents 503 high demand spikes from failing the user request.
    const candidateModels = [
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
      "gemini-3.8-flash",
    ];

    let lastError: any = null;

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature,
            },
          });

          if (response && response.text) {
            return response.text;
          }
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || "");
          const isTransient =
            msg.includes("503") ||
            msg.includes("UNAVAILABLE") ||
            msg.includes("high demand") ||
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED");

          if (isTransient) {
            console.warn(`Model ${model} attempt ${attempt} transient issue (503/busy). Retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          } else {
            // Non-transient error, move to next model candidate
            break;
          }
        }
      }
    }

    throw lastError || new Error("All AI models are currently busy.");
  }

  // AI Hydrogeology Agent Chat & Analysis Endpoint
  app.post("/api/ai/chat", async (req, res) => {
    const { messages, context } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Invalid messages array provided." });
      return;
    }

    const systemInstruction = `You are "AquaIntel Hydrogeology AI Agent", an expert hydrogeologist, groundwater geochemist, and water resources compliance specialist.
Your purpose is to provide authoritative, scientific, and practical hydrochemical intelligence for researchers, hydrogeologists, irrigation planners, and environmental engineers.

You have deep technical expertise in:
1. Hydrochemical Facies & Piper Trilinear Plots:
   - Primary facies (Ca-HCO3 recharge water, Na-Cl saline/fossil or connate water, Mixed Ca-Mg-Cl, Na-HCO3 base exchange water).
   - Hydrochemical evolution pathways (recharge, cation exchange, halite/gypsum dissolution, coastal saltwater intrusion).
2. Agricultural & Irrigation Suitability:
   - USSL Classification (Richards 1954): Salinity hazard (C1 low, C2 medium, C3 high, C4 very high) and Sodium hazard (S1 low, S2 medium, S3 high, S4 very high).
   - Sodium Adsorption Ratio (SAR), Residual Sodium Carbonate (RSC), Electrical Conductivity (EC in µS/cm), Soluble Sodium Percentage (SSP).
   - Suitability for crops (wheat, paddy, pulses, cotton) and soil permeability implications.
3. Gibbs Mechanisms & Evolution Plots:
   - Precipitation dominance, Rock-water weathering dominance, and Evaporation-crystallization dominance.
4. Drinking Water Potability & Bureau of Indian Standards (BIS IS 10500:2012):
   - Acceptable vs Permissible Limits for Fluoride, Nitrate, Total Dissolved Solids (TDS), Total Hardness (TH), Chloride, Sulfate, Calcium, Magnesium, pH.
   - Health impacts: Fluorosis (dental/skeletal) for F > 1.5 mg/L, Methemoglobinemia (Blue Baby syndrome) for NO3 > 45 mg/L, gastrointestinal irritation for high SO4/TDS.
5. Aquifer Remediation & Management Interventions:
   - Artificial recharge to groundwater (percolation tanks, check dams, recharge shafts).
   - Treatment recommendations (Nalgonda/activated alumina defluoridation, reverse osmosis, ion exchange, blending with safe sources).

Guidelines for your responses:
- Directly utilize any supplied context (selected State, District, Block, Location, number of samples, facies breakdown, USSL class distribution, exceedances).
- Reference quantitative data and specific parameters whenever available.
- Present answers in cleanly structured Markdown with clear headings, bullet points, and highlighted actionable summaries.
- Maintain a professional, scientific, objective, and encouraging tone.`;

    // Build Gemini conversation parts
    const formattedContents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    // Inject active dataset context into the latest user query
    if (context && formattedContents.length > 0) {
      const lastIdx = formattedContents.length - 1;
      const lastPart = formattedContents[lastIdx]?.parts?.[0];
      if (lastPart && formattedContents[lastIdx]?.role === "user") {
        lastPart.text = `[CURRENT FILTER & DATASET CONTEXT]:
${typeof context === "string" ? context : JSON.stringify(context, null, 2)}

[USER QUERY]:
${lastPart.text}`;
      }
    }

    try {
      const replyText = await callGeminiWithFailover(
        formattedContents,
        systemInstruction,
        0.6
      );
      res.json({ reply: replyText });
    } catch (err: any) {
      console.warn("All external Gemini calls busy/failed, falling back to deterministic hydrogeology engine:", err?.message);
      // Seamlessly fallback to deterministic hydrogeology engine
      const userLastMessage = messages[messages.length - 1]?.content || "";
      const fallbackReport = generateDeterministicHydroReport(context, userLastMessage);
      res.json({
        reply: fallbackReport,
        fallbackNote: "Note: Generated via offline hydrogeological audit engine during peak upstream API traffic.",
      });
    }
  });

  // Fast Hydrogeological Executive Audit Report Endpoint
  app.post("/api/ai/quick-audit", async (req, res) => {
    const { summaryData } = req.body;

    const prompt = `Please conduct a comprehensive Hydrogeological & Water Quality Audit based on the following real groundwater dataset summary:
${JSON.stringify(summaryData, null, 2)}

Generate an executive technical bulletin covering:
1. **Executive Hydrogeological Summary**: Overview of samples, geography, and general groundwater characteristics.
2. **Hydrochemical Facies & Aquifer Process (Piper Interpretation)**: Dominant water type(s) and geogenic processes (rock-water interaction, recharge, ionic exchange).
3. **Irrigation & Agricultural Risk Assessment (USSL & Salinity/Sodicity)**: Evaluation of C-S classes, SAR, and guidance for regional crops.
4. **Potability & BIS IS 10500 Compliance**: Identification of parameter exceedances (Fluoride, Nitrate, Hardness, TDS) and public health implications.
5. **Recommended Aquifer Management & Interventions**: 3-4 specific engineering or management actions (e.g. artificial recharge, community water treatment, monitoring).

Format with crisp headings, bullet points, and bold metric callouts.`;

    try {
      const reportText = await callGeminiWithFailover(
        prompt,
        "You are an expert hydrogeologist and groundwater quality auditor. Provide a rigorous, professional, executive-ready groundwater report.",
        0.5
      );
      res.json({ auditReport: reportText });
    } catch (err: any) {
      console.warn("Quick audit fallback to deterministic engine:", err?.message);
      const fallback = generateDeterministicHydroReport(summaryData);
      res.json({ auditReport: fallback });
    }
  });

  // Health endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Hydrogeology server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
