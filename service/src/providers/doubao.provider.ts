import { Injectable } from "@nestjs/common";

import { BaseProvider } from "./base.provider";
import {
  buildOpenAiCompatibleBody,
  normalizeOpenAiCompatibleResponse,
  resolveChatCompletionsEndpoint,
  streamOpenAiCompatibleChat,
} from "./openai-compatible";
import type { OpenAiCompatibleChatResponse } from "./openai-compatible.types";
import type {
  ProviderChatRequest,
  ProviderChatResponse,
  StreamEvent,
} from "../types/runtime.types";

/** Doubao (Volcengine Ark) - OpenAI-compatible chat completions API. */
@Injectable()
export class DoubaoProvider extends BaseProvider {
  readonly providerName = "doubao";

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const response = await this.postJson<OpenAiCompatibleChatResponse>(
      resolveChatCompletionsEndpoint(request.endpointUrl),
      { authorization: `Bearer ${request.apiKey}` },
      buildOpenAiCompatibleBody(request, false),
    );

    return normalizeOpenAiCompatibleResponse(this.providerName, response);
  }

  override async *chatStream(
    request: ProviderChatRequest,
  ): AsyncGenerator<StreamEvent> {
    yield* streamOpenAiCompatibleChat(this.providerName, request, {
      authorization: `Bearer ${request.apiKey}`,
    });
  }
}
