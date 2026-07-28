import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";

import { ModelRuntimeService } from "./runtime.service";
import { ModelRegistryService } from "../registry/model-registry.service";
import { S2sAuthGuard } from "./guards/s2s-auth.guard";
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

// vxture-atlas#40: /v1/chat + /v1/models are additive aliases for the legacy
// /model-platform/chat + /model-platform/models paths - NOT a replacement.
// packages/ai/model-runtime-client (vxture-platform) hardcodes the legacy
// path and is varda's live production client (see TD-003a) - the legacy
// path stays until that client is coordinated-updated and released, per
// product_210_tool-protocol.md §4.3's deprecation-cycle rule. New consumers
// (e.g. karda) should prefer /v1/* for consistency with A1-A3.
@Controller(["model-platform", "v1"])
@UseGuards(S2sAuthGuard)
export class ModelRuntimeController {
  constructor(
    @Inject(ModelRuntimeService)
    private readonly runtime: ModelRuntimeService,
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
  ) {}

  @Post("chat")
  async chat(
    @Body() body: ChatRequest,
    @Res() res: ModelRuntimeResponse,
  ): Promise<void> {
    if (body.stream) {
      await this.streamChat(body, res);
      return;
    }
    const response = await this.runtime.chat(body);
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
      for await (const event of this.runtime.chatStream(body)) {
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
