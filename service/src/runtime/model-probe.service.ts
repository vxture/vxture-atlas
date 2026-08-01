import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { ProviderKeyService } from "../provider-keys/provider-key.service";
import { OPENAI_WIRE_DEFAULTS, resolveWire } from "../providers/wire";
import type { ResolvedWire } from "../providers/wire";
import { ANTHROPIC_WIRE_DEFAULTS } from "../providers/wire";
import { normalizeProtocol } from "../providers/protocol";
import { COMMERCE_SENTINEL_UUID } from "../quota/quota.service";
import { ModelRegistryRepository } from "../registry/model-registry.repository";
import { RequestLogService } from "../reqlog/request-log.service";
import { ModelRouterService } from "../router/model-router.service";
import { ModelAdminException } from "./model-admin.errors";
import { resolveApiKey } from "./resolve-api-key";
import type {
  AiModelRecord,
  ProviderChatRequest,
  TokenUsage,
} from "../types/runtime.types";

/**
 * 连通性自检（docs/30-design/100-model-onboarding-and-protocol-adapters.md §10）。
 *
 * 没有它，运营在管理页面配完一个模型只能上生产流量才知道配没配对；有了它，
 * `config.wire` 配错在保存时就能发现。这是"纯页面接入"能否成立的关键一环。
 *
 * **用量归平台，不属于任何租户**（owner 决策 2026-08-01）：这是 Atlas 自己的
 * 运维行为，不是任何租户的业务行为，不能出现在任何租户的用量视图里。因此
 * `usage_type='test'`、租户/工作区用全零哨兵、**不扣配额、不上报平台计量内核**。
 */

/** 自检请求的上限：足够验证连通，不足以产生有意义的花费。 */
const PROBE_MAX_TOKENS = 16;
const PROBE_TIMEOUT_MS = 20_000;
const PROBE_PROMPT = "ping";

export type ProbeMode = "chat" | "stream";

export interface ModelProbeCheck {
  mode: ProbeMode;
  ok: boolean;
  latencyMs: number;
  /**
   * 上游有没有回 usage。**这是本自检最有价值的一条**：`runtime.service` 只在
   * usage 到达时才写计量行，所以 `usageReported: false` 意味着这个模型的调用
   * 会静默漏计量（TD-017）。对流式而言，它同时验证了 `wire.streamUsage` 配得
   * 对不对。
   */
  usageReported: boolean;
  totalTokens: number | null;
  error?: { code: string; message: string };
}

export interface ModelProbeResult {
  requestId: string;
  modelId: string;
  modelCode: string;
  provider: string;
  /** 注册表里存的原值。 */
  protocol: string;
  /** 归一化后的分发键；`null` 表示走了 provider_code 回退层。 */
  resolvedProtocol: string | null;
  adapter: string;
  endpointUrl: string;
  keyResolved: boolean;
  /** 本次实际生效的合并后描述符 —— 运营核对"我配的到底生效了没有"。 */
  wire: ResolvedWire;
  checks: ModelProbeCheck[];
  ok: boolean;
}

