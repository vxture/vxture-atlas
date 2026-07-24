import type {
  IModelProvider,
  ProviderChatRequest,
  ProviderChatResponse,
  ProviderEmbedRequest,
  ProviderEmbedResponse,
  ProviderParseRequest,
  ProviderParseResponse,
  ProviderRerankRequest,
  ProviderRerankResponse,
  StreamEvent,
} from "../types/runtime.types";

export class ProviderCapabilityNotImplementedError extends Error {
  constructor(
    readonly providerName: string,
    readonly capability: "embed" | "rerank" | "parseDocument",
  ) {
    super(`${providerName} does not implement ${capability} yet`);
    this.name = "ProviderCapabilityNotImplementedError";
  }
}

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: string,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export abstract class BaseProvider implements IModelProvider {
  abstract readonly providerName: string;

  abstract chat(request: ProviderChatRequest): Promise<ProviderChatResponse>;

  // 默认抛错；具体 provider 根据是否支持流式自行覆盖。
  async *chatStream(
    _request: ProviderChatRequest,
  ): AsyncGenerator<StreamEvent> {
    throw new Error(`${this.providerName} stream chat is not enabled yet`);
  }

  // S2S provider surface (A1/A2/A3, TD-003) - default "not implemented" throw, same
  // pattern as chatStream. Which provider/model backs each capability is a product/
  // cost decision (docs/30-design/200-s2s-provider-surface.md), not decided here - a
  // concrete provider overrides the relevant method once that decision is made.
  async embed(_request: ProviderEmbedRequest): Promise<ProviderEmbedResponse> {
    throw new ProviderCapabilityNotImplementedError(this.providerName, "embed");
  }

  async rerank(
    _request: ProviderRerankRequest,
  ): Promise<ProviderRerankResponse> {
    throw new ProviderCapabilityNotImplementedError(this.providerName, "rerank");
  }

  async parseDocument(
    _request: ProviderParseRequest,
  ): Promise<ProviderParseResponse> {
    throw new ProviderCapabilityNotImplementedError(
      this.providerName,
      "parseDocument",
    );
  }

  protected async postJson<TResponse>(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<TResponse> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new ProviderHttpError(
        `${this.providerName} request failed with status ${response.status}`,
        response.status,
        this.providerName,
        responseText,
      );
    }

    return parseJson<TResponse>(responseText);
  }
}

export function joinEndpoint(baseUrl: string, suffix: string): string {
  let normalizedBase = baseUrl;
  while (normalizedBase.endsWith("/")) {
    normalizedBase = normalizedBase.slice(0, -1);
  }
  let normalizedSuffix = suffix;
  while (normalizedSuffix.startsWith("/")) {
    normalizedSuffix = normalizedSuffix.slice(1);
  }
  return `${normalizedBase}/${normalizedSuffix}`;
}

export function parseJson<TResponse>(text: string): TResponse {
  if (!text.trim()) {
    throw new Error("Provider returned an empty response");
  }

  return JSON.parse(text) as TResponse;
}
