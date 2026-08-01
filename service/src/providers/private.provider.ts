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

/**
 * Self-hosted / private models behind an OpenAI-compatible endpoint
 * (vLLM, Ollama's OpenAI shim, an in-house gateway). `apiKey` is optional -
 * a tailnet-internal endpoint often carries no bearer auth at all.
 */
@Injectable()
export class PrivateModelProvider extends BaseProvider {
  readonly providerName = "private";

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const response = await this.postJson<OpenAiCompatibleChatResponse>(
      resolveChatCompletionsEndpoint(request.endpointUrl),
      authHeaders(request),
      buildOpenAiCompatibleBody(request, false),
    );

    return normalizeOpenAiCompatibleResponse(this.providerName, response);
  }

  override async *chatStream(
    request: ProviderChatRequest,
  ): AsyncGenerator<StreamEvent> {
    yield* streamOpenAiCompatibleChat(
      this.providerName,
      request,
      authHeaders(request),
    );
  }
}

function authHeaders(request: ProviderChatRequest): Record<string, string> {
  return request.apiKey ? { authorization: `Bearer ${request.apiKey}` } : {};
}
