export type ChatRole = "user" | "model";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ActiveFiltersInput {
  state?: string;
  district?: string;
  block?: string;
  aquifer?: string;
  season?: string;
  year?: string;
}

export interface ExceedanceSummaryItem {
  parameter: string;
  count: number;
  maxVal?: number | string;
  limit?: number | string;
  unit?: string;
}

export interface AverageParametersInput {
  ec?: number;
  tds?: number;
  ph?: number;
  sar?: number;
  fluoride?: number;
  nitrate?: number;
}

export interface HydroContextInput {
  samplesCount?: number;
  totalDatasetSamples?: number;
  activeFilters?: ActiveFiltersInput;
  faciesBreakdown?: Record<string, number>;
  usslBreakdown?: Record<string, number>;
  exceedancesSummary?: ExceedanceSummaryItem[];
  averageParameters?: AverageParametersInput;
}

export interface ValidatedChatRequest {
  messages: ChatMessage[];
  context?: string | Record<string, unknown>;
  allowFallback: boolean;
}

export interface ValidatedQuickAuditRequest {
  summaryData: Record<string, unknown>;
  allowFallback: boolean;
}

export interface AiLimitsConfig {
  maxBodyLimit: string;
  maxMessages: number;
  maxMessageLength: number;
  maxTotalMessagesChars: number;
  maxContextBytes: number;
  maxSummaryDataBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  maxConcurrentCalls: number;
  upstreamTimeoutMs: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiLimitsConfig(env: NodeJS.ProcessEnv = process.env): AiLimitsConfig {
  return {
    maxBodyLimit: env.AI_MAX_BODY_LIMIT || "256kb",
    maxMessages: parsePositiveInt(env.AI_MAX_MESSAGES, 20),
    maxMessageLength: parsePositiveInt(env.AI_MAX_MESSAGE_LENGTH, 4000),
    maxTotalMessagesChars: parsePositiveInt(env.AI_MAX_TOTAL_MESSAGE_CHARS, 20000),
    maxContextBytes: parsePositiveInt(env.AI_MAX_CONTEXT_BYTES, 32768),
    maxSummaryDataBytes: parsePositiveInt(env.AI_MAX_SUMMARY_BYTES, 32768),
    rateLimitWindowMs: parsePositiveInt(env.AI_RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMaxRequests: parsePositiveInt(env.AI_RATE_LIMIT_MAX, 20),
    maxConcurrentCalls: parsePositiveInt(env.AI_MAX_CONCURRENT_REQUESTS, 5),
    upstreamTimeoutMs: parsePositiveInt(env.AI_UPSTREAM_TIMEOUT_MS, 15_000),
  };
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400; error: string };

const ALLOWED_ROLES = new Set<string>(["user", "model"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8ByteLength(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.byteLength(serialized ?? "", "utf8");
}

export function validateChatRequest(
  body: unknown,
  limits: AiLimitsConfig = getAiLimitsConfig()
): ValidationResult<ValidatedChatRequest> {
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }

  const { messages, context, allowFallback } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, status: 400, error: "Field 'messages' must be a non-empty array." };
  }

  if (messages.length > limits.maxMessages) {
    return {
      ok: false,
      status: 400,
      error: `Too many messages: maximum allowed is ${limits.maxMessages}.`,
    };
  }

  const validatedMessages: ChatMessage[] = [];
  let totalChars = 0;

  for (let i = 0; i < messages.length; i++) {
    const item = messages[i];
    if (!isPlainObject(item)) {
      return {
        ok: false,
        status: 400,
        error: `Message at index ${i} must be an object with 'role' and 'content'.`,
      };
    }

    if (typeof item.role !== "string" || !ALLOWED_ROLES.has(item.role)) {
      return {
        ok: false,
        status: 400,
        error: `Message at index ${i} has an invalid role. Allowed roles: 'user', 'model'.`,
      };
    }

    if (typeof item.content !== "string") {
      return {
        ok: false,
        status: 400,
        error: `Message at index ${i} must have string 'content'.`,
      };
    }

    const trimmed = item.content.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        status: 400,
        error: `Message at index ${i} cannot have empty 'content'.`,
      };
    }

