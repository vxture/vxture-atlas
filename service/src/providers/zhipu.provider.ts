import { Injectable } from "@nestjs/common";

import { BaseProvider, ProviderHttpError } from "./base.provider";
import {
  buildOpenAiCompatibleBody,
  normalizeOpenAiCompatibleResponse,
  parseOpenAiCompatibleStream,
  resolveChatCompletionsEndpoint,
  safeReadText,
} from "./doubao.provider";
import type { OpenAiCompatibleChatResponse } from "./openai-compatible.types";
import type {
  ProviderChatRequest,
  ProviderChatResponse,
  StreamEvent,
} from "../types/runtime.types";

/** Zhipu (BigModel) - OpenAI-compatible chat completions API. */
@Injectable()
export class ZhipuProvider extends BaseProvider {
  readonly providerName = "zhipu";

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const response = await this.postJson<OpenAiCompatibleChatResponse>(
      resolveChatCompletionsEndpoint(request.endpointUrl),
      {
        authorization: `Bearer ${request.apiKey}`,
      },
      buildOpenAiCompatibleBody(request, false),
    );

    return normalizeOpenAiCompatibleResponse(this.providerName, response);
  }

  async *chatStream(request: ProviderChatRequest): AsyncGenerator<StreamEvent> {
    const response = await fetch(
      resolveChatCompletionsEndpoint(request.endpointUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${request.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiCompatibleBody(request, true)),
      },
    );

    if (!response.ok) {
      const errorBody = await safeReadText(response);
      throw new ProviderHttpError(
        `${this.providerName} stream request failed with status ${response.status}`,
        response.status,
        this.providerName,
        errorBody,
      );
    }
    if (!response.body) {
      throw new Error(`${this.providerName} returned empty stream body`);
    }

    yield* parseOpenAiCompatibleStream(response.body);
  }
}
