import { describe, it, expect } from "vitest";

import { ModelAdminService } from "./model-admin.service";
import { ModelAdminException } from "./model-admin.errors";
import type {
  CreateAiModelBody,
  CreateAiModelGrantBody,
  CreateModelPolicyBody,
  CreateModelPriceRuleBody,
  CreateModelProviderBody,
  UpdateAiModelBody,
  UpdateAiModelGrantBody,
} from "./model-admin.service";
import type { ModelRegistryRepository } from "../registry/model-registry.repository";
import type {
  AiModelRecord,
  TenantSubscriptionQuotaRecord,
  TenantUsageSummaryRecord,
} from "../types/runtime.types";

// ── helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = new ModelAdminService(null as any);

const normalizeCreate = (body: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).normalizeCreateModel(body) as ReturnType<
    ModelAdminService["createModel"]
  >;
const normalizeUpdate = (body: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).normalizeUpdateModel(body) as ReturnType<
    ModelAdminService["updateModel"]
  >;
const normalizeUpdateGrant = (body: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).normalizeUpdateGrant(body) as ReturnType<
    ModelAdminService["updateGrant"]
  >;
const normalizeCreateProvider = (body: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).normalizeCreateProvider(body) as unknown;

const VALID_BASE: CreateAiModelBody = {
  modelCode: "gpt-4o",
  modelName: "GPT-4o",
  provider: "openai",
  endpointUrl: "https://api.openai.com/v1",
  protocol: "openai",
  capabilities: ["chat"],
};

// ── normalizeCreateModel ──────────────────────────────────────────────────────

describe("normalizeCreateModel", () => {
  describe("required field validation", () => {
    it("throws when capabilities is absent", () => {
      const body = { ...VALID_BASE };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (body as any).capabilities;
      expect(() => normalizeCreate(body)).toThrow(ModelAdminException);
    });

    it("throws when capabilities is not an array", () => {
      expect(() =>
        normalizeCreate({ ...VALID_BASE, capabilities: "chat" }),
      ).toThrow(ModelAdminException);
    });

    it("throws when capabilities is empty after filtering", () => {
      expect(() =>
        normalizeCreate({ ...VALID_BASE, capabilities: [] }),
      ).toThrow(ModelAdminException);
    });

    it("throws when capabilities contains only whitespace strings", () => {
      expect(() =>
        normalizeCreate({ ...VALID_BASE, capabilities: ["  ", ""] }),
      ).toThrow(ModelAdminException);
    });

    it("throws when modelCode is missing", () => {
      expect(() => normalizeCreate({ ...VALID_BASE, modelCode: "" })).toThrow(
        ModelAdminException,
      );
    });

    it("throws when modelCode is whitespace", () => {
      expect(() => normalizeCreate({ ...VALID_BASE, modelCode: "  " })).toThrow(
        ModelAdminException,
      );
    });

    it("throws when modelName is missing", () => {
      expect(() => normalizeCreate({ ...VALID_BASE, modelName: "" })).toThrow(
        ModelAdminException,
      );
    });

    it("throws when provider is missing", () => {
      expect(() => normalizeCreate({ ...VALID_BASE, provider: "" })).toThrow(
        ModelAdminException,
      );
    });

    it("throws when endpointUrl is not a valid URL", () => {
      expect(() =>
        normalizeCreate({ ...VALID_BASE, endpointUrl: "not-a-url" }),
      ).toThrow(ModelAdminException);
    });

    it("throws when protocol is missing", () => {
      expect(() => normalizeCreate({ ...VALID_BASE, protocol: "" })).toThrow(
        ModelAdminException,
      );
    });
  });

  describe("defaults", () => {
    it('defaults modelType to "chat"', () => {
      const result = normalizeCreate(VALID_BASE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).modelType).toBe("chat");
    });

    it("defaults supportsStreaming to true", () => {
      const result = normalizeCreate(VALID_BASE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).supportsStreaming).toBe(true);
    });

    it("defaults sort to 999", () => {
      const result = normalizeCreate(VALID_BASE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).sort).toBe(999);
    });

    it("defaults description to null", () => {
      const result = normalizeCreate(VALID_BASE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).description).toBeNull();
    });

    it("defaults contextWindow to null", () => {
      const result = normalizeCreate(VALID_BASE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).contextWindow).toBeNull();
    });

    it("defaults config to null", () => {
      const result = normalizeCreate(VALID_BASE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).config).toBeNull();
    });

    it("maps legacy apiKeyEnvVar input into runtime config", () => {
      const result = normalizeCreate({
        ...VALID_BASE,
        apiKeyEnvVar: "TEST_MODEL_KEY",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).config).toEqual({
        apiKeyEnvVar: "TEST_MODEL_KEY",
      });
    });

    it("maps keyReference input into runtime config", () => {
      const result = normalizeCreate({
        ...VALID_BASE,
        keyReference: { source: "env", name: "TEST_MODEL_KEY" },
        config: { fallbackModelCodes: ["backup-model"] },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).config).toEqual({
        fallbackModelCodes: ["backup-model"],
        apiKeyEnvVar: "TEST_MODEL_KEY",
      });
    });
  });

  describe("explicit values", () => {
    it("uses provided modelType", () => {
      const result = normalizeCreate({ ...VALID_BASE, modelType: "embedding" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).modelType).toBe("embedding");
    });

    it("uses provided supportsStreaming=false", () => {
      const result = normalizeCreate({
        ...VALID_BASE,
        supportsStreaming: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).supportsStreaming).toBe(false);
    });

    it("uses provided sort", () => {
      const result = normalizeCreate({ ...VALID_BASE, sort: 1 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).sort).toBe(1);
    });

    it("accepts contextWindow=0", () => {
      const result = normalizeCreate({ ...VALID_BASE, contextWindow: 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).contextWindow).toBe(0);
    });

    it("throws when contextWindow is negative", () => {
      expect(() =>
        normalizeCreate({ ...VALID_BASE, contextWindow: -1 }),
      ).toThrow(ModelAdminException);
    });

    it("throws when maxOutputTokens is negative", () => {
      expect(() =>
        normalizeCreate({ ...VALID_BASE, maxOutputTokens: -512 }),
      ).toThrow(ModelAdminException);
    });

    it("deduplicates capabilities", () => {
      const result = normalizeCreate({
        ...VALID_BASE,
        capabilities: ["chat", "chat", "vision"],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).capabilities).toEqual(["chat", "vision"]);
    });

    it("trims capability strings", () => {
      const result = normalizeCreate({
        ...VALID_BASE,
        capabilities: [" chat ", " vision"],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).capabilities).toEqual(["chat", "vision"]);
    });
  });
});

