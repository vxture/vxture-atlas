/**
 * health.service.spec.ts - 模型平台健康检查测试
 * @package @atlas/service
 * @layer Domain
 * @category test
 * @author AI-Generated
 * @date 2026-06-06
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { AtlasHealthService } from "./health.service";
import type { ModelRegistryRepository } from "../registry/model-registry.repository";
import type {
  AiModelRecord,
  TenantSubscriptionQuotaRecord,
  TenantUsageSummaryRecord,
} from "../types/runtime.types";

function makeRepository(
  overrides: Partial<ModelRegistryRepository> = {},
): ModelRegistryRepository {
  return {
    checkDatabaseConnectivity: vi.fn(async () => undefined),
    listActiveModels: vi.fn(async () => [
      makeModel({ config: { apiKeyEnvVar: "MODEL_PLATFORM_TEST_KEY" } }),
    ]),
    listSubscriptionQuotas: vi.fn(async () => [makeQuota()]),
    listUsageSummaries: vi.fn(async () => [makeUsageSummary()]),
    readReqlogPartitionRunway: vi.fn(async () => [
      { monthsAhead: 12, defaultPartitionRows: 0 },
    ]),
    ...overrides,
  } as unknown as ModelRegistryRepository;
}

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  const now = new Date("2026-06-06T00:00:00.000Z");
  return {
    id: "model-1",
    providerId: null,
    modelCode: "doubao-lite",
    modelName: "Doubao Lite",
    provider: "doubao",
    endpointUrl: "https://example.test/v1/chat/completions",
    protocol: "openai-compatible",
    modelType: "chat",
    description: null,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    capabilities: ["text"],
    supportsStreaming: true,
    isActive: true,
    sort: 0,
    config: null,
    providerConfig: null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeQuota(): TenantSubscriptionQuotaRecord {
  return {
    id: "quota-1",
    tenantId: "tenant-1",
    subscriptionId: null,
    maxUsers: 10,
    maxApiKeys: 5,
    maxWorkflows: 20,
    maxConcurrent: 5,
    rateLimitPerMinute: 60,
    periodTokens: 1000n,
    quotaCycle: "monthly",
    allowedModels: ["doubao-lite"],
    allowCustomModel: false,
    effectiveAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: null,
  };
}

function makeUsageSummary(): TenantUsageSummaryRecord {
  return {
    id: "summary-1",
    tenantId: "tenant-1",
    featureId: "00000000-0000-0000-0000-000000000000",
    applicationId: "00000000-0000-0000-0000-000000000000",
    applicationType: "internal_service",
    agentId: "00000000-0000-0000-0000-000000000000",
    cycleMonth: "2026-06",
    totalQuota: 100n,
    inputQuota: 40n,
    outputQuota: 60n,
    requestCount: 1n,
    statType: "summary",
  };
}

describe("AtlasHealthService", () => {
  afterEach(() => {
    delete process.env["MODEL_PLATFORM_TEST_KEY"];
  });

  it("returns liveness without dependency checks", () => {
    const service = new AtlasHealthService(makeRepository());

    expect(service.live()).toMatchObject({
      status: "ok",
      service: "atlas",
    });
  });

  it("returns ready when all dependency checks pass", async () => {
    process.env["MODEL_PLATFORM_TEST_KEY"] = "configured";
    const service = new AtlasHealthService(makeRepository());

    const result = await service.ready();

    expect(result.status).toBe("ready");
    expect(result.checks.database.status).toBe("pass");
    expect(result.checks.modelRegistry).toMatchObject({
      status: "pass",
      activeModels: 1,
    });
    expect(result.checks.providerKeys).toMatchObject({
      status: "pass",
      checkedKeys: 1,
      missing: [],
    });
  });

  it("returns blocked when provider key references are missing", async () => {
    const service = new AtlasHealthService(makeRepository());

    const result = await service.ready();

    expect(result.status).toBe("blocked");
    expect(result.checks.providerKeys).toMatchObject({
      status: "fail",
      missing: ["MODEL_PLATFORM_TEST_KEY"],
    });
  });

  it("returns blocked when database connectivity fails", async () => {
    const service = new AtlasHealthService(
      makeRepository({
        checkDatabaseConnectivity: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
    );

    const result = await service.ready();

    expect(result.status).toBe("blocked");
    expect(result.checks.database).toMatchObject({
      status: "fail",
      message: "database unavailable",
    });
  });

  it("returns blocked when model registry is empty", async () => {
    const service = new AtlasHealthService(
      makeRepository({
        listActiveModels: vi.fn(async () => []),
      }),
    );

    const result = await service.ready();

    expect(result.status).toBe("blocked");
    expect(result.checks.modelRegistry).toMatchObject({
      status: "fail",
      activeModels: 0,
    });
  });
});

describe("AtlasHealthService reqlog partition runway (TD-018)", () => {
  it("degrades readiness when the partition runway is nearly exhausted", async () => {
    process.env["MODEL_PLATFORM_TEST_KEY"] = "x";
    const service = new AtlasHealthService(
      makeRepository({
        readReqlogPartitionRunway: vi.fn(async () => [
          { monthsAhead: 1, defaultPartitionRows: 0 },
        ]),
      }),
    );

    const result = await service.ready();

    expect(result.checks.reqlogPartitions.status).toBe("warn");
    expect(result.status).toBe("degraded");
    delete process.env["MODEL_PLATFORM_TEST_KEY"];
  });

  it("blocks readiness once rows have landed in the DEFAULT partition", async () => {
    // This is the state TD-018 warns about: writes kept succeeding, nothing
    // errored, and drop-based retention silently stopped being possible.
    process.env["MODEL_PLATFORM_TEST_KEY"] = "x";
    const service = new AtlasHealthService(
      makeRepository({
        readReqlogPartitionRunway: vi.fn(async () => [
          { monthsAhead: 0, defaultPartitionRows: 4210 },
        ]),
      }),
    );

    const result = await service.ready();

    expect(result.checks.reqlogPartitions.status).toBe("fail");
    expect(result.checks.reqlogPartitions["defaultPartitionRows"]).toBe(4210);
    expect(result.status).toBe("blocked");
    delete process.env["MODEL_PLATFORM_TEST_KEY"];
  });

  it("passes with healthy runway", async () => {
    process.env["MODEL_PLATFORM_TEST_KEY"] = "x";
    const service = new AtlasHealthService(makeRepository());

    const result = await service.ready();

    expect(result.checks.reqlogPartitions.status).toBe("pass");
    expect(result.checks.reqlogPartitions["monthsAhead"]).toBe(12);
    delete process.env["MODEL_PLATFORM_TEST_KEY"];
  });
});
