import { describe, it, expect } from "vitest";

import {
  QuotaService,
  toCycleMonth,
  normalizeUuidScope,
  COMMERCE_SENTINEL_UUID,
  resolveApplicationScope,
} from "./quota.service";
import type {
  AiModelRecord,
  TenantSubscriptionQuotaRecord,
} from "../types/runtime.types";

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: null,
    modelCode: "gpt-4o",
    modelName: "GPT-4o",
    provider: "openai",
    endpointUrl: "https://api.openai.com/v1",
    protocol: "openai",
    modelType: "chat",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: ["chat"],
    supportsStreaming: true,
    sort: 999,
    isActive: true,
    config: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeQuota(
  overrides: Partial<TenantSubscriptionQuotaRecord> = {},
): TenantSubscriptionQuotaRecord {
  return {
    id: "quota-1",
    tenantId: "tenant-1",
    subscriptionId: null,
    maxUsers: 10,
    maxApiKeys: 5,
    maxWorkflows: 20,
    maxConcurrent: 5,
    rateLimitPerMinute: 60,
    periodTokens: 1_000_000n,
    quotaCycle: "monthly",
    allowedModels: [],
    allowCustomModel: false,
    effectiveAt: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    ...overrides,
  };
}

// Bypass private access for Phase 1 testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = new QuotaService(null as any);
const isModelAllowed = (
  model: AiModelRecord,
  quota: TenantSubscriptionQuotaRecord,
): boolean =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).isModelAllowed(model, quota) as boolean;

// ── toCycleMonth ──────────────────────────────────────────────────────────────

describe("toCycleMonth", () => {
  it("formats January correctly", () => {
    expect(toCycleMonth(new Date(Date.UTC(2026, 0, 15)))).toBe("202601");
  });

  it("formats December correctly", () => {
    expect(toCycleMonth(new Date(Date.UTC(2026, 11, 31)))).toBe("202612");
  });

  it("zero-pads single-digit months", () => {
    expect(toCycleMonth(new Date(Date.UTC(2025, 8, 1)))).toBe("202509");
  });

  it("uses UTC month, not local time", () => {
    // Force a UTC midnight — month must be derived from UTC, not local offset
    const d = new Date("2026-02-01T00:00:00Z");
    expect(toCycleMonth(d)).toBe("202602");
  });
});

// ── normalizeUuidScope ────────────────────────────────────────────────────────

describe("normalizeUuidScope", () => {
  it("returns sentinel for undefined", () => {
    expect(normalizeUuidScope(undefined)).toBe(COMMERCE_SENTINEL_UUID);
  });

  it("returns sentinel for empty string", () => {
    expect(normalizeUuidScope("")).toBe(COMMERCE_SENTINEL_UUID);
  });

  it("returns sentinel for whitespace-only string", () => {
    expect(normalizeUuidScope("   ")).toBe(COMMERCE_SENTINEL_UUID);
  });

  it("returns the value for a non-empty UUID", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(normalizeUuidScope(uuid)).toBe(uuid);
  });

  it("does not trim the returned value", () => {
    // normalizeUuidScope returns value?.trim() || sentinel — non-empty trims it
    expect(normalizeUuidScope(" abc ")).toBe("abc");
  });
});

// ── resolveApplicationScope ──────────────────────────────────────────────────

