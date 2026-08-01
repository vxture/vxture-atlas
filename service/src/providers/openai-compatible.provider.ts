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
 * `openai-chat-completions` 协议的适配器。
 *
 * 它服务于**所有**讲这套方言的上游 —— doubao、zhipu、deepseek、通义、
 * moonshot、siliconflow、vLLM、Ollama 的 OpenAI shim、任何 OpenAI 兼容网关。
 * 接入其中任何一家不需要新的子类，只需要一条注册表记录把 `protocol` 设成
 * `openai-chat-completions`（设计文档 §5）。
 *
 * 子类只在一种情况下存在：这家上游在本协议之外**还多支持了别的能力**
 * （如智谱的 embed/rerank）。仅仅是参数或端点不同，属于 `config.wire` 的
 * 数据范畴，不是子类的理由。
 */
@Injectable()
export class OpenAiCompatibleProvider extends BaseProvider {
  readonly providerName: string = "openai-compatible";

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

/**
 * 无 key 时不下发 Authorization 头 —— 内网自建端点（vLLM / Ollama）通常没有
 * bearer 鉴权，发一个 `Bearer undefined` 会被部分网关判成非法凭据而 401。
 */
function authHeaders(request: ProviderChatRequest): Record<string, string> {
  return request.apiKey ? { authorization: `Bearer ${request.apiKey}` } : {};
}