    if (item.content.length > limits.maxMessageLength) {
      return {
        ok: false,
        status: 400,
        error: `Message at index ${i} exceeds maximum length of ${limits.maxMessageLength} characters.`,
      };
    }

    totalChars += item.content.length;
    if (totalChars > limits.maxTotalMessagesChars) {
      return {
        ok: false,
        status: 400,
        error: `Combined message content exceeds maximum of ${limits.maxTotalMessagesChars} characters.`,
      };
    }

    validatedMessages.push({
      role: item.role as ChatRole,
      content: trimmed,
    });
  }

  let validatedContext: string | Record<string, unknown> | undefined;
  if (context !== undefined && context !== null) {
    if (typeof context !== "string" && !isPlainObject(context)) {
      return {
        ok: false,
        status: 400,
        error: "Field 'context' must be a JSON object or string when provided.",
      };
    }

    const contextBytes = utf8ByteLength(context);
    if (contextBytes > limits.maxContextBytes) {
      return {
        ok: false,
        status: 400,
        error: `Field 'context' exceeds maximum size of ${limits.maxContextBytes} bytes.`,
      };
    }
    validatedContext = context;
  }

  if (allowFallback !== undefined && typeof allowFallback !== "boolean") {
    return {
      ok: false,
      status: 400,
      error: "Field 'allowFallback' must be a boolean when provided.",
    };
  }

  return {
    ok: true,
    data: {
      messages: validatedMessages,
      context: validatedContext,
      allowFallback: allowFallback !== false,
    },
  };
}

export function validateQuickAuditRequest(
  body: unknown,
  limits: AiLimitsConfig = getAiLimitsConfig()
): ValidationResult<ValidatedQuickAuditRequest> {
  if (!isPlainObject(body)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }

  const { summaryData, allowFallback } = body;

  if (!isPlainObject(summaryData)) {
    return {
      ok: false,
      status: 400,
      error: "Field 'summaryData' is required and must be a JSON object.",
    };
  }

  const summaryBytes = utf8ByteLength(summaryData);
  if (summaryBytes > limits.maxSummaryDataBytes) {
    return {
      ok: false,
      status: 400,
      error: `Field 'summaryData' exceeds maximum size of ${limits.maxSummaryDataBytes} bytes.`,
    };
  }

  if (allowFallback !== undefined && typeof allowFallback !== "boolean") {
    return {
      ok: false,
      status: 400,
      error: "Field 'allowFallback' must be a boolean when provided.",
    };
  }

  return {
    ok: true,
    data: {
      summaryData,
      allowFallback: allowFallback !== false,
    },
  };
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
 * Conservative, validation-hardened deterministic fallback report generator.
 * Never fabricates classifications, sample counts, averages, or "no exceedances" claims
 * when fields are missing or malformed.
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

  // Explicitly distinguish missing/malformed exceedance data from a valid empty list []
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

export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
    private readonly maxTrackedKeys: number = 10_000
  ) {}

  consume(key: string, now: number = Date.now()): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    if (this.hits.size >= this.maxTrackedKeys) {
      for (const [k, entry] of this.hits.entries()) {
        if (entry.resetAt <= now) this.hits.delete(k);
      }
      if (this.hits.size >= this.maxTrackedKeys) {
        const oldestKey = this.hits.keys().next().value;
        if (oldestKey !== undefined) this.hits.delete(oldestKey);
      }
    }

    const existing = this.hits.get(key);
    if (!existing || existing.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - 1),
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - existing.count),
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
}

export class ConcurrencyLimiter {
  private active = 0;

  constructor(private readonly maxConcurrent: number) {}

  get activeCount(): number {
    return this.active;
  }

  tryAcquire(): (() => void) | null {
    if (this.active >= this.maxConcurrent) {
      return null;
    }
    this.active += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active = Math.max(0, this.active - 1);
      }
    };
  }
}

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Upstream AI request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
