import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BadRequestException, HttpStatus, Logger } from "@nestjs/common";

import { ModelRuntimeService } from "./runtime.service";
import { ModelRuntimeException } from "./runtime.errors";
import type { AiModelRecord, ChatRequest } from "../types/runtime.types";

// ── helpers ───────────────────────────────────────────────────────────────────

let loggerLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  loggerLogSpy = vi
    .spyOn(Logger.prototype, "log")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  loggerLogSpy.mockRestore();
  delete process.env["MODEL_PLATFORM_SECRET_KEY"];
});

// Direct instantiation — constructor deps are unused by the methods under test.
/* eslint-disable @typescript-eslint/no-explicit-any */
const svc = new ModelRuntimeService(
  null as any,
  null as any,
  null as any,
  null as any,
);
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validate = (req: unknown): void => (svc as any).validateChatRequest(req);

const resolveKey = (model: AiModelRecord): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).resolveApiKey(model) as string;

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

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    tenantId: "tenant-1",
    modelCode: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

// ── validateChatRequest ───────────────────────────────────────────────────────

describe("validateChatRequest", () => {
  it("throws when tenantId is missing", () => {
    expect(() => validate({ ...makeRequest(), tenantId: "" })).toThrow(
      BadRequestException,
    );
  });

  it("throws when tenantId is whitespace", () => {
    expect(() => validate({ ...makeRequest(), tenantId: "   " })).toThrow(
      BadRequestException,
    );
  });

  it("throws when modelCode is missing", () => {
    expect(() => validate({ ...makeRequest(), modelCode: "" })).toThrow(
      BadRequestException,
    );
  });

  it("throws when modelCode is whitespace", () => {
    expect(() => validate({ ...makeRequest(), modelCode: "  " })).toThrow(
      BadRequestException,
    );
  });

  it("throws when applicationId is empty", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        applicationId: "",
        applicationType: "workflow",
      }),
    ).toThrow(BadRequestException);
  });

  it("throws when applicationId is provided without applicationType", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        applicationId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow(BadRequestException);
  });

  it("throws when applicationType is provided without applicationId or legacy agentId", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        applicationType: "workflow",
      }),
    ).toThrow(BadRequestException);
  });

  it("accepts legacy agentId without applicationType", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        agentId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).not.toThrow();
  });

  it("accepts explicit application scope", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        applicationId: "550e8400-e29b-41d4-a716-446655440001",
        applicationType: "api_client",
      }),
    ).not.toThrow();
  });

  it("throws when messages is an empty array", () => {
    expect(() => validate({ ...makeRequest(), messages: [] })).toThrow(
      BadRequestException,
    );
  });

  it("throws when a message has an invalid role", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        messages: [{ role: "bot", content: "hi" }],
      }),
    ).toThrow(BadRequestException);
  });

  it("throws when a user message has empty content", () => {
    expect(() =>
      validate({ ...makeRequest(), messages: [{ role: "user", content: "" }] }),
    ).toThrow(BadRequestException);
  });

  it("throws when a user message has whitespace-only content", () => {
    expect(() =>
      validate({
        ...makeRequest(),
        messages: [{ role: "user", content: "   " }],
      }),
    ).toThrow(BadRequestException);
  });

  it("accepts an assistant message with empty content when toolCalls are present", () => {
    const req = makeRequest({
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc-1", name: "get_weather", arguments: {} }],
        },
      ],
    });
    expect(() => validate(req)).not.toThrow();
  });

  it("does not throw for a well-formed request", () => {
    expect(() => validate(makeRequest())).not.toThrow();
  });

  it("does not throw for a multi-turn conversation", () => {
    const req = makeRequest({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "What is 2+2?" },
      ],
    });
    expect(() => validate(req)).not.toThrow();
  });
});

// ── resolveApiKey ─────────────────────────────────────────────────────────────

