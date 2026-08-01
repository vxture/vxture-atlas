import { describe, it, expect, vi, beforeEach } from "vitest";

import { ModelProbeService } from "./model-probe.service";
import { ModelAdminException } from "./model-admin.errors";
import { COMMERCE_SENTINEL_UUID } from "../quota/quota.service";
import type { AiModelRecord } from "../types/runtime.types";

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: "prov-1",
    modelCode: "deepseek-chat",
    modelName: "DeepSeek Chat",
    provider: "deepseek",
    endpointUrl: "https://api.deepseek.com/v1",
    protocol: "openai-chat-completions",
    modelType: "chat",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: ["chat"],
    supportsStreaming: true,
    isActive: true,
    sort: 999,
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

async function* streamOf(usage?: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}) {
  yield { type: "text", delta: "pong" };
  yield usage ? { type: "done", usage } : { type: "done" };
}

function build(
  overrides: {
    model?: AiModelRecord | null;
    chat?: ReturnType<typeof vi.fn>;
    chatStream?: ReturnType<typeof vi.fn>;
    resolveKey?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const model = overrides.model === undefined ? makeModel() : overrides.model;

  const provider = {
    providerName: "openai-compatible",
    chat:
      overrides.chat ??
      vi.fn().mockResolvedValue({
        content: "pong",
        promptTokens: 3,
        completionTokens: 1,
        totalTokens: 4,
      }),
    chatStream:
      overrides.chatStream ??
      vi.fn(() =>
        streamOf({ promptTokens: 3, completionTokens: 1, totalTokens: 4 }),
      ),
  };

  const repository = { findModelById: vi.fn().mockResolvedValue(model) };
  const router = { resolve: vi.fn().mockReturnValue(provider) };
  const providerKeys = {
    resolveKey: overrides.resolveKey ?? vi.fn().mockResolvedValue("sk-test"),
  };
  const requestLog = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new ModelProbeService(
    repository as never,
    router as never,
    providerKeys as never,
    requestLog as never,
  );

  return { service, provider, repository, router, requestLog };
}

describe("ModelProbeService", () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it("runs both a non-streaming and a streaming check", async () => {
    const result = await ctx.service.probe("model-1");

    expect(result.checks.map((c) => c.mode)).toEqual(["chat", "stream"]);
    expect(result.ok).toBe(true);
  });

  it("skips the streaming check for a model that does not support it", async () => {
    const local = build({ model: makeModel({ supportsStreaming: false }) });
    const result = await local.service.probe("model-1");

    expect(result.checks.map((c) => c.mode)).toEqual(["chat"]);
    expect(local.provider.chatStream).not.toHaveBeenCalled();
  });

  it("reports the resolved adapter, protocol and effective wire descriptor", async () => {
    // 运营核对"我配的到底生效了没有"，靠的就是这三个字段。
    const local = build({
      model: makeModel({
        providerConfig: { wire: { streamUsage: "none" } },
        config: { wire: { chatPath: "/v1/chat" } },
      }),
    });

    const result = await local.service.probe("model-1");

    expect(result.adapter).toBe("openai-compatible");
    expect(result.resolvedProtocol).toBe("openai-chat-completions");
    expect(result.wire.streamUsage).toBe("none");
    expect(result.wire.chatPath).toBe("/v1/chat");
  });

  it("flags a legacy protocol value as still resolvable", async () => {
    const local = build({ model: makeModel({ protocol: "openai" }) });
    const result = await local.service.probe("model-1");

    expect(result.protocol).toBe("openai");
    expect(result.resolvedProtocol).toBe("openai-chat-completions");
  });

  it("reports resolvedProtocol as null when the value is unroutable", async () => {
    // 说明这次调用是靠 provider_code 回退层落地的 - 一条待修正的数据。
    const local = build({ model: makeModel({ protocol: "legacy-junk" }) });
    const result = await local.service.probe("model-1");

    expect(result.resolvedProtocol).toBeNull();
  });

  describe("usage reporting - the point of the probe", () => {
    it("reports usageReported=false when a stream returns no usage", async () => {
      // 这正是 TD-017 要抓的：调用成功，但不会被计量。
      const local = build({ chatStream: vi.fn(() => streamOf(undefined)) });
      const result = await local.service.probe("model-1");

      const stream = result.checks.find((c) => c.mode === "stream");
      expect(stream?.ok).toBe(true);
      expect(stream?.usageReported).toBe(false);
    });

    it("does not treat missing usage as a failed check", async () => {
      // 上游可能就是不支持回 usage - 那是要被看见的事实，不是错误。
      const local = build({ chatStream: vi.fn(() => streamOf(undefined)) });
      const result = await local.service.probe("model-1");

      expect(result.ok).toBe(true);
    });

    it("reports usageReported=true when usage arrives", async () => {
      const result = await ctx.service.probe("model-1");
      expect(result.checks.every((c) => c.usageReported)).toBe(true);
    });
  });

  describe("failure handling", () => {
    it("reports a failed check without failing the whole probe call", async () => {
      const local = build({
        chat: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      });

      const result = await local.service.probe("model-1");
      const chat = result.checks.find((c) => c.mode === "chat");

      expect(chat?.ok).toBe(false);
      expect(chat?.error?.message).toContain("ECONNREFUSED");
      expect(result.ok).toBe(false);
      // 一条腿断了，另一条仍要跑完 - 运营需要完整画面。
      expect(result.checks).toHaveLength(2);
    });

    it("reports keyResolved=false instead of throwing when the key is missing", async () => {
      const local = build({
        resolveKey: vi.fn().mockRejectedValue(new Error("vault unavailable")),
      });

      const result = await local.service.probe("model-1");
      expect(result.keyResolved).toBe(false);
    });

    it("404s for an unknown model", async () => {
      const local = build({ model: null });
      await expect(local.service.probe("nope")).rejects.toBeInstanceOf(
        ModelAdminException,
      );
    });
  });

  describe("attribution - platform, never a tenant", () => {
    it("logs against the all-zero sentinel with usage_type=test", async () => {
      await ctx.service.probe("model-1");

      expect(ctx.requestLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: COMMERCE_SENTINEL_UUID,
          workspaceId: COMMERCE_SENTINEL_UUID,
          usageType: "test",
          modelCode: "deepseek-chat",
          providerCode: "deepseek",
        }),
      );
    });

    it("uses a distinguishable requestId prefix", async () => {
      const result = await ctx.service.probe("model-1");
      expect(result.requestId).toMatch(/^probe-/);
    });

    it("records the probe even when it failed", async () => {
      const local = build({
        chat: vi.fn().mockRejectedValue(new Error("boom")),
      });

      await local.service.probe("model-1");
      expect(local.requestLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ status: "error", usageType: "test" }),
      );
    });
  });

  it("caps the probe request so a self-check cannot cost real money", async () => {
    await ctx.service.probe("model-1");

    expect(ctx.provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 16, temperature: 0 }),
    );
  });
});
