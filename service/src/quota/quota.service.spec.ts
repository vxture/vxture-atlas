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
} from "../types/runtime.types";

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
    providerConfig: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

// TD-016: entitlement resolution is exercised in platform-entitlement.client.spec.ts
// and the dedicated cases at the bottom of this file; other tests in this file
// don't care about C2 at all, so they get a client that never resolves.
function stubEntitlements(over?: { resolve?: unknown }) {
  return { resolve: over?.resolve ?? (async () => ({ kind: "not-configured" })) };
}

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

// TD-002/TD-005 (2026-07-28): this used to test a second quota layer
// (subscription token quota + model-allowlist) sourced from
// findCurrentSubscriptionQuota/findUsageSummary. Both were removed as
// unreachable dead code - they always returned null (stubs left over from
// the DB split; the backing tables never existed in Atlas's own database),
// so every call fell straight through to what is now the only path: the
// grant check plus the real C2 pool check (TD-016, covered below).
describe("QuotaService.assertAllowed", () => {
  it("denies when there is no grant for the model", async () => {
    const repository = { findBestGrant: vi.fn().mockResolvedValue(null) };
    const svc = new QuotaService(repository as never, stubEntitlements() as never);

    await expect(
      svc.assertAllowed(makeModel(), makeRequest()),
    ).rejects.toMatchObject({ code: "GRANT_DENIED" });
  });

  it("allows when a grant exists and no C2 pool is exhausted", async () => {
    const repository = { findBestGrant: vi.fn().mockResolvedValue(makeGrant()) };
    const svc = new QuotaService(repository as never, stubEntitlements() as never);

    await expect(
      svc.assertAllowed(makeModel(), makeRequest()),
    ).resolves.toBeUndefined();
  });
});

describe("QuotaService C2 entitlement gate (TD-016)", () => {
  const model = makeModel({ modelCode: "glm-5.2" });
  const WS = "22222222-2222-4222-8222-222222222222";
  const grantRepo = {
    findBestGrant: vi.fn(async () => ({ id: "g1" })),
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
    ).resolves.toBeUndefined();
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
    ).resolves.toBeUndefined();
  });

  it("fails open when the platform is unreachable, rather than denying", async () => {
    const svc = svcWith(async () => ({ kind: "unreachable", reason: "ETIMEDOUT" }));

    await expect(
      svc.assertAllowed(model, { tenantId: WS }, { workspaceId: WS }),
    ).resolves.toBeUndefined();
  });

  it("skips the C2 read entirely when the token carries no workspace", async () => {
    const resolve = vi.fn(async () => ({ kind: "not-configured" }));
    const svc = svcWith(resolve as never);

    await svc.assertAllowed(model, { tenantId: WS }, {});

    expect(resolve).not.toHaveBeenCalled();
  });
});