describe("resolveApiKey", () => {
  const savedEnv = process.env;

  beforeEach(() => {
    process.env = { ...savedEnv };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("returns empty string when config is null", () => {
    expect(resolveKey(makeModel({ config: null }))).toBe("");
  });

  it("returns empty string when config has no apiKeyEnvVar", () => {
    expect(resolveKey(makeModel({ config: { foo: "bar" } }))).toBe("");
  });

  it("returns empty string when apiKeyEnvVar is not a string", () => {
    expect(resolveKey(makeModel({ config: { apiKeyEnvVar: 42 } }))).toBe("");
  });

  it("returns empty string when apiKeyEnvVar is an empty string", () => {
    expect(resolveKey(makeModel({ config: { apiKeyEnvVar: "" } }))).toBe("");
  });

  it("returns the env var value when it is set", () => {
    process.env["TEST_API_KEY"] = "sk-test-123";
    expect(
      resolveKey(makeModel({ config: { apiKeyEnvVar: "TEST_API_KEY" } })),
    ).toBe("sk-test-123");
  });

  it("throws provider unavailable when env var is missing for a public provider", () => {
    delete process.env["MISSING_KEY"];
    expect(() =>
      resolveKey(
        makeModel({
          provider: "openai",
          config: { apiKeyEnvVar: "MISSING_KEY" },
        }),
      ),
    ).toThrow(ModelRuntimeException);
  });

  it("throws for doubao provider when env var is missing", () => {
    delete process.env["DOUBAO_KEY"];
    expect(() =>
      resolveKey(
        makeModel({
          provider: "doubao",
          config: { apiKeyEnvVar: "DOUBAO_KEY" },
        }),
      ),
    ).toThrow(ModelRuntimeException);
  });

  it('returns empty string for "private" provider when env var is missing (P1 regression guard)', () => {
    delete process.env["PRIVATE_KEY"];
    expect(
      resolveKey(
        makeModel({
          provider: "private",
          config: { apiKeyEnvVar: "PRIVATE_KEY" },
        }),
      ),
    ).toBe("");
  });

  it('returns empty string for "custom" provider when env var is missing (P1 regression guard)', () => {
    delete process.env["CUSTOM_KEY"];
    expect(
      resolveKey(
        makeModel({
          provider: "custom",
          config: { apiKeyEnvVar: "CUSTOM_KEY" },
        }),
      ),
    ).toBe("");
  });

  it('returns empty string for "self-hosted" provider when env var is missing (P1 regression guard)', () => {
    delete process.env["SELFHOSTED_KEY"];
    expect(
      resolveKey(
        makeModel({
          provider: "self-hosted",
          config: { apiKeyEnvVar: "SELFHOSTED_KEY" },
        }),
      ),
    ).toBe("");
  });
});

// ── runtime flow ─────────────────────────────────────────────────────────────

describe("ModelRuntimeService runtime flow", () => {
  function makeRuntime(
    overrides: {
      registry?: Record<string, unknown>;
      router?: Record<string, unknown>;
      quota?: Record<string, unknown>;
      metering?: Record<string, unknown>;
    } = {},
  ): {
    service: ModelRuntimeService;
    provider: { chat: ReturnType<typeof vi.fn> };
    fallbackProvider: { chat: ReturnType<typeof vi.fn> };
    quota: { assertAllowed: ReturnType<typeof vi.fn> };
    metering: { record: ReturnType<typeof vi.fn> };
  } {
    const primary = makeModel({
      modelCode: "primary-model",
      provider: "primary",
      endpointUrl: "https://primary.example/v1",
      config: { fallbackModelCodes: ["fallback-model"] },
    });
    const fallback = makeModel({
      id: "model-2",
      modelCode: "fallback-model",
      provider: "fallback",
      endpointUrl: "https://fallback.example/v1",
    });
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: "primary response",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      }),
    };
    const fallbackProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "fallback response",
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      }),
    };
    const registry = {
      getActiveModel: vi.fn((modelCode: string) => {
        if (modelCode === "primary-model") return Promise.resolve(primary);
        if (modelCode === "fallback-model") return Promise.resolve(fallback);
        return Promise.reject(
          new ModelRuntimeException(
            HttpStatus.NOT_FOUND,
            "MODEL_NOT_ROUTABLE",
            "missing model",
            { modelCode },
          ),
        );
      }),
      ...overrides.registry,
    };
    const router = {
      resolve: vi.fn((providerName: string) =>
        providerName === "fallback" ? fallbackProvider : provider,
      ),
      ...overrides.router,
    };
    const quota = {
      assertAllowed: vi.fn().mockResolvedValue({}),
      ...overrides.quota,
    };
    const metering = {
      record: vi.fn().mockResolvedValue(undefined),
      ...overrides.metering,
    };

    return {
      service: new ModelRuntimeService(
        registry as never,
        router as never,
        quota as never,
        metering as never,
      ),
      provider,
      fallbackProvider,
      quota,
      metering,
    };
  }

  it("throws grant denied before provider call", async () => {
    const { service, provider, metering } = makeRuntime({
      quota: {
        assertAllowed: vi
          .fn()
          .mockRejectedValue(
            new ModelRuntimeException(
              HttpStatus.FORBIDDEN,
              "GRANT_DENIED",
              "no grant",
            ),
          ),
      },
    });

    await expect(
      service.chat(makeRequest({ modelCode: "primary-model" })),
    ).rejects.toMatchObject({ code: "GRANT_DENIED" });
    expect(provider.chat).not.toHaveBeenCalled();
    expect(metering.record).not.toHaveBeenCalled();
  });

  it("throws quota exceeded before provider call", async () => {
    const { service, provider, metering } = makeRuntime({
      quota: {
        assertAllowed: vi
          .fn()
          .mockRejectedValue(
            new ModelRuntimeException(
              HttpStatus.FORBIDDEN,
              "QUOTA_EXCEEDED",
              "quota exhausted",
            ),
          ),
      },
    });

    await expect(
      service.chat(makeRequest({ modelCode: "primary-model" })),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(provider.chat).not.toHaveBeenCalled();
    expect(metering.record).not.toHaveBeenCalled();
  });

  it("falls back to configured model when primary provider fails", async () => {
    const { service, provider, fallbackProvider, metering } = makeRuntime();
    provider.chat.mockRejectedValueOnce(new Error("primary unavailable"));

    const response = await service.chat(
      makeRequest({
        modelCode: "primary-model",
        requestId: "request-1",
      }),
    );

    expect(provider.chat).toHaveBeenCalledTimes(1);
    expect(fallbackProvider.chat).toHaveBeenCalledTimes(1);
    expect(response.modelCode).toBe("fallback-model");
    expect(response.message.content).toBe("fallback response");
    expect(metering.record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-1",
        modelCode: "fallback-model",
      }),
    );
  });

  it("logs structured metadata without prompt or response content", async () => {
    const { service } = makeRuntime();

    await service.chat(
      makeRequest({
        modelCode: "primary-model",
        requestId: "request-observe-1",
        applicationId: "application-1",
        applicationType: "workflow",
        messages: [{ role: "user", content: "sensitive prompt content" }],
      }),
    );

    const serializedLogs = loggerLogSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join("\n");
    expect(serializedLogs).toContain('"request_id":"request-observe-1"');
    expect(serializedLogs).toContain('"tenant_id":"tenant-1"');
    expect(serializedLogs).toContain('"application_id":"application-1"');
    expect(serializedLogs).toContain('"application_type":"workflow"');
    expect(serializedLogs).toContain('"model_code":"primary-model"');
    expect(serializedLogs).not.toContain("sensitive prompt content");
    expect(serializedLogs).not.toContain("primary response");
  });

  it("does not log provider key reference or provider key value", async () => {
    process.env["MODEL_PLATFORM_SECRET_KEY"] = "secret-provider-key-value";
    const secretBackedModel = makeModel({
      modelCode: "primary-model",
      provider: "primary",
      endpointUrl: "https://primary.example/v1",
      config: { apiKeyEnvVar: "MODEL_PLATFORM_SECRET_KEY" },
    });
    const { service } = makeRuntime({
      registry: {
        getActiveModel: vi.fn(() => Promise.resolve(secretBackedModel)),
      },
    });

    await service.chat(
      makeRequest({
        modelCode: "primary-model",
        requestId: "request-secret-log-1",
      }),
    );

    const serializedLogs = loggerLogSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join("\n");
    expect(serializedLogs).toContain('"request_id":"request-secret-log-1"');
    expect(serializedLogs).not.toContain("MODEL_PLATFORM_SECRET_KEY");
    expect(serializedLogs).not.toContain("secret-provider-key-value");
  });

  it("does not write usage when all provider candidates fail", async () => {
    const { service, provider, fallbackProvider, metering } = makeRuntime();
    provider.chat.mockRejectedValueOnce(new Error("primary unavailable"));
    fallbackProvider.chat.mockRejectedValueOnce(new Error("fallback down"));

    await expect(
      service.chat(makeRequest({ modelCode: "primary-model" })),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(metering.record).not.toHaveBeenCalled();
  });
});
