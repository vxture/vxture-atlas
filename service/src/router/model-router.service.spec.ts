import { describe, it, expect, beforeEach, vi } from "vitest";

import { ModelRouterService } from "./model-router.service";
import type { RoutableModel } from "./model-router.service";

// 只需要 providerName 用于断言"落到了哪个适配器"，不需要真实的 HTTP 行为。
function stub(name: string) {
  return { providerName: name } as never;
}

const openAiCompatible = stub("openai-compatible");
const claude = stub("claude");
const zhipu = stub("zhipu");
const doubao = stub("doubao");
const priv = stub("private");

function makeRouter() {
  const metrics = { incCounter: vi.fn() };
  const router = new ModelRouterService(
    openAiCompatible,
    claude,
    zhipu,
    doubao,
    priv,
    metrics as never,
  );
  return { router, metrics };
}

function model(overrides: Partial<RoutableModel> = {}): RoutableModel {
  return {
    provider: "deepseek",
    protocol: "openai-chat-completions",
    modelCode: "deepseek-chat",
    ...overrides,
  };
}

describe("ModelRouterService", () => {
  let router: ModelRouterService;
  let metrics: { incCounter: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ router, metrics } = makeRouter());
  });

  describe("protocol dispatch (the normal path)", () => {
    it("routes an unregistered provider by protocol alone - no code needed to onboard", () => {
      // 这条用例就是整个改造的目的：deepseek 在代码里不存在，仅凭一条
      // protocol=openai-chat-completions 的注册表记录就能路由。
      expect(router.resolve(model())).toBe(openAiCompatible);
      expect(metrics.incCounter).not.toHaveBeenCalled();
    });

    it("routes anthropic-messages to the Claude adapter", () => {
      expect(
        router.resolve(
          model({ provider: "whoever", protocol: "anthropic-messages" }),
        ),
      ).toBe(claude);
    });

    it.each([
      ["openai", openAiCompatible],
      ["openai-compatible", openAiCompatible],
      ["chat-completions", openAiCompatible],
      ["anthropic", claude],
      ["claude", claude],
      ["messages", claude],
    ])("normalizes the legacy alias %s", (protocol, expected) => {
      expect(router.resolve(model({ provider: "whoever", protocol }))).toBe(
        expected,
      );
      expect(metrics.incCounter).not.toHaveBeenCalled();
    });

    it.each(["  OpenAI  ", "OPENAI_CHAT_COMPLETIONS", "Openai-Compatible"])(
      "is insensitive to case, whitespace and underscores: %s",
      (protocol) => {
        expect(router.resolve(model({ provider: "whoever", protocol }))).toBe(
          openAiCompatible,
        );
      },
    );
  });

  describe("specialization layer", () => {
    it("routes zhipu to its own adapter, which adds embed/rerank on top of the protocol", () => {
      expect(
        router.resolve(
          model({ provider: "zhipu", protocol: "openai-chat-completions" }),
        ),
      ).toBe(zhipu);
    });

    it("wins over the protocol layer", () => {
      // 即使 protocol 指向通用适配器，zhipu 也必须拿到特例适配器，否则
      // embed/rerank 会退化成 not-implemented。
      expect(router.resolve(model({ provider: "zhipu", protocol: "openai" }))).toBe(
        zhipu,
      );
    });
  });

  describe("legacy fallback layer", () => {
    it("falls back to provider_code and counts it when the protocol is unrecognised", () => {
      const resolved = router.resolve(
        model({ provider: "doubao", protocol: "some-legacy-value" }),
      );

      expect(resolved).toBe(doubao);
      expect(metrics.incCounter).toHaveBeenCalledWith(
        "model_router_protocol_fallback_total",
        { provider: "doubao" },
      );
    });

    it.each(["", "   "])("falls back for an empty protocol (%s)", (protocol) => {
      expect(router.resolve(model({ provider: "private", protocol }))).toBe(priv);
      expect(metrics.incCounter).toHaveBeenCalledOnce();
    });

    it.each(["custom", "self-hosted"])(
      "keeps the legacy alias %s pointing at the private adapter",
      (provider) => {
        expect(router.resolve(model({ provider, protocol: "junk" }))).toBe(priv);
      },
    );
  });

  describe("unroutable", () => {
    it("throws MODEL_NOT_ROUTABLE when neither protocol nor provider is known", () => {
      expect(() =>
        router.resolve(
          model({ provider: "nobody", protocol: "nothing", modelCode: "m-1" }),
        ),
      ).toThrowError(/not routable/);
    });

    it("does not count an unroutable model as a fallback", () => {
      // 回退计数是"有一行数据待修正"的信号；彻底路由不到是另一回事，
      // 混在一起会让 P3 的归零判据永远无法达成。
      expect(() =>
        router.resolve(model({ provider: "nobody", protocol: "nothing" })),
      ).toThrow();
      expect(metrics.incCounter).not.toHaveBeenCalled();
    });

    it("names both the protocol and the provider in the message", () => {
      expect(() =>
        router.resolve(
          model({ provider: "nobody", protocol: "nothing", modelCode: "m-1" }),
        ),
      ).toThrowError(/m-1.*nothing.*nobody/);
    });
  });

  describe("the inventory's actual rows (design doc section 8)", () => {
    it.each([
      ["claude-sonnet-4", "anthropic", "anthropic", claude],
      ["doubao-pro-32k", "doubao", "openai", openAiCompatible],
      // 改造前这一行会落到 DoubaoProvider，因为硬编码 Map 把 "openai"
      // 指向了豆包 - 能跑通纯属两者同方言的巧合。
      ["gpt-4o", "openai", "openai", openAiCompatible],
    ])("routes %s without hitting the fallback layer", (
      modelCode,
      provider,
      protocol,
      expected,
    ) => {
      expect(router.resolve({ modelCode, provider, protocol })).toBe(expected);
      expect(metrics.incCounter).not.toHaveBeenCalled();
    });
  });
});