// ── normalizeUpdateModel ──────────────────────────────────────────────────────

describe("normalizeUpdateModel", () => {
  it("returns an empty object for an empty body", () => {
    const result = normalizeUpdate({} satisfies UpdateAiModelBody);
    expect(result).toEqual({});
  });

  it("passes isActive through", () => {
    const result = normalizeUpdate({
      isActive: false,
    } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).isActive).toBe(false);
  });

  it("throws for an invalid endpointUrl", () => {
    expect(() =>
      normalizeUpdate({
        endpointUrl: "ftp-is-wrong",
      } satisfies UpdateAiModelBody),
    ).toThrow(ModelAdminException);
  });

  it("accepts a valid endpointUrl", () => {
    const result = normalizeUpdate({
      endpointUrl: "https://new.endpoint.com/v2",
    } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).endpointUrl).toBe("https://new.endpoint.com/v2");
  });

  it("throws for a negative contextWindow", () => {
    expect(() =>
      normalizeUpdate({ contextWindow: -1 } satisfies UpdateAiModelBody),
    ).toThrow(ModelAdminException);
  });

  it("accepts contextWindow=0", () => {
    const result = normalizeUpdate({
      contextWindow: 0,
    } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).contextWindow).toBe(0);
  });

  it("passes description null through", () => {
    const result = normalizeUpdate({
      description: null,
    } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).description).toBeNull();
  });

  it("throws when capabilities is empty", () => {
    expect(() =>
      normalizeUpdate({ capabilities: [] } satisfies UpdateAiModelBody),
    ).toThrow(ModelAdminException);
  });

  it("passes supportsStreaming=false through", () => {
    const result = normalizeUpdate({
      supportsStreaming: false,
    } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).supportsStreaming).toBe(false);
  });

  it("passes sort through", () => {
    const result = normalizeUpdate({ sort: 10 } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).sort).toBe(10);
  });

  it("does not include keys absent from the body", () => {
    const result = normalizeUpdate({ sort: 5 } satisfies UpdateAiModelBody);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Object.keys(result as any)).toEqual(["sort"]);
  });
});

// ── response safety ───────────────────────────────────────────────────────────

describe("model admin response safety", () => {
  it("redacts secret-like config keys and exposes key reference status", async () => {
    process.env["MODEL_ADMIN_TEST_KEY"] = "secret";

    const repository = {
      listModels: async () => [
        makeModel({
          config: {
            apiKeyEnvVar: "MODEL_ADMIN_TEST_KEY",
            fallbackModelCodes: ["backup-model"],
            maxTokens: 8192,
            password: "hidden",
            nested: { token: "nested-secret", publicHint: "visible" },
          },
        }),
      ],
    } as Pick<ModelRegistryRepository, "listModels"> as ModelRegistryRepository;
    const service = new ModelAdminService(repository);
    const [model] = await service.listModels(true);

    expect(model?.config).toEqual({
      fallbackModelCodes: ["backup-model"],
      maxTokens: 8192,
      nested: { publicHint: "visible" },
    });
    expect(model?.keyReference).toEqual({
      source: "env",
      name: "MODEL_ADMIN_TEST_KEY",
      configured: true,
    });

    delete process.env["MODEL_ADMIN_TEST_KEY"];
  });
});

