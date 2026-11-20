import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, sanitizeErrorMessage, type CreateAppOptions } from "../server/app.ts";
import {
  generateDeterministicHydroReport,
  getAiLimitsConfig,
  validateChatRequest,
  validateQuickAuditRequest,
  type AiLimitsConfig,
} from "../server/aiEngine.ts";

function testLimits(overrides: Partial<AiLimitsConfig> = {}): AiLimitsConfig {
  return {
    ...getAiLimitsConfig({}),
    maxBodyLimit: "2kb",
    maxMessages: 3,
    maxMessageLength: 100,
    maxTotalMessagesChars: 220,
    maxContextBytes: 512,
    maxSummaryDataBytes: 512,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 10,
    maxConcurrentCalls: 2,
    upstreamTimeoutMs: 120,
    ...overrides,
  };
}

async function withTestServer(
  options: CreateAppOptions,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = createApp(options);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("generateDeterministicHydroReport handles missing, null, and malformed context conservatively", () => {
  const missingReport = generateDeterministicHydroReport(undefined);
  assert.match(missingReport, /Samples Evaluated:\*\* Not provided/);
  assert.match(missingReport, /Exceedance Status Indeterminate/);
  assert.match(missingReport, /General Hydrogeological Guidance \(Not Dataset-Derived\)/);
  assert.doesNotMatch(missingReport, /C2-S1 \/ C3-S1 predominant/);
  assert.doesNotMatch(missingReport, /Facies undergoing classification/);
  assert.doesNotMatch(missingReport, /No significant BIS IS 10500 exceedances detected/);

  const nullReport = generateDeterministicHydroReport(null);
  assert.match(nullReport, /Exceedance Status Indeterminate/);

  const malformedReport = generateDeterministicHydroReport({
    samplesCount: -10,
    activeFilters: "bad-filters",
    faciesBreakdown: "not-an-object",
    usslBreakdown: { C2S1: "bad-count" },
    exceedancesSummary: "not-an-array",
    averageParameters: { ec: "NaN", tds: null, ph: Infinity },
  });
  assert.match(malformedReport, /Samples Evaluated:\*\* Not provided/);
  assert.match(malformedReport, /Exceedance Status Indeterminate/);
  assert.match(malformedReport, /Not provided in the supplied dataset summary/);
  assert.match(malformedReport, /Average hydrochemical parameter values \(EC, TDS, pH\) were not provided/);
});

test("generateDeterministicHydroReport distinguishes valid empty exceedances from zero-sample or missing state", () => {
  const emptyWithZeroSamples = generateDeterministicHydroReport({
    samplesCount: 0,
    exceedancesSummary: [],
  });
  assert.match(emptyWithZeroSamples, /Samples Evaluated:\*\* 0/);
  assert.match(emptyWithZeroSamples, /No Evaluable Records/);

  const emptyWithSamples = generateDeterministicHydroReport({
    samplesCount: 15,
    exceedancesSummary: [],
  });
  assert.match(emptyWithSamples, /Samples Evaluated:\*\* 15/);
  assert.match(emptyWithSamples, /No BIS IS 10500:2012 exceedances were listed in the supplied exceedance summary/);

  const malformedItems = generateDeterministicHydroReport({
    samplesCount: 10,
    exceedancesSummary: [{ parameter: "", count: "bad" }, 42],
  });
  assert.match(malformedItems, /Exceedance Status Indeterminate/);
});

test("generateDeterministicHydroReport formats valid metrics including zero averages and health notes", () => {
  const report = generateDeterministicHydroReport({
    samplesCount: 40,
    activeFilters: { state: "Rajasthan", district: "Jaipur", season: "Pre-Monsoon", year: "2024" },
    faciesBreakdown: { "Na-Cl": 25, "Ca-HCO3": 15 },
    usslBreakdown: { "C3-S1": 30 },
    averageParameters: { ec: 1200, tds: 780, ph: 7.4, sar: 0 },
    exceedancesSummary: [
      { parameter: "Fluoride (F)", count: 8, limit: 1.5, maxVal: 3.1, unit: "mg/L" },
      { parameter: "Nitrate (NO3)", count: 5, limit: 45, maxVal: 68, unit: "mg/L" },
    ],
  });

  assert.match(report, /Jaipur, Rajasthan/);
  assert.match(report, /\*\*40 evaluated sample\(s\)\*\*/);
  assert.match(report, /EC: \*\*1200 µS\/cm\*\*/);
  assert.match(report, /Reported Mean SAR:\*\* \*\*0\*\*/);
  assert.match(report, /\*\*Na-Cl\*\*: 25 samples \(63%\)/);
  assert.match(report, /Fluoride Note/);
  assert.match(report, /Nitrate Note/);
  assert.match(report, /General Hydrogeological Guidance \(Not Dataset-Derived\)/);
});

test("runtime validators reject malformed inputs with 400 details", () => {
  const limits = testLimits();

  assert.equal(validateChatRequest(null, limits).ok, false);
  assert.equal(validateChatRequest({ messages: [] }, limits).ok, false);
  assert.equal(
    validateChatRequest({ messages: [{ role: "system", content: "hi" }] }, limits).ok,
    false
  );
  assert.equal(
    validateChatRequest({ messages: [{ role: "user", content: "   " }] }, limits).ok,
    false
  );
  assert.equal(
    validateChatRequest({ messages: [{ role: "user", content: 123 }] }, limits).ok,
    false
  );
  assert.equal(
    validateChatRequest(
      { messages: [{ role: "user", content: "a".repeat(101) }] },
      limits
    ).ok,
    false
  );
  assert.equal(
    validateChatRequest(
      {
        messages: [
          { role: "user", content: "1" },
          { role: "model", content: "2" },
          { role: "user", content: "3" },
          { role: "model", content: "4" },
        ],
      },
      limits
    ).ok,
    false
  );
  assert.equal(
    validateChatRequest(
      {
        messages: [{ role: "user", content: "ok" }],
        context: { blob: "x".repeat(600) },
      },
      limits
    ).ok,
    false
  );
  assert.equal(
    validateChatRequest(
      {
        messages: [{ role: "user", content: "ok" }],
        allowFallback: "yes",
      },
      limits
    ).ok,
    false
  );

  assert.equal(validateQuickAuditRequest({}, limits).ok, false);
  assert.equal(validateQuickAuditRequest({ summaryData: [] }, limits).ok, false);
  assert.equal(
    validateQuickAuditRequest({ summaryData: { pad: "y".repeat(600) } }, limits).ok,
    false
  );
});

test("sanitizeErrorMessage redacts Google API keys and auth tokens", () => {
  const fakeKey = "AIzaSyTestSecretKey1234567890abcdefgh";
  const sanitized = sanitizeErrorMessage(new Error(`Upstream rejected apiKey=${fakeKey} Bearer tok123`));
  assert.ok(!sanitized.includes(fakeKey));
  assert.ok(!sanitized.includes("tok123"));
  assert.match(sanitized, /\[REDACTED/);
});

test("HTTP /api/health and /api/ai/* handle validation, mocking, fallback, 503, 413, and 429 cleanly", async () => {
  const limits = testLimits({ rateLimitMaxRequests: 20 });
  let executorCalls = 0;

  await withTestServer(
    {
      limits,
      hasApiKey: () => true,
      aiExecutor: async ({ kind }) => {
        executorCalls += 1;
        return kind === "chat" ? "Mocked Gemini chat reply" : "Mocked Gemini audit report";
      },
    },
    async (baseUrl) => {
      // 1. Health endpoint
      const healthRes = await fetch(`${baseUrl}/api/health`);
      assert.equal(healthRes.status, 200);
      const healthBody = (await healthRes.json()) as { status: string };
      assert.equal(healthBody.status, "ok");

      // 2. Malformed JSON -> 400
      const badJsonRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      });
      assert.equal(badJsonRes.status, 400);

      // 3. Invalid role -> 400 before executor
      const badRoleRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "assistant", content: "hi" }] }),
      });
      assert.equal(badRoleRes.status, 400);
      assert.equal(executorCalls, 0);

      // 4. Oversized body -> 413
      const hugeRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          extra: "z".repeat(4000),
        }),
      });
      assert.equal(hugeRes.status, 413);

      // 5. Valid chat -> 200
      const okChatRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Summarize salinity" }],
          context: { samplesCount: 5, exceedancesSummary: [] },
        }),
      });
      assert.equal(okChatRes.status, 200);
      const okChatBody = (await okChatRes.json()) as { reply: string; isFallback: boolean };
      assert.equal(okChatBody.reply, "Mocked Gemini chat reply");
      assert.equal(okChatBody.isFallback, false);

      // 6. Valid quick-audit -> 200
      const okAuditRes = await fetch(`${baseUrl}/api/ai/quick-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryData: { samplesCount: 8, exceedancesSummary: [] } }),
      });
      assert.equal(okAuditRes.status, 200);
      const okAuditBody = (await okAuditRes.json()) as { auditReport: string; isFallback: boolean };
      assert.equal(okAuditBody.auditReport, "Mocked Gemini audit report");
      assert.equal(okAuditBody.isFallback, false);
      assert.equal(executorCalls, 2);
    }
  );
});

test("HTTP /api/ai/* handles timeouts, secret-free 503s, concurrency limits, and 429 rate limits", async () => {
  const fakeSecret = "AIzaSyLeakTestSecret9876543210abcdef";
  const limits = testLimits({
    upstreamTimeoutMs: 40,
    maxConcurrentCalls: 1,
    rateLimitMaxRequests: 6,
  });

  await withTestServer(
    {
      limits,
      hasApiKey: () => true,
      aiExecutor: async ({ contents }) => {
        const serialized = JSON.stringify(contents);
        if (serialized.includes("hang")) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return "too late";
        }
        throw new Error(`Provider failure with key=${fakeSecret}`);
      },
    },
    async (baseUrl) => {
      // 1. Timeout + allowFallback=true -> conservative offline report
      const timeoutFallbackRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "please hang" }],
          context: { samplesCount: 3 },
        }),
      });
      assert.equal(timeoutFallbackRes.status, 200);
      const timeoutFallbackBody = (await timeoutFallbackRes.json()) as {
        reply: string;
        isFallback: boolean;
        fallbackNote?: string;
      };
      assert.equal(timeoutFallbackBody.isFallback, true);
      assert.match(timeoutFallbackBody.reply, /Exceedance Status Indeterminate/);

      // 2. Upstream failure + allowFallback=false -> 503 with zero secret leakage
      const fail503Res = await fetch(`${baseUrl}/api/ai/quick-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryData: { samplesCount: 4 },
          allowFallback: false,
        }),
      });
      assert.equal(fail503Res.status, 503);
      const fail503Text = await fail503Res.text();
      assert.ok(!fail503Text.includes(fakeSecret));
      assert.match(fail503Text, /unavailable/i);

      // 3. Concurrency saturation -> second concurrent call receives immediate 503
      const slowReq = fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hang first" }],
          allowFallback: false,
        }),
      });
      // Give the first request a tick to enter the concurrency slot
      await new Promise((resolve) => setTimeout(resolve, 10));
      const busyRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "second request" }],
          allowFallback: false,
        }),
      });
      assert.equal(busyRes.status, 503);
      assert.ok(busyRes.headers.get("retry-after"));
      const firstRes = await slowReq;
      assert.equal(firstRes.status, 503);

      // 4. Exhaust rate limit (max 6) -> 429 with Retry-After
      const fifth = await fetch(`${baseUrl}/api/ai/quick-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryData: {} }),
      });
      assert.equal(fifth.status, 200);
      const sixth = await fetch(`${baseUrl}/api/ai/quick-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryData: {} }),
      });
      assert.equal(sixth.status, 200);

      const rateLimited = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
      });
      assert.equal(rateLimited.status, 429);
      assert.ok(rateLimited.headers.get("retry-after"));
    }
  );
});
