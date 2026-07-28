import { describe, it, expect, vi } from "vitest";

import {
  QuotaService,
  toCycleMonth,
  normalizeUuidScope,
  COMMERCE_SENTINEL_UUID,
  resolveApplicationScope,
} from "./quota.service";
import type {
  AiModelGrantRecord,
  AiModelRecord,
  ChatRequest,
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

// TD-016: entitlement resolution is exercised in platform-entitlement.client.spec.ts
// and the dedicated cases at the bottom of this file; the pre-existing tests
// predate C2 and must keep asserting the grant/commerce behaviour unchanged, so
// they get a client that never resolves (i.e. the old fail-open path).
function stubEntitlements(over?: { resolve?: unknown }) {
  return { resolve: over?.resolve ?? (async () => ({ kind: "not-configured" })) };
}

const svc = new QuotaService(null as any, stubEntitlements() as never);
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

// ── assertAllowed fail-open (TD-002/TD-005) ──────────────────────────────────

function makeGrant(overrides: Partial<AiModelGrantRecord> = {}): AiModelGrantRecord {
  return {
    id: "grant-1",
    modelId: "model-1",
    tenantId: "tenant-1",
    applicationId: null,
    applicationType: null,
    agentId: null,
    taskProfile: null,
    priority: 100,
    reason: null,
    expiresAt: null,
    isActive: true,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    modelCode: "gpt-4o",
    messages: [],
    tenantId: "tenant-1",
    ...overrides,
  };
}

describe("QuotaService.assertAllowed", () => {
  it("still denies when there is no grant for the model", async () => {
    const repository = {
      findBestGrant: vi.fn().mockResolvedValue(null),
      findCurrentSubscriptionQuota: vi.fn(),
    };
    const svc = new QuotaService(repository as never, stubEntitlements() as never);

    await expect(
      svc.assertAllowed(makeModel(), makeRequest()),
    ).rejects.toMatchObject({ code: "GRANT_DENIED" });
    expect(repository.findCurrentSubscriptionQuota).not.toHaveBeenCalled();
  });

  it("denies when a real quota is resolved and it is exhausted", async () => {
    const repository = {
      findBestGrant: vi.fn().mockResolvedValue(makeGrant()),
      findCurrentSubscriptionQuota: vi
        .fn()
        .mockResolvedValue(makeQuota({ periodTokens: 0n })),
      findUsageSummary: vi.fn().mockResolvedValue(null),
    };
    const svc = new QuotaService(repository as never, stubEntitlements() as never);

    await expect(
      svc.assertAllowed(makeModel(), makeRequest()),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("allows when a real quota is resolved with remaining tokens", async () => {
    const repository = {
      findBestGrant: vi.fn().mockResolvedValue(makeGrant()),
      findCurrentSubscriptionQuota: vi
        .fn()
        .mockResolvedValue(makeQuota({ periodTokens: 1_000n })),
      findUsageSummary: vi.fn().mockResolvedValue(null),
    };
    const svc = new QuotaService(repository as never, stubEntitlements() as never);

    const ctx = await svc.assertAllowed(makeModel(), makeRequest());
    expect(ctx.remaining).toBe(1_000n);
  });

  it("fail-opens (allows) when no quota source is resolvable, without crashing", async () => {
    const repository = {
      findBestGrant: vi.fn().mockResolvedValue(makeGrant()),
      findCurrentSubscriptionQuota: vi.fn().mockResolvedValue(null),
    };
    const svc = new QuotaService(repository as never, stubEntitlements() as never);

    const ctx = await svc.assertAllowed(
      makeModel({ provider: "private", modelCode: "my-llm" }),
      makeRequest(),
    );

    expect(ctx.remaining).toBe(-1n);
    expect(ctx.quota.periodTokens).toBe(-1n);
  });
});

describe("QuotaService C2 entitlement gate (TD-016)", () => {
  const model = makeModel({ modelCode: "glm-5.2" });
  const WS = "22222222-2222-4222-8222-222222222222";
  const grantRepo = {
    findBestGrant: vi.fn(async () => ({ id: "g1" })),
    findCurrentSubscriptionQuota: vi.fn(async () => null),
  };

  function svcWith(resolve: () => Promise<unknown>) {
    return new QuotaService(
      grantRepo as never,
      stubEntitlements({ resolve }) as never,
    );
  }

  it("denies when the platform reports every pool exhausted", async () => {
    // The first time this gate can actually say no - before TD-016 it had no
    // resolvable source at all, so it always fell through to fail-open.
    const svc = svcWith(async () => ({
      kind: "resolved",
      view: { quota_pools: [{ metric: "atlas.chat", limit: 100, remaining: 0, priority: 1 }] },
    }));

    await expect(
      svc.assertAllowed(model, { tenantId: WS }, { workspaceId: WS }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("allows when any pool still has balance", async () => {
    const svc = svcWith(async () => ({
      kind: "resolved",
      view: { quota_pools: [{ metric: "atlas.chat", limit: 100, remaining: 7, priority: 1 }] },
    }));

    await expect(
      svc.assertAllowed(model, { tenantId: WS }, { workspaceId: WS }),
    ).resolves.toBeTruthy();
  });

  it("allows when resolved but uncovered - atlas's plan catalog is still a draft", async () => {
    // Denying here would take down live traffic (karda's included) over a
    // bookkeeping gap on the platform side, not a real entitlement decision.
    const svc = svcWith(async () => ({
      kind: "resolved",
      view: { quota_pools: [] },
    }));

    await expect(
      svc.assertAllowed(model, { tenantId: WS }, { workspaceId: WS }),
    ).resolves.toBeTruthy();
  });

  it("fails open when the platform is unreachable, rather than denying", async () => {
    const svc = svcWith(async () => ({ kind: "unreachable", reason: "ETIMEDOUT" }));

    await expect(
      svc.assertAllowed(model, { tenantId: WS }, { workspaceId: WS }),
    ).resolves.toBeTruthy();
  });

  it("skips the C2 read entirely when the token carries no workspace", async () => {
    const resolve = vi.fn(async () => ({ kind: "not-configured" }));
    const svc = svcWith(resolve as never);

    await svc.assertAllowed(model, { tenantId: WS }, {});

    expect(resolve).not.toHaveBeenCalled();
  });
});