@Injectable()
export class ModelProbeService {
  private readonly logger = new Logger(ModelProbeService.name);

  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
    @Inject(ModelRouterService)
    private readonly router: ModelRouterService,
    @Inject(ProviderKeyService)
    private readonly providerKeys: ProviderKeyService,
    @Inject(RequestLogService)
    private readonly requestLog: RequestLogService,
  ) {}

  async probe(modelId: string): Promise<ModelProbeResult> {
    const model = await this.repository.findModelById(modelId);
    if (!model) {
      throw new ModelAdminException(
        HttpStatus.NOT_FOUND,
        "MODEL_ADMIN_MODEL_NOT_FOUND",
        `model ${modelId} not found`,
        { modelId },
      );
    }

    const requestId = `probe-${randomUUID()}`;
    // 这里有意不经过 quota.assertAllowed - 自检不属于任何租户，扣谁的额度都不对。
    const provider = this.router.resolve(model);
    const apiKey = await this.resolveKeyQuietly(model, requestId);

    const request = buildProbeRequest(model, apiKey);
    const checks: ModelProbeCheck[] = [
      await this.runChat(provider, request),
    ];

    if (model.supportsStreaming) {
      checks.push(await this.runStream(provider, request));
    }

    const result: ModelProbeResult = {
      requestId,
      modelId: model.id,
      modelCode: model.modelCode,
      provider: model.provider,
      protocol: model.protocol,
      resolvedProtocol: normalizeProtocol(model.protocol) ?? null,
      adapter: provider.providerName,
      endpointUrl: model.endpointUrl,
      keyResolved: apiKey.length > 0,
      wire: resolveWireFor(model),
      checks,
      ok: checks.every((check) => check.ok),
    };

    await this.recordProbe(model, requestId, result);
    return result;
  }

  private async runChat(
    provider: { chat: (r: ProviderChatRequest) => Promise<TokenUsage> },
    request: ProviderChatRequest,
  ): Promise<ModelProbeCheck> {
    const startedAt = Date.now();
    try {
      const response = await withTimeout(provider.chat(request));
      const total = response.totalTokens ?? 0;
      return {
        mode: "chat",
        ok: true,
        latencyMs: Date.now() - startedAt,
        usageReported: total > 0,
        totalTokens: total,
      };
    } catch (error) {
      return failedCheck("chat", Date.now() - startedAt, error);
    }
  }

  private async runStream(
    provider: {
      chatStream: (r: ProviderChatRequest) => AsyncGenerator<{
        type: string;
        usage?: TokenUsage;
      }>;
    },
    request: ProviderChatRequest,
  ): Promise<ModelProbeCheck> {
    const startedAt = Date.now();
    try {
      const usage = await withTimeout(collectStreamUsage(provider, request));
      const total = usage?.totalTokens ?? 0;
      return {
        mode: "stream",
        ok: true,
        latencyMs: Date.now() - startedAt,
        // 流式没回 usage 不算失败 —— 上游可能就是不支持。但它是一个必须被
        // 看见的信号：这个模型的流式调用不会被计量。
        usageReported: total > 0,
        totalTokens: usage ? total : null,
      };
    } catch (error) {
      return failedCheck("stream", Date.now() - startedAt, error);
    }
  }

  private async resolveKeyQuietly(
    model: AiModelRecord,
    requestId: string,
  ): Promise<string> {
    try {
      return await resolveApiKey(
        {
          resolveManagedKey: (providerCode, keyAlias) =>
            this.providerKeys.resolveKey(providerCode, keyAlias),
        },
        model,
        requestId,
      );
    } catch (error) {
      // 密钥解析失败本身就是自检要报告的结论之一，不该让整个自检 500。
      this.logger.warn(
        `probe ${requestId}: key resolution failed - ${errorMessage(error)}`,
      );
      return "";
    }
  }

  /**
   * 写 `reqlog.request_records`，归属平台哨兵。不调 MeteringService，也不上报
   * 平台计量内核 —— 自检消耗的 token 是 Atlas 的运维成本，不是任何人的账单。
   */
  private async recordProbe(
    model: AiModelRecord,
    requestId: string,
    result: ModelProbeResult,
  ): Promise<void> {
    const totals = result.checks.reduce(
      (sum, check) => sum + (check.totalTokens ?? 0),
      0,
    );

    await this.requestLog.record({
      requestId,
      status: result.ok ? "success" : "error",
      tenantId: COMMERCE_SENTINEL_UUID,
      workspaceId: COMMERCE_SENTINEL_UUID,
      modelCode: model.modelCode,
      providerCode: model.provider,
      totalTokens: totals,
      latencyMs: result.checks.reduce((sum, c) => sum + c.latencyMs, 0),
      usageType: "test",
    });
  }
}

function buildProbeRequest(
  model: AiModelRecord,
  apiKey: string,
): ProviderChatRequest {
  return {
    endpointUrl: model.endpointUrl,
    apiKey,
    modelCode: model.modelCode,
    messages: [{ role: "user", content: PROBE_PROMPT }],
    maxTokens: PROBE_MAX_TOKENS,
    temperature: 0,
    ...(model.config != null ? { config: model.config } : {}),
    ...(model.providerConfig != null
      ? { providerConfig: model.providerConfig }
      : {}),
  };
}

function resolveWireFor(model: AiModelRecord): ResolvedWire {
  const defaults =
    normalizeProtocol(model.protocol) === "anthropic-messages"
      ? ANTHROPIC_WIRE_DEFAULTS
      : OPENAI_WIRE_DEFAULTS;

  return resolveWire(defaults, model.providerConfig, model.config);
}

async function collectStreamUsage(
  provider: {
    chatStream: (r: ProviderChatRequest) => AsyncGenerator<{
      type: string;
      usage?: TokenUsage;
    }>;
  },
  request: ProviderChatRequest,
): Promise<TokenUsage | undefined> {
  let usage: TokenUsage | undefined;

  for await (const event of provider.chatStream(request)) {
    if (event.type === "done" && event.usage) {
      usage = event.usage;
    }
  }

  return usage;
}

/**
 * 上游挂住时给自检一个上界。注意它不会取消底层 fetch —— provider 适配器目前
 * 没有 AbortSignal 通路，这里只保证管理面不会被一个卡死的上游拖住。
 */
function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`probe timed out after ${PROBE_TIMEOUT_MS}ms`)),
        PROBE_TIMEOUT_MS,
      ).unref(),
    ),
  ]);
}

function failedCheck(
  mode: ProbeMode,
  latencyMs: number,
  error: unknown,
): ModelProbeCheck {
  return {
    mode,
    ok: false,
    latencyMs,
    usageReported: false,
    totalTokens: null,
    error: {
      code: errorCode(error),
      message: errorMessage(error),
    },
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    return `HTTP_${String((error as { status: unknown }).status)}`;
  }
  return "PROBE_FAILED";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
