import { Injectable } from "@nestjs/common";

import { OpenAiCompatibleProvider } from "./openai-compatible.provider";

/**
 * Self-hosted / private models behind an OpenAI-compatible endpoint
 * (vLLM, Ollama's OpenAI shim, an in-house gateway).
 *
 * 与 `DoubaoProvider` 同理：本身没有任何私有逻辑，存在只是为了让存量
 * `provider_code` 为 `private`/`custom`/`self-hosted` 的行在 protocol 无法
 * 识别时通过回退层落地。P3 之后应当删除。
 */
@Injectable()
export class PrivateModelProvider extends OpenAiCompatibleProvider {
  override readonly providerName = "private";
}