// ── grant scope validation ────────────────────────────────────────────────────

describe("normalizeUpdateGrant", () => {
  it("throws when applicationId is updated without applicationType", () => {
    expect(() =>
      normalizeUpdateGrant({
        applicationId: "00000000-0000-4000-a000-000000000001",
      } satisfies UpdateAiModelGrantBody),
    ).toThrow(ModelAdminException);
  });

  it("throws when applicationType is updated without applicationId", () => {
    expect(() =>
      normalizeUpdateGrant({
        applicationType: "agent",
      } satisfies UpdateAiModelGrantBody),
    ).toThrow(ModelAdminException);
  });

  it("accepts paired application scope", () => {
    const result = normalizeUpdateGrant({
      applicationId: "00000000-0000-4000-a000-000000000001",
      applicationType: "agent",
    } satisfies UpdateAiModelGrantBody);

    expect(result).toEqual({
      applicationId: "00000000-0000-4000-a000-000000000001",
      applicationType: "agent",
    });
  });

  it("maps agentId to agent application scope", () => {
    const result = normalizeUpdateGrant({
      agentId: "00000000-0000-4000-a000-000000000001",
    } satisfies UpdateAiModelGrantBody);

    expect(result).toEqual({
      agentId: "00000000-0000-4000-a000-000000000001",
      applicationId: "00000000-0000-4000-a000-000000000001",
      applicationType: "agent",
    });
  });
});

describe("createGrant", () => {
  it("throws when applicationId is provided without applicationType", async () => {
    const repository = {
      findModelById: async () => makeModel(),
    } as Pick<
      ModelRegistryRepository,
      "findModelById"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    await expect(
      service.createGrant({
        modelId: "00000000-0000-4000-a000-000000000100",
        tenantId: "00000000-0000-4000-a000-000000000200",
        applicationId: "00000000-0000-4000-a000-000000000300",
      } satisfies CreateAiModelGrantBody),
    ).rejects.toThrow(ModelAdminException);
  });
});

// ── P3.2 provider / price / policy contracts ─────────────────────────────────

describe("normalizeCreateProvider", () => {
  it("defaults providerType and strips secret-like config keys", () => {
    const result = normalizeCreateProvider({
      providerCode: "doubao",
      providerName: "Doubao",
      config: {
        publicRegion: "cn-beijing",
        token: "hidden",
        nested: { password: "hidden", timeoutMs: 15000 },
      },
    } satisfies CreateModelProviderBody);

    expect(result).toEqual({
      providerCode: "doubao",
      providerType: "online",
      providerName: "Doubao",
      description: null,
      logoUrl: null,
      homepageUrl: null,
      consoleUrl: null,
      billingUrl: null,
      config: {
        publicRegion: "cn-beijing",
        nested: { timeoutMs: 15000 },
      },
      isActive: true,
    });
  });
});

describe("normalizeCreatePriceRule", () => {
  it("normalizes provider cost metadata", async () => {
    const repository = {
      findModelById: async () => makeModel(),
    } as Pick<
      ModelRegistryRepository,
      "findModelById"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    const result =
      await // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).normalizeCreatePriceRule({
        modelId: "00000000-0000-4000-a000-000000000100",
        inputUnitPrice: 0.1,
        outputUnitPrice: "0.2",
        requestUnitPrice: null,
      } satisfies CreateModelPriceRuleBody);

    expect(result).toMatchObject({
      modelId: "00000000-0000-4000-a000-000000000100",
      billingMode: "token",
      currency: "CNY",
      unitTokens: 1000000,
      inputUnitPrice: "0.1",
      outputUnitPrice: "0.2",
      requestUnitPrice: "0",
      isActive: true,
    });
    expect(result.effectiveAt).toBeInstanceOf(Date);
  });

  it("throws for negative price", async () => {
    const repository = {
      findModelById: async () => makeModel(),
    } as Pick<
      ModelRegistryRepository,
      "findModelById"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).normalizeCreatePriceRule({
        modelId: "00000000-0000-4000-a000-000000000100",
        inputUnitPrice: "-1",
      } satisfies CreateModelPriceRuleBody),
    ).rejects.toThrow(ModelAdminException);
  });
});

