import { Injectable } from "@nestjs/common";

import { BaseProvider, ProviderHttpError, joinEndpoint } from "./base.provider";
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
  ProviderEmbedRequest,
  ProviderEmbedResponse,
  ProviderRerankRequest,
  ProviderRerankResponse,
  StreamEvent,
} from "../types/runtime.types";

/**
 * https://docs.bigmodel.cn/api-reference/模型-api/文本嵌入
 * `data` is index-ordered to match the input `input` array 1:1 (no explicit
 * correlation id in Zhipu's response - order is the contract).
 */
interface ZhipuEmbeddingResponse {
  model: string;
  object: "list";
  data: Array<{ index: number; object: "embedding"; embedding: number[] }>;
}

/** https://docs.bigmodel.cn/api-reference/模型-api/文本重排序 */
interface ZhipuRerankResponse {
  id: string;
  results: Array<{ index: number; relevance_score: number; document?: string }>;
}

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

  /**
   * A1 embedding - real Zhipu Embedding-3/Embedding-2 API. `modelCode` is
   * passed straight through as Zhipu's `model` field (must be a literal
   * `embedding-3`/`embedding-2`, per TD-012 - no provider-code prefix).
   */
  override async embed(
    request: ProviderEmbedRequest,
  ): Promise<ProviderEmbedResponse> {
    const response = await this.postJson<ZhipuEmbeddingResponse>(
      joinEndpoint(request.endpointUrl, "embeddings"),
      { authorization: `Bearer ${request.apiKey}` },
      { model: request.modelCode, input: request.texts },
    );

    // Response `data` is documented index-ordered, but sort defensively
    // rather than trust it blindly - a caller depends on vectors lining up
    // 1:1 with `texts`.
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    return {
      modelVersion: response.model,
      dimension: vectors[0]?.length ?? 0,
      vectors,
    };
  }

  /**
   * A3 rerank - real Zhipu rerank API. Zhipu's `documents` param is bare
   * strings with no caller-supplied id - correlate `results[].index` back to
   * `request.candidates[index].id` ourselves.
   */
  override async rerank(
    request: ProviderRerankRequest,
  ): Promise<ProviderRerankResponse> {
    const response = await this.postJson<ZhipuRerankResponse>(
      joinEndpoint(request.endpointUrl, "rerank"),
      { authorization: `Bearer ${request.apiKey}` },
      {
        model: request.modelCode,
        query: request.query,
        documents: request.candidates.map((candidate) => candidate.text),
      },
    );

    return {
      scores: response.results.map((result) => ({
        id: request.candidates[result.index]?.id ?? String(result.index),
        score: result.relevance_score,
      })),
    };
  }
}
