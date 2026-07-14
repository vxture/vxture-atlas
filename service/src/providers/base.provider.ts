import type {
  IModelProvider,
  ProviderChatRequest,
  ProviderChatResponse,
  StreamEvent,
} from "../types/runtime.types";

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
