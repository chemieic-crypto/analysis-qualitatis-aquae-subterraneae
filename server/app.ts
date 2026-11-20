import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { GoogleGenAI } from "@google/genai";
import {
  ConcurrencyLimiter,
  FixedWindowRateLimiter,
  generateDeterministicHydroReport,
  getAiLimitsConfig,
  validateChatRequest,
  validateQuickAuditRequest,
  withTimeout,
  type AiLimitsConfig,
  type ChatMessage,
} from "./aiEngine.ts";

export interface AiExecutorInput {
  kind: "chat" | "quick-audit";
  contents: unknown;
  systemInstruction: string;
  signal: AbortSignal;
}

export type AiTextExecutor = (input: AiExecutorInput) => Promise<string>;

export interface CreateAppOptions {
  aiExecutor?: AiTextExecutor;
  limits?: AiLimitsConfig;
  hasApiKey?: () => boolean;
}

export class AiUnavailableError extends Error {
  constructor(message = "Upstream AI service is unavailable.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

const HYDRO_SYSTEM_INSTRUCTION = `You are "AquaIntel Hydrogeology AI Agent", an expert hydrogeologist, groundwater geochemist, and water resources compliance specialist.
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

const CANDIDATE_MODELS = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"] as const;

export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "Unknown error");
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|authorization|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 240);
}

export function createGeminiExecutor(apiKeyProvider: () => string | undefined = () => process.env.GEMINI_API_KEY): AiTextExecutor {
  let cachedClientKey: string | undefined;
  let cachedClient: GoogleGenAI | null = null;

  function getClient(apiKey: string): GoogleGenAI {
    if (!cachedClient || cachedClientKey !== apiKey) {
      cachedClientKey = apiKey;
      cachedClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return cachedClient;
  }

  return async ({ contents, systemInstruction, signal }) => {
    const apiKey = apiKeyProvider()?.trim();
    if (!apiKey) {
      throw new AiUnavailableError("Server AI credentials are not configured.");
    }

    const ai = getClient(apiKey);
    let lastError: unknown = null;

    for (const model of CANDIDATE_MODELS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (signal.aborted) {
          throw new AiUnavailableError("Upstream AI request aborted due to timeout.");
        }

        try {
          const response = await ai.models.generateContent({
            model,
            contents: contents as any,
            config: {
              systemInstruction,
              abortSignal: signal,
            },
          });

          if (response && typeof response.text === "string" && response.text.trim().length > 0) {
            return response.text;
          }
          lastError = new Error("Empty response from upstream model.");
        } catch (err: unknown) {
          lastError = err;
          if (signal.aborted) {
            throw new AiUnavailableError("Upstream AI request timed out.");
          }

          const msg = err instanceof Error ? err.message : String(err ?? "");
          const isTransient =
            msg.includes("503") ||
            msg.includes("UNAVAILABLE") ||
            msg.includes("high demand") ||
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED");

          if (isTransient && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          } else if (!isTransient) {
            break;
          }
        }
      }
    }

    throw lastError instanceof Error ? lastError : new AiUnavailableError("All AI models are currently unavailable.");
  };
}

function getClientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function formatChatContents(
  messages: ChatMessage[],
  context: string | Record<string, unknown> | undefined
) {
  const formattedContents = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  if (context !== undefined && formattedContents.length > 0) {
    const lastIdx = formattedContents.length - 1;
    const lastTurn = formattedContents[lastIdx];
    const lastPart = lastTurn?.parts[0];
    if (lastTurn && lastTurn.role === "user" && lastPart) {
      const serializedContext =
        typeof context === "string" ? context : JSON.stringify(context, null, 2);
      lastPart.text = `[CURRENT FILTER & DATASET CONTEXT]:\n${serializedContext}\n\n[USER QUERY]:\n${lastPart.text}`;
    }
  }

  return formattedContents;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const limits = options.limits ?? getAiLimitsConfig();
  const hasApiKey =
    options.hasApiKey ??
    (() => Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0));
  const aiExecutor = options.aiExecutor ?? createGeminiExecutor();

  const rateLimiter = new FixedWindowRateLimiter(
    limits.rateLimitWindowMs,
    limits.rateLimitMaxRequests
  );
  const concurrencyLimiter = new ConcurrencyLimiter(limits.maxConcurrentCalls);

  const app = express();

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const apiRouter = express.Router();

  // Tight request body size limit tailored for AI chat & summary payloads
  apiRouter.use(express.json({ limit: limits.maxBodyLimit }));

  // Handle malformed JSON / oversized payloads cleanly without leaking stack traces
  apiRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (!err) {
      next();
      return;
    }
    if (err.type === "entity.too.large" || err.status === 413) {
      res.status(413).json({
        error: `Request payload exceeds maximum allowed size (${limits.maxBodyLimit}).`,
      });
      return;
    }
    if (err instanceof SyntaxError || err.type === "entity.parse.failed" || err.status === 400) {
      res.status(400).json({
        error: "Malformed JSON request body.",
      });
      return;
    }
    next(err);
  });

  // Per-client fixed-window rate limiting for public AI endpoints
  apiRouter.use((req: Request, res: Response, next: NextFunction) => {
    const rate = rateLimiter.consume(getClientKey(req));
    res.setHeader("X-RateLimit-Limit", String(limits.rateLimitMaxRequests));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      res.status(429).json({
        error: "Too many AI requests. Please wait before retrying.",
        retryAfterSeconds: rate.retryAfterSeconds,
      });
      return;
    }
    next();
  });

  apiRouter.post("/chat", async (req: Request, res: Response) => {
    const validation = validateChatRequest(req.body, limits);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { messages, context, allowFallback } = validation.data;
    const userLastMessage = messages[messages.length - 1]?.content ?? "";

    // If no API key is configured, fail fast (or return deterministic report if fallback is allowed)
    if (!hasApiKey() && !options.aiExecutor) {
      if (allowFallback) {
        res.json({
          reply: generateDeterministicHydroReport(context, userLastMessage),
          isFallback: true,
          fallbackNote:
            "Note: Generated via conservative offline hydrogeological summary engine (AI service key not configured).",
        });
        return;
      }
      res.setHeader("Retry-After", "60");
      res.status(503).json({
        error: "AI service is currently unavailable.",
      });
      return;
    }

    const release = concurrencyLimiter.tryAcquire();
    if (!release) {
      res.setHeader("Retry-After", "5");
      res.status(503).json({
        error: "AI service is busy handling concurrent requests. Please retry shortly.",
      });
      return;
    }

    try {
      const formattedContents = formatChatContents(messages, context);
      const replyText = await withTimeout(
        (signal) =>
          aiExecutor({
            kind: "chat",
            contents: formattedContents,
            systemInstruction: HYDRO_SYSTEM_INSTRUCTION,
            signal,
          }),
        limits.upstreamTimeoutMs
      );
      res.json({ reply: replyText, isFallback: false });
    } catch (err: unknown) {
      console.warn("AI chat upstream error:", sanitizeErrorMessage(err));
      if (allowFallback) {
        res.json({
          reply: generateDeterministicHydroReport(context, userLastMessage),
          isFallback: true,
          fallbackNote:
            "Note: Generated via offline hydrogeological audit engine while upstream AI service was unavailable.",
        });
        return;
      }
      res.setHeader("Retry-After", "10");
      res.status(503).json({
        error: "Upstream AI service is temporarily unavailable or timed out.",
      });
    } finally {
      release();
    }
  });

  apiRouter.post("/quick-audit", async (req: Request, res: Response) => {
    const validation = validateQuickAuditRequest(req.body, limits);
    if ("error" in validation) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { summaryData, allowFallback } = validation.data;

    if (!hasApiKey() && !options.aiExecutor) {
      if (allowFallback) {
        res.json({
          auditReport: generateDeterministicHydroReport(summaryData),
          isFallback: true,
          fallbackNote:
            "Note: Generated via conservative offline hydrogeological summary engine (AI service key not configured).",
        });
        return;
      }
      res.setHeader("Retry-After", "60");
      res.status(503).json({
        error: "AI service is currently unavailable.",
      });
      return;
    }

    const release = concurrencyLimiter.tryAcquire();
    if (!release) {
      res.setHeader("Retry-After", "5");
      res.status(503).json({
        error: "AI service is busy handling concurrent requests. Please retry shortly.",
      });
      return;
    }

    const prompt = `Please conduct a comprehensive Hydrogeological & Water Quality Audit based on the following groundwater dataset summary:
${JSON.stringify(summaryData, null, 2)}

Generate an executive technical bulletin covering:
1. **Executive Hydrogeological Summary**: Overview of samples, geography, and general groundwater characteristics.
2. **Hydrochemical Facies & Aquifer Process (Piper Interpretation)**: Dominant water type(s) and geogenic processes (only state findings supported by the provided summary).
3. **Irrigation & Agricultural Risk Assessment (USSL & Salinity/Sodicity)**: Evaluation of C-S classes, SAR, and guidance for regional crops.
4. **Potability & BIS IS 10500 Compliance**: Identification of parameter exceedances and public health implications.
5. **Recommended Aquifer Management & Interventions**: Specific engineering or management actions.

Format with crisp headings, bullet points, and bold metric callouts.`;

    try {
      const reportText = await withTimeout(
        (signal) =>
          aiExecutor({
            kind: "quick-audit",
            contents: prompt,
            systemInstruction:
              "You are an expert hydrogeologist and groundwater quality auditor. Provide a rigorous, executive-ready groundwater report strictly grounded in supplied metrics.",
            signal,
          }),
        limits.upstreamTimeoutMs
      );
      res.json({ auditReport: reportText, isFallback: false });
    } catch (err: unknown) {
      console.warn("Quick audit upstream error:", sanitizeErrorMessage(err));
      if (allowFallback) {
        res.json({
          auditReport: generateDeterministicHydroReport(summaryData),
          isFallback: true,
          fallbackNote:
            "Note: Generated via offline hydrogeological audit engine while upstream AI service was unavailable.",
        });
        return;
      }
      res.setHeader("Retry-After", "10");
      res.status(503).json({
        error: "Upstream AI service is temporarily unavailable or timed out.",
      });
    } finally {
      release();
    }
  });

  app.use("/api/ai", apiRouter);

  return app;
}
