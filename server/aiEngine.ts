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

export { generateDeterministicHydroReport } from "../src/utils/offlineHydroSummary.ts";

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
