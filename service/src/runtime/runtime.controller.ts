import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import { ModelRuntimeService } from "./runtime.service";
import { ModelRegistryService } from "../registry/model-registry.service";
import { S2sAuthGuard } from "./guards/s2s-auth.guard";
import type {
  S2sAuthContext,
  S2sAuthenticatedRequest,
} from "./guards/s2s-auth.guard";
import type {
  AiModelRecord,
  ApplicationType,
  ChatRequest,
  ChatResponse,
  StreamEvent,
} from "../types/runtime.types";

interface ModelSummary {
  modelCode: string;
  modelName: string;
  provider: string;
  protocol: string;
  capabilities: string[];
}

interface ModelRuntimeResponse {
  status(code: number): this;
  json(body: unknown): this;
  setHeader(name: string, value: string): this;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?: () => void;
}

// vxture-atlas#40/TD-013 (2026-07-28): /model-platform/chat|models retired,
// /v1 is now the only path. packages/ai/model-runtime-client
// (vxture-platform, varda's live client) still calls the old path as of this
// change - breaks until that repo updates, by explicit product decision (see
// TD-013 progress note) rather than a further deprecation-alias cycle.
@Controller("v1")
@UseGuards(S2sAuthGuard)
export class ModelRuntimeController {
  constructor(
    @Inject(ModelRuntimeService)
    private readonly runtime: ModelRuntimeService,
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
  ) {}

  // TD-017: attribution comes from `req.s2sAuth` (the verified token), never
  // from the body - product_210 rule 8 forbids trusting caller-supplied
  // org/workspace context, and a body field would be trivially spoofable.
  @Post("chat")
  async chat(
    @Body() body: ChatRequest,
    @Res() res: ModelRuntimeResponse,
    @Req() req: S2sAuthenticatedRequest,
  ): Promise<void> {
    if (body.stream) {
      await this.streamChat(body, res, req.s2sAuth);
      return;
    }
    const response = await this.runtime.chat(body, req.s2sAuth);
    res.json(response satisfies ChatResponse);
  }

  /**
   * Unfiltered when called without `tenantId` (existing behavior, unchanged -
   * ops/admin tooling). With `tenantId`, returns only the models that tenant/
   * application actually has an active grant for (docs/70-workplan tenant-
   * filtered "available models" list) instead of the full global catalog.
   */
  @Get("models")
  async listModels(
    @Query("tenantId") tenantId?: string,
    @Query("applicationId") applicationId?: string,
    @Query("applicationType") applicationType?: ApplicationType,
  ): Promise<ModelSummary[]> {
    const models = tenantId?.trim()
      ? await this.registry.listModelsForTenant({
          tenantId: tenantId.trim(),
          ...(applicationId?.trim()
            ? { applicationId: applicationId.trim() }
            : {}),
          ...(applicationType ? { applicationType } : {}),
        })
      : await this.registry.listActiveModels();
    return models.map(toModelSummary);
  }

  private async streamChat(
    body: ChatRequest,
    res: ModelRuntimeResponse,
    auth?: S2sAuthContext,
  ): Promise<void> {
    res.status(200);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    res.setHeader("x-accel-buffering", "no"); // 提示 Nginx 关闭缓冲
    res.flushHeaders?.();

    const writeEvent = (event: StreamEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.runtime.chatStream(body, auth)) {
        writeEvent(event);
      }
      res.write("data: [DONE]\n\n");
    } catch (error) {
      const structuredError = readStructuredError(error);
      writeEvent({
        type: "error",
        code: structuredError.code,
        message: structuredError.message,
      });
    } finally {
      res.end();
    }
  }
}

function readStructuredError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "object" && response !== null) {
      const payload = response as { code?: unknown; message?: unknown };
      return {
        code:
          typeof payload.code === "string"
            ? payload.code
            : "MODEL_RUNTIME_STREAM_FAILED",
        message:
          typeof payload.message === "string" ? payload.message : error.message,
      };
    }
  }

  return {
    code: "MODEL_RUNTIME_STREAM_FAILED",
    message:
      error instanceof Error ? error.message : "Model runtime streaming failed",
  };
}

function toModelSummary(model: AiModelRecord): ModelSummary {
  return {
    modelCode: model.modelCode,
    modelName: model.modelName,
    provider: model.provider,
    protocol: model.protocol,
    capabilities: model.capabilities,
  };
}