describe("resolveApplicationScope", () => {
  it("maps legacy agentId to agent application scope", () => {
    const scope = resolveApplicationScope({
      agentId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(scope).toEqual({
      applicationId: "550e8400-e29b-41d4-a716-446655440000",
      applicationType: "agent",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("uses explicit workflow application scope without agent attribution", () => {
    const scope = resolveApplicationScope({
      applicationId: "550e8400-e29b-41d4-a716-446655440001",
      applicationType: "workflow",
    });

    expect(scope).toEqual({
      applicationId: "550e8400-e29b-41d4-a716-446655440001",
      applicationType: "workflow",
      agentId: COMMERCE_SENTINEL_UUID,
    });
  });

  it("keeps explicit agent application compatible with agent summary", () => {
    const scope = resolveApplicationScope({
      applicationId: "550e8400-e29b-41d4-a716-446655440002",
      applicationType: "agent",
    });

    expect(scope).toEqual({
      applicationId: "550e8400-e29b-41d4-a716-446655440002",
      applicationType: "agent",
      agentId: "550e8400-e29b-41d4-a716-446655440002",
    });
  });

  it("falls back to internal service sentinel when no application is supplied", () => {
    const scope = resolveApplicationScope({});

    expect(scope).toEqual({
      applicationId: COMMERCE_SENTINEL_UUID,
      applicationType: "internal_service",
      agentId: COMMERCE_SENTINEL_UUID,
    });
  });
});

// ── isModelAllowed ────────────────────────────────────────────────────────────

describe("isModelAllowed", () => {
  describe("platform provider (non-private)", () => {
    it("allows any model when allowedModels is empty (platform default)", () => {
      expect(
        isModelAllowed(makeModel({ provider: "openai" }), makeQuota()),
      ).toBe(true);
    });

    it("denies model when allowedModels is non-empty and model is not listed", () => {
      const quota = makeQuota({ allowedModels: ["claude-3-opus"] });
      expect(
        isModelAllowed(
          makeModel({ provider: "openai", modelCode: "gpt-4o" }),
          quota,
        ),
      ).toBe(false);
    });

    it("allows model explicitly listed in allowedModels", () => {
      const quota = makeQuota({ allowedModels: ["gpt-4o"] });
      expect(
        isModelAllowed(
          makeModel({ provider: "openai", modelCode: "gpt-4o" }),
          quota,
        ),
      ).toBe(true);
    });

    it("allows doubao model explicitly listed even when other models are present", () => {
      const quota = makeQuota({
        allowedModels: ["doubao-pro", "claude-3-opus"],
      });
      expect(
        isModelAllowed(
          makeModel({ provider: "doubao", modelCode: "doubao-pro" }),
          quota,
        ),
      ).toBe(true);
    });
  });

  describe("private provider", () => {
    it("denies when allowCustomModel=false and model not in allowedModels", () => {
      const model = makeModel({ provider: "private", modelCode: "my-llm" });
      expect(
        isModelAllowed(model, makeQuota({ allowCustomModel: false })),
      ).toBe(false);
    });

    it("allows when allowCustomModel=true", () => {
      const model = makeModel({ provider: "private", modelCode: "my-llm" });
      expect(isModelAllowed(model, makeQuota({ allowCustomModel: true }))).toBe(
        true,
      );
    });

    it("allows when model is explicitly listed even if allowCustomModel=false", () => {
      const model = makeModel({ provider: "private", modelCode: "my-llm" });
      const quota = makeQuota({
        allowCustomModel: false,
        allowedModels: ["my-llm"],
      });
      expect(isModelAllowed(model, quota)).toBe(true);
    });

    it('treats "custom" as a private provider — denied without allowCustomModel', () => {
      const model = makeModel({ provider: "custom", modelCode: "local-model" });
      expect(
        isModelAllowed(model, makeQuota({ allowCustomModel: false })),
      ).toBe(false);
    });

    it('treats "custom" as a private provider — allowed with allowCustomModel', () => {
      const model = makeModel({ provider: "custom", modelCode: "local-model" });
      expect(isModelAllowed(model, makeQuota({ allowCustomModel: true }))).toBe(
        true,
      );
    });

    it('treats "self-hosted" as a private provider — denied without allowCustomModel', () => {
      const model = makeModel({
        provider: "self-hosted",
        modelCode: "on-prem",
      });
      expect(
        isModelAllowed(model, makeQuota({ allowCustomModel: false })),
      ).toBe(false);
    });

    it('treats "self-hosted" as a private provider — allowed with allowCustomModel', () => {
      const model = makeModel({
        provider: "self-hosted",
        modelCode: "on-prem",
      });
      expect(isModelAllowed(model, makeQuota({ allowCustomModel: true }))).toBe(
        true,
      );
    });
  });
});
