import { Injectable } from "@nestjs/common";

import { BaseProvider, joinEndpoint } from "./base.provider";
import type {
  ChatMessage,
  FinishReason,
  ProviderChatRequest,
  ProviderChatResponse,
  ToolCall,
  ToolChoice,
  ToolDefinition,
} from "../types/runtime.types";

interface ClaudeContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeChatResponse {
  content?: ClaudeContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  stop_reason?: string;
  error?: {
    message?: string;
  };
}

@Injectable()
export class ClaudeProvider extends BaseProvider {
  readonly providerName = "claude";

  async chat(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const body: Record<string, unknown> = {
      model: request.modelCode,
      system: buildSystemPrompt(request.messages),
      messages: buildClaudeMessages(request.messages),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
      top_p: request.topP,
    };
    if (request.tools?.length) {
      body.tools = request.tools.map(toClaudeTool);
    }
    if (request.toolChoice !== undefined) {
      body.tool_choice = toClaudeToolChoice(request.toolChoice);
    }

    const response = await this.postJson<ClaudeChatResponse>(
      resolveClaudeMessagesEndpoint(request.endpointUrl),
      {
        "x-api-key": request.apiKey,
        "anthropic-version": readStringConfig(
          request.config,
          "anthropicVersion",
          "2023-06-01",
        ),
      },
      body,
    );

    const content = (response.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .filter((text): text is string => typeof text === "string")
      .join("");

    const toolCalls: ToolCall[] = (response.content ?? [])
      .filter(
        (block) =>
          block.type === "tool_use" &&
          typeof block.id === "string" &&
          typeof block.name === "string",
      )
      .map((block) => ({
        id: block.id as string,
        name: block.name as string,
        arguments: (block.input ?? {}) as Record<string, unknown>,
      }));

    if (!content && toolCalls.length === 0) {
      const providerMessage = response.error?.message ?? "empty model response";
      throw new Error(
        `${this.providerName} returned invalid response: ${providerMessage}`,
      );
    }

    const promptTokens = response.usage?.input_tokens ?? 0;
    const completionTokens = response.usage?.output_tokens ?? 0;

    const mappedToolCalls = toolCalls.length > 0 ? toolCalls : undefined;
    const mappedFinishReason = mapClaudeStopReason(response.stop_reason);
    return {
      content,
      ...(mappedToolCalls !== undefined ? { toolCalls: mappedToolCalls } : {}),
      ...(mappedFinishReason !== undefined
        ? { finishReason: mappedFinishReason }
        : {}),
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }
}

function toClaudeTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}

function toClaudeToolChoice(choice: ToolChoice): unknown {
  if (choice === "auto") return { type: "auto" };
  if (choice === "none") return undefined;
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.name };
}

function mapClaudeStopReason(
  value: string | undefined,
): FinishReason | undefined {
  switch (value) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    default:
      return undefined;
  }
}

function resolveClaudeMessagesEndpoint(endpointUrl: string): string {
  if (endpointUrl.endsWith("/messages")) {
    return endpointUrl;
  }

  return joinEndpoint(endpointUrl, "/v1/messages");
}

function buildSystemPrompt(messages: ChatMessage[]): string | undefined {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);

  return systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined;
}

function buildClaudeMessages(messages: ChatMessage[]): ClaudeMessage[] {
  const result: ClaudeMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content,
          } as ClaudeContentBlock,
        ],
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const blocks: ClaudeContentBlock[] = [];
      if (message.content) {
        blocks.push({ type: "text", text: message.content });
      }
      for (const call of message.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments,
        });
      }
      result.push({ role: "assistant", content: blocks });
      continue;
    }

    result.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    });
  }
  return result;
}

function readStringConfig(
  config: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = config?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}