describe("normalizeCreatePolicy", () => {
  it("normalizes bigint limits and default priority", async () => {
    const repository = {
      findModelById: async () => makeModel(),
    } as Pick<
      ModelRegistryRepository,
      "findModelById"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    const result =
      await // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).normalizeCreatePolicy({
        modelId: "00000000-0000-4000-a000-000000000100",
        tenantId: "00000000-0000-4000-a000-000000000200",
        rateLimitTpm: "100000",
        rateLimitTpd: 200000,
      } satisfies CreateModelPolicyBody);

    expect(result).toMatchObject({
      modelId: "00000000-0000-4000-a000-000000000100",
      tenantId: "00000000-0000-4000-a000-000000000200",
      priority: 100,
      rateLimitTpm: 100000n,
      rateLimitTpd: 200000n,
      isActive: true,
    });
  });

  it("throws for negative bigint limit", async () => {
    const repository = {
      findModelById: async () => makeModel(),
    } as Pick<
      ModelRegistryRepository,
      "findModelById"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).normalizeCreatePolicy({
        modelId: "00000000-0000-4000-a000-000000000100",
        rateLimitTpm: "-1",
      } satisfies CreateModelPolicyBody),
    ).rejects.toThrow(ModelAdminException);
  });
});

// ── P3.3 quota / usage read contracts ────────────────────────────────────────

describe("quota and usage read contracts", () => {
  it("maps tenant quota bigint fields to strings", async () => {
    const repository = {
      listSubscriptionQuotas: async () => [makeQuota()],
    } as Pick<
      ModelRegistryRepository,
      "listSubscriptionQuotas"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    const [quota] = await service.listTenantQuotas({
      tenantId: "00000000-0000-4000-a000-000000000200",
    });

    expect(quota?.periodTokens).toBe("1000000");
    expect(quota?.allowedModels).toEqual(["test-model"]);
  });

  it("maps usage summary bigint fields to strings", async () => {
    const repository = {
      listUsageSummaries: async () => [makeUsageSummary()],
    } as Pick<
      ModelRegistryRepository,
      "listUsageSummaries"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    const [summary] = await service.listUsageSummaries({
      tenantId: "00000000-0000-4000-a000-000000000200",
      applicationId: "00000000-0000-4000-a000-000000000300",
      applicationType: "agent",
    });

    expect(summary).toMatchObject({
      totalQuota: "10",
      inputQuota: "4",
      outputQuota: "6",
      requestCount: "1",
    });
  });

  it("rejects usage applicationId without applicationType", async () => {
    const repository = {
      listUsageSummaries: async () => [],
    } as Pick<
      ModelRegistryRepository,
      "listUsageSummaries"
    > as ModelRegistryRepository;
    const service = new ModelAdminService(repository);

    await expect(
      service.listUsageSummaries({
        applicationId: "00000000-0000-4000-a000-000000000300",
      }),
    ).rejects.toThrow(ModelAdminException);
  });
});

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "00000000-0000-4000-a000-000000000100",
    providerId: null,
    modelCode: "test-model",
    modelName: "Test Model",
    provider: "private",
    endpointUrl: "https://model.example.test",
    protocol: "openai",
    modelType: "chat",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: ["chat"],
    supportsStreaming: true,
    isActive: true,
    sort: 100,
    config: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-06-06T00:00:00.000Z"),
    updatedAt: new Date("2026-06-06T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeQuota(
  overrides: Partial<TenantSubscriptionQuotaRecord> = {},
): TenantSubscriptionQuotaRecord {
  return {
    id: "00000000-0000-4000-a000-000000000400",
    tenantId: "00000000-0000-4000-a000-000000000200",
    subscriptionId: null,
    maxUsers: 10,
    maxApiKeys: 5,
    maxWorkflows: 20,
    maxConcurrent: 5,
    rateLimitPerMinute: 60,
    periodTokens: 1000000n,
    quotaCycle: "monthly",
    allowedModels: ["test-model"],
    allowCustomModel: false,
    effectiveAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: null,
    ...overrides,
  };
}

function makeUsageSummary(
  overrides: Partial<TenantUsageSummaryRecord> = {},
): TenantUsageSummaryRecord {
  return {
    id: "00000000-0000-4000-a000-000000000500",
    tenantId: "00000000-0000-4000-a000-000000000200",
    featureId: "00000000-0000-0000-0000-000000000000",
    applicationId: "00000000-0000-4000-a000-000000000300",
    applicationType: "agent",
    agentId: "00000000-0000-4000-a000-000000000300",
    cycleMonth: "202606",
    totalQuota: 10n,
    inputQuota: 4n,
    outputQuota: 6n,
    requestCount: 1n,
    statType: "detail",
    ...overrides,
  };
}
