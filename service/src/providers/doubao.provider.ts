import { Injectable } from "@nestjs/common";

import { BaseProvider, joinEndpoint, ProviderHttpError } from "./base.provider";
import type {
  OpenAiCompatibleChatResponse,
  OpenAiCompatibleChatStreamChunk,
  OpenAiToolCall,
} from "./openai-compatible.types";
import type {
  ChatMessage,
  FinishReason,
  ProviderChatRequest,
  ProviderChatResponse,
  StreamEvent,
  TokenUsage,
  ToolCall,
  ToolChoice,
  ToolDefinition,
} from "../types/runtime.types";

@Injectable()
export class DoubaoProvider extends BaseProvider {
  readonly providerName = "doubao";

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

export function buildOpenAiCompatibleBody(
  request: ProviderChatRequest,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.modelCode,
    messages: request.messages.map(toWireMessage),
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    top_p: request.topP,
    stream,
  };
  if (request.tools?.length) {
    body.tools = request.tools.map(toWireTool);
  }
  if (request.toolChoice !== undefined) {
    body.tool_choice = toWireToolChoice(request.toolChoice);
  }
  return body;
}

function toWireMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
      name: message.name,
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    };
  }
  return {
    role: message.role,
    content: message.content,
  };
}

function toWireTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toWireToolChoice(choice: ToolChoice): unknown {
  if (typeof choice === "string") {
    return choice;
  }
  return {
    type: "function",
    function: { name: choice.name },
  };
}

export function normalizeOpenAiCompatibleResponse(
  providerName: string,
  response: OpenAiCompatibleChatResponse,
): ProviderChatResponse {
  const choice = response.choices?.[0];
  const message = choice?.message;
  const content = typeof message?.content === "string" ? message.content : "";
  const toolCalls = parseOpenAiToolCalls(message?.tool_calls);

  if (!content && toolCalls.length === 0) {
    const providerMessage = response.error?.message ?? "empty model response";
    throw new Error(
      `${providerName} returned invalid response: ${providerMessage}`,
    );
  }

  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? 0;

  const mappedToolCalls = toolCalls.length > 0 ? toolCalls : undefined;
  const mappedFinishReason = mapFinishReason(
    choice?.finish_reason ?? undefined,
  );
  return {
    content,
    ...(mappedToolCalls !== undefined ? { toolCalls: mappedToolCalls } : {}),
    ...(mappedFinishReason !== undefined
      ? { finishReason: mappedFinishReason }
      : {}),
    promptTokens,
    completionTokens,
    totalTokens:
      response.usage?.total_tokens ?? promptTokens + completionTokens,
  };
}

function parseOpenAiToolCalls(
  toolCalls: OpenAiToolCall[] | undefined,
): ToolCall[] {
  if (!toolCalls?.length) return [];
  const parsed: ToolCall[] = [];
  for (const call of toolCalls) {
    if (!call.id || !call.function?.name) continue;
    parsed.push({
      id: call.id,
      name: call.function.name,
      arguments: parseArgs(call.function.arguments),
    });
  }
  return parsed;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapFinishReason(value: string | undefined): FinishReason | undefined {
  switch (value) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    default:
      return undefined;
  }
}

async function* parseOpenAiCompatibleStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // 工具调用分片聚合：OpenAI 协议下，tool_calls 的 arguments 是按字符流式拼接，
  // 完整入参只有在 finish_reason='tool_calls' 时才能确定。
  const toolBuffers = new Map<
    number,
    { id: string; name: string; args: string }
  >();
  let usage: TokenUsage | undefined;
  let finishReason: FinishReason | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl = findEventBoundary(buffer);
      while (nl !== -1) {
        const rawEvent = buffer.slice(0, nl);
        buffer = buffer.slice(nl).replace(/^(\r?\n){1,2}/, "");
        const dataPayload = extractDataPayload(rawEvent);
        nl = findEventBoundary(buffer);

        if (dataPayload === null) continue;
        if (dataPayload === "[DONE]") {
          for (const buf of toolBuffers.values()) {
            yield {
              type: "tool_call",
              toolCall: {
                id: buf.id,
                name: buf.name,
                arguments: parseArgs(buf.args),
              },
            };
          }
          yield {
            type: "done",
            ...(usage !== undefined ? { usage } : {}),
            ...(finishReason !== undefined ? { finishReason } : {}),
          };
          return;
        }

        let chunk: OpenAiCompatibleChatStreamChunk;
        try {
          chunk = JSON.parse(dataPayload) as OpenAiCompatibleChatStreamChunk;
        } catch {
          yield {
            type: "error",
            code: "PARSE_FAILED",
            message: `Invalid SSE chunk: ${dataPayload}`,
          };
          continue;
        }

        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens:
              chunk.usage.total_tokens ??
              (chunk.usage.prompt_tokens ?? 0) +
                (chunk.usage.completion_tokens ?? 0),
          };
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (typeof delta?.content === "string" && delta.content.length > 0) {
          yield { type: "text", delta: delta.content };
        }

        if (delta?.tool_calls?.length) {
          for (const partial of delta.tool_calls) {
            const idx = partial.index ?? 0;
            const buf = toolBuffers.get(idx) ?? { id: "", name: "", args: "" };
            if (partial.id) buf.id = partial.id;
            if (partial.function?.name) buf.name = partial.function.name;
            if (typeof partial.function?.arguments === "string") {
              buf.args += partial.function.arguments;
            }
            toolBuffers.set(idx, buf);
          }
        }

        if (choice.finish_reason) {
          finishReason = mapFinishReason(choice.finish_reason) ?? finishReason;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 流意外结束（没有 [DONE]）：把已经聚合的工具调用 + done 事件吐出
  for (const buf of toolBuffers.values()) {
    yield {
      type: "tool_call",
      toolCall: {
        id: buf.id,
        name: buf.name,
        arguments: parseArgs(buf.args),
      },
    };
  }
  yield {
    type: "done",
    ...(usage !== undefined ? { usage } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
  };
}

function extractDataPayload(rawEvent: string): string | null {
  const dataLines: string[] = [];
  for (const line of rawEvent.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n").trim();
  return payload.length > 0 ? payload : null;
}

function findEventBoundary(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function resolveChatCompletionsEndpoint(endpointUrl: string): string {
  if (endpointUrl.endsWith("/chat/completions")) {
    return endpointUrl;
  }

  return joinEndpoint(endpointUrl, "/chat/completions");
}
