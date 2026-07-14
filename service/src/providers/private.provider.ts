import { Injectable } from "@nestjs/common";

import { BaseProvider } from "./base.provider";
import {
  buildOpenAiCompatibleBody,
  normalizeOpenAiCompatibleResponse,
  resolveChatCompletionsEndpoint,
} from "./doubao.provider";
import type { OpenAiCompatibleChatResponse } from "./openai-compatible.types";
import type {
  ProviderChatRequest,
  ProviderChatResponse,
} from "../types/runtime.types";

@Injectable()
export class PrivateModelProvider extends BaseProvider {
  readonly providerName = "private";

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const headers: Record<string, string> = {};

    if (request.apiKey) {
      headers.authorization = `Bearer ${request.apiKey}`;
    }

    const response = await this.postJson<OpenAiCompatibleChatResponse>(
      resolveChatCompletionsEndpoint(request.endpointUrl),
      headers,
      buildOpenAiCompatibleBody(request, false),
    );

    return normalizeOpenAiCompatibleResponse(this.providerName, response);
  }
}
