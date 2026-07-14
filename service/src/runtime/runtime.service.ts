import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { metricsRegistry } from "./metrics.registry";
import { randomUUID } from "node:crypto";

import { ProviderHttpError } from "../providers/base.provider";
import { MeteringService } from "../metering/metering.service";
import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import { QuotaService } from "../quota/quota.service";
import { resolveApplicationScope } from "../quota/quota.service";
import { ModelRuntimeException } from "./runtime.errors";
import type { ModelRuntimeErrorResponse } from "./runtime.errors";
import type {
  AiModelRecord,
  ChatRequest,
  ChatResponse,
  StreamEvent,
  TokenUsage,
} from "../types/runtime.types";

@Injectable()
export class ModelRuntimeService {
  private readonly logger = new Logger(ModelRuntimeService.name);

  constructor(
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
    @Inject(ModelRouterService)
    private readonly router: ModelRouterService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
    @Inject(MeteringService)
    private readonly metering: MeteringService,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.validateChatRequest(request);

    const requestId = request.requestId?.trim() || randomUUID();
    const applicationScope = resolveApplicationScope(request);
    this.incrementInflightRequest();
    this.logRuntimeEvent("model_runtime_request_start", {
      request,
      requestId,
      applicationScope,
      modelCode: request.modelCode,
      status: "started",
      fallbackAttempt: 0,
    });

    try {
      let models: AiModelRecord[];
      try {
        models = await this.resolveCandidateModels(request.modelCode);
      } catch (error) {
        this.logRuntimeEvent("model_runtime_request_failed", {
          request,
          requestId,
          applicationScope,
          modelCode: request.modelCode,
          status: "provider_error",
          errorCode: readRuntimeErrorCode(error),
          fallbackAttempt: 0,
        });
        throw this.enrichRuntimeError(error, requestId, {
          modelCode: request.modelCode,
        });
      }
      let lastProviderError: ModelRuntimeException | undefined;

      for (const [fallbackAttempt, model] of models.entries()) {
        try {
          await this.quota.assertAllowed(model, request);
        } catch (error) {
          this.logRuntimeEvent("model_runtime_request_failed", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: runtimeStatusFromError(error),
            errorCode: readRuntimeErrorCode(error),
            fallbackAttempt,
          });
          throw this.enrichRuntimeError(error, requestId, {
            modelCode: model.modelCode,
            provider: model.provider,
          });
        }

        const startedAt = Date.now();

        try {
          const provider = this.router.resolve(model.provider, model.modelCode);
          const apiKey = this.resolveApiKey(model, requestId);
          this.logRuntimeEvent("model_runtime_provider_start", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: "started",
            fallbackAttempt,
          });
          const providerResponse = await provider.chat({
            endpointUrl: model.endpointUrl,
            apiKey,
            modelCode: model.modelCode,
            messages: request.messages,
            ...(request.temperature !== undefined
              ? { temperature: request.temperature }
              : {}),
            ...(request.maxTokens !== undefined
              ? { maxTokens: request.maxTokens }
              : {}),
            ...(request.topP !== undefined ? { topP: request.topP } : {}),
            ...(request.tools !== undefined ? { tools: request.tools } : {}),
            ...(request.toolChoice !== undefined
              ? { toolChoice: request.toolChoice }
              : {}),
            ...(model.config != null ? { config: model.config } : {}),
          });
          const latencyMs = Date.now() - startedAt;

          await this.recordUsage(
            model,
            request,
            requestId,
            providerResponse,
            latencyMs,
          );

          this.logRuntimeEvent("model_runtime_request_success", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: "success",
            latencyMs,
            fallbackAttempt,
            totalTokens: providerResponse.totalTokens,
          });

          return {
            id: requestId,
            modelCode: model.modelCode,
            message: {
              role: "assistant",
              content: providerResponse.content,
              ...(providerResponse.toolCalls !== undefined
                ? { toolCalls: providerResponse.toolCalls }
                : {}),
            },
            usage: {
              promptTokens: providerResponse.promptTokens,
              completionTokens: providerResponse.completionTokens,
              totalTokens: providerResponse.totalTokens,
            },
            latencyMs,
            ...(providerResponse.finishReason !== undefined
              ? { finishReason: providerResponse.finishReason }
              : {}),
          };
        } catch (error) {
          lastProviderError = this.toProviderUnavailableError(
            error,
            model,
            requestId,
          );
          this.logRuntimeEvent("model_runtime_provider_failed", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: "provider_error",
            latencyMs: Date.now() - startedAt,
            errorCode: lastProviderError.code,
            fallbackAttempt,
          });
        }
      }

      this.logRuntimeEvent("model_runtime_request_failed", {
        request,
        requestId,
        applicationScope,
        modelCode: request.modelCode,
        status: "provider_error",
        errorCode: lastProviderError?.code ?? "PROVIDER_UNAVAILABLE",
        fallbackAttempt: models.length,
      });

      throw (
        lastProviderError ??
        new ModelRuntimeException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVIDER_UNAVAILABLE",
          "No provider candidate completed the request",
          { requestId, modelCode: request.modelCode },
        )
      );
    } finally {
      this.incrementInflightRequest(-1);
    }
  }

  /**
   * 流式对话，返回 AsyncGenerator<StreamEvent>
   *
   * 控制器把每个 event 序列化为 SSE `data:` 行写回客户端。
   * 用量统计在流结束（done 事件）时写入。
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<StreamEvent> {
    this.validateChatRequest(request);

    const requestId = request.requestId?.trim() || randomUUID();
    const applicationScope = resolveApplicationScope(request);
    this.incrementInflightRequest();
    this.logRuntimeEvent("model_runtime_stream_start", {
      request,
      requestId,
      applicationScope,
      modelCode: request.modelCode,
      status: "started",
      fallbackAttempt: 0,
    });

    try {
      let candidateModels: AiModelRecord[];
      try {
        candidateModels = await this.resolveCandidateModels(request.modelCode);
      } catch (error) {
        this.logRuntimeEvent("model_runtime_stream_failed", {
          request,
          requestId,
          applicationScope,
          modelCode: request.modelCode,
          status: "provider_error",
          errorCode: readRuntimeErrorCode(error),
          fallbackAttempt: 0,
        });
        throw this.enrichRuntimeError(error, requestId, {
          modelCode: request.modelCode,
        });
      }

      const models = candidateModels.filter((model) => model.supportsStreaming);

      if (models.length === 0) {
        this.logRuntimeEvent("model_runtime_stream_failed", {
          request,
          requestId,
          applicationScope,
          modelCode: request.modelCode,
          status: "provider_error",
          errorCode: "MODEL_NOT_ROUTABLE",
          fallbackAttempt: 0,
        });
        throw new ModelRuntimeException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "MODEL_NOT_ROUTABLE",
          `AI model "${request.modelCode}" does not support streaming and has no streaming fallback`,
          { requestId, modelCode: request.modelCode },
        );
      }

      let lastUsage: TokenUsage | undefined;
      let lastProviderError: ModelRuntimeException | undefined;

      for (const [fallbackAttempt, model] of models.entries()) {
        try {
          await this.quota.assertAllowed(model, request);
        } catch (error) {
          this.logRuntimeEvent("model_runtime_stream_failed", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: runtimeStatusFromError(error),
            errorCode: readRuntimeErrorCode(error),
            fallbackAttempt,
          });
          throw this.enrichRuntimeError(error, requestId, {
            modelCode: model.modelCode,
            provider: model.provider,
          });
        }

        const startedAt = Date.now();
        lastUsage = undefined;

        try {
          const provider = this.router.resolve(model.provider, model.modelCode);
          const apiKey = this.resolveApiKey(model, requestId);
          this.logRuntimeEvent("model_runtime_provider_stream_start", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: "started",
            fallbackAttempt,
          });
          for await (const event of provider.chatStream({
            endpointUrl: model.endpointUrl,
            apiKey,
            modelCode: model.modelCode,
            messages: request.messages,
            ...(request.temperature !== undefined
              ? { temperature: request.temperature }
              : {}),
            ...(request.maxTokens !== undefined
              ? { maxTokens: request.maxTokens }
              : {}),
            ...(request.topP !== undefined ? { topP: request.topP } : {}),
            ...(request.tools !== undefined ? { tools: request.tools } : {}),
            ...(request.toolChoice !== undefined
              ? { toolChoice: request.toolChoice }
              : {}),
            ...(model.config != null ? { config: model.config } : {}),
          })) {
            if (event.type === "done" && event.usage) {
              lastUsage = event.usage;
            }
            yield event;
          }

          if (lastUsage) {
            const latencyMs = Date.now() - startedAt;
            await this.recordUsage(
              model,
              request,
              requestId,
              lastUsage,
              latencyMs,
            );
            this.logRuntimeEvent("model_runtime_stream_success", {
              request,
              requestId,
              applicationScope,
              modelCode: model.modelCode,
              providerCode: model.provider,
              status: "success",
              latencyMs,
              fallbackAttempt,
              totalTokens: lastUsage.totalTokens,
            });
          }

          return;
        } catch (error) {
          lastProviderError = this.toProviderUnavailableError(
            error,
            model,
            requestId,
          );
          this.logRuntimeEvent("model_runtime_provider_stream_failed", {
            request,
            requestId,
            applicationScope,
            modelCode: model.modelCode,
            providerCode: model.provider,
            status: "provider_error",
            latencyMs: Date.now() - startedAt,
            errorCode: lastProviderError.code,
            fallbackAttempt,
          });
        }
      }

      this.logRuntimeEvent("model_runtime_stream_failed", {
        request,
        requestId,
        applicationScope,
        modelCode: request.modelCode,
        status: "provider_error",
        errorCode: lastProviderError?.code ?? "PROVIDER_UNAVAILABLE",
        fallbackAttempt: models.length,
      });

      throw (
        lastProviderError ??
        new ModelRuntimeException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "PROVIDER_UNAVAILABLE",
          "No streaming provider candidate completed the request",
          { requestId, modelCode: request.modelCode },
        )
      );
    } finally {
      this.incrementInflightRequest(-1);
    }
  }

  private incrementInflightRequest(delta = 1): void {
    try {
      metricsRegistry.changeGauge("model_request_in_flight", delta);
    } catch (err) {
      this.logger.debug(`metrics update error: ${String(err)}`);
    }
  }

  private logRuntimeEvent(
    event: string,
    input: {
      /** request 含 prompt，日志序列化时必须显式排除。 */
      request: ChatRequest;
      requestId: string;
      applicationScope: ReturnType<typeof resolveApplicationScope>;
      modelCode: string;
      status: string;
      providerCode?: string;
      latencyMs?: number;
      errorCode?: string | null;
      fallbackAttempt: number;
      totalTokens?: number;
    },
  ): void {
    // 只构造允许运维关联的字段，避免 prompt 或 response 内容进入日志。
    const safeLog: Record<string, unknown> = {
      event,
      request_id: input.requestId,
      tenant_id: input.request.tenantId,
      application_id: input.applicationScope.applicationId,
      application_type: input.applicationScope.applicationType,
      model_code: input.modelCode,
      status: input.status,
      fallback_attempt: input.fallbackAttempt,
    };

    if (input.providerCode) safeLog["provider_code"] = input.providerCode;
    if (input.latencyMs !== undefined) safeLog["latency_ms"] = input.latencyMs;
    if (input.errorCode) safeLog["error_code"] = input.errorCode;
    if (input.totalTokens !== undefined)
      safeLog["total_tokens"] = input.totalTokens;

    // 输出 JSON 字符串，便于日志系统按字段解析。
    this.logger.log(JSON.stringify(safeLog));

    // 更新轻量指标（非阻塞）：失败指标、延迟与总量由事件状态驱动，尽量不影响主链路。
    try {
      metricsRegistry.incCounter("model_requests_total", {
        operation: event.includes("stream") ? "stream" : "chat",
        status: String(input.status),
        ...(input.providerCode ? { provider: input.providerCode } : {}),
      });
      if (input.latencyMs !== undefined) {
        metricsRegistry.observeHistogram(
          "model_request_latency_ms",
          Number(input.latencyMs),
          {
            ...(input.providerCode ? { provider: input.providerCode } : {}),
            operation: event.includes("stream") ? "stream" : "chat",
          },
        );
      }
      if (input.errorCode) {
        metricsRegistry.incCounter("model_request_errors_total", {
          code: String(input.errorCode),
          ...(input.providerCode ? { provider: input.providerCode } : {}),
        });
      }
    } catch (err) {
      // 指标写入不能影响模型调用主链路。
      this.logger.debug(`metrics update error: ${String(err)}`);
    }
  }

  private validateChatRequest(request: ChatRequest): void {
    if (typeof request.tenantId !== "string" || !request.tenantId.trim()) {
      throw new BadRequestException("tenantId is required");
    }

    if (typeof request.modelCode !== "string" || !request.modelCode.trim()) {
      throw new BadRequestException("modelCode is required");
    }

    const validApplicationTypes = new Set([
      "agent",
      "workflow",
      "api_client",
      "internal_service",
    ]);

    if (
      request.applicationType !== undefined &&
      !validApplicationTypes.has(request.applicationType)
    ) {
      throw new BadRequestException("applicationType is invalid");
    }

    if (request.applicationId !== undefined && !request.applicationId.trim()) {
      throw new BadRequestException("applicationId cannot be empty");
    }

    if (request.applicationId && !request.applicationType) {
      throw new BadRequestException(
        "applicationType is required when applicationId is provided",
      );
    }

    if (request.applicationType && !request.applicationId && !request.agentId) {
      throw new BadRequestException(
        "applicationId is required when applicationType is provided",
      );
    }

    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      throw new BadRequestException("messages cannot be empty");
    }

    const validRoles = new Set(["system", "user", "assistant", "tool"]);
    const invalidMessage = request.messages.some((message) => {
      if (!validRoles.has(message.role)) return true;
      if (typeof message.content !== "string") return true;
      // assistant 发起 tool_calls 时 content 允许为空字符串；其他角色必须非空
      if (message.role === "assistant" && message.toolCalls?.length)
        return false;
      return !message.content.trim();
    });

    if (invalidMessage) {
      throw new BadRequestException("messages contain invalid role or content");
    }
  }

  private resolveApiKey(model: AiModelRecord, requestId?: string): string {
    const config = model.config as Record<string, unknown> | null;
    const apiKeyEnvVar =
      typeof config?.["apiKeyEnvVar"] === "string"
        ? config["apiKeyEnvVar"]
        : "";

    if (!apiKeyEnvVar) {
      return "";
    }

    const apiKey = process.env[apiKeyEnvVar];

    if (
      !apiKey &&
      !["private", "custom", "self-hosted"].includes(model.provider)
    ) {
      throw new ModelRuntimeException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PROVIDER_UNAVAILABLE",
        `Missing API key environment variable "${apiKeyEnvVar}" for model "${model.modelCode}"`,
        {
          ...(requestId !== undefined ? { requestId } : {}),
          modelCode: model.modelCode,
          provider: model.provider,
        },
      );
    }

    return apiKey ?? "";
  }

  private async resolveCandidateModels(
    modelCode: string,
  ): Promise<AiModelRecord[]> {
    const primary = await this.registry.getActiveModel(modelCode);
    const fallbackCodes = readStringArrayConfig(
      primary.config,
      "fallbackModelCodes",
    ).filter((candidateCode) => candidateCode !== primary.modelCode);

    const fallbacks: AiModelRecord[] = [];
    for (const fallbackCode of fallbackCodes) {
      try {
        fallbacks.push(await this.registry.getActiveModel(fallbackCode));
      } catch {
        // fallback 配置错误不能阻断主模型调用；主模型失败后只尝试可用 fallback。
      }
    }

    return [primary, ...fallbacks];
  }

  private toProviderUnavailableError(
    error: unknown,
    model: AiModelRecord,
    requestId: string,
  ): ModelRuntimeException {
    if (error instanceof ModelRuntimeException) {
      return this.enrichRuntimeError(error, requestId, {
        modelCode: model.modelCode,
        provider: model.provider,
      });
    }

    const message =
      error instanceof ProviderHttpError
        ? `${model.provider} provider returned status ${error.status}`
        : error instanceof Error
          ? error.message
          : "Provider request failed";

    return new ModelRuntimeException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "PROVIDER_UNAVAILABLE",
      message,
      { requestId, modelCode: model.modelCode, provider: model.provider },
    );
  }

  private enrichRuntimeError(
    error: unknown,
    requestId: string,
    metadata: {
      modelCode?: string;
      provider?: string;
    } = {},
  ): ModelRuntimeException {
    if (!(error instanceof ModelRuntimeException)) {
      const message =
        error instanceof Error ? error.message : "Provider request failed";
      return new ModelRuntimeException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PROVIDER_UNAVAILABLE",
        message,
        { requestId, ...metadata },
      );
    }

    const response = error.getResponse();
    const payload =
      typeof response === "object" && response !== null
        ? (response as ModelRuntimeErrorResponse)
        : undefined;

    if (payload?.requestId) {
      return error;
    }

    return new ModelRuntimeException(
      error.getStatus(),
      error.code,
      error.message,
      {
        requestId,
        ...((payload?.modelCode ?? metadata.modelCode) !== undefined
          ? { modelCode: payload?.modelCode ?? metadata.modelCode }
          : {}),
        ...((payload?.provider ?? metadata.provider) !== undefined
          ? { provider: payload?.provider ?? metadata.provider }
          : {}),
      },
    );
  }

  private async recordUsage(
    model: AiModelRecord,
    request: ChatRequest,
    requestId: string,
    usage: TokenUsage,
    latencyMs: number,
  ): Promise<void> {
    const applicationScope = resolveApplicationScope(request);

    await this.metering.record({
      requestId,
      tenantId: request.tenantId,
      applicationId: applicationScope.applicationId,
      applicationType: applicationScope.applicationType,
      agentId: applicationScope.agentId,
      ...(request.userId !== undefined ? { userId: request.userId } : {}),
      ...(request.featureId !== undefined
        ? { featureId: request.featureId }
        : {}),
      ...(request.businessId !== undefined
        ? { businessId: request.businessId }
        : {}),
      ...(request.usageType !== undefined
        ? { usageType: request.usageType }
        : {}),
      modelCode: model.modelCode,
      usage,
      latencyMs,
    });
  }
}

function readStringArrayConfig(
  config: Record<string, unknown> | null,
  key: string,
): string[] {
  const value = config?.[key];
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readRuntimeErrorCode(error: unknown): string | null {
  if (error instanceof ModelRuntimeException) {
    return error.code;
  }

  return null;
}

function runtimeStatusFromError(error: unknown): string {
  const code = readRuntimeErrorCode(error);
  if (code === "GRANT_DENIED") return "denied";
  if (code === "QUOTA_EXCEEDED") return "quota_exceeded";
  return "provider_error";
}
