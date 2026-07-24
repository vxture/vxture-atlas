import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Res,
} from "@nestjs/common";

import { ModelRuntimeService } from "./runtime.service";
import { ModelRegistryService } from "../registry/model-registry.service";
import type {
  AiModelRecord,
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

@Controller("model-platform")
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

  @Get("models")
  async listModels(): Promise<ModelSummary[]> {
    const models = await this.registry.listActiveModels();
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
