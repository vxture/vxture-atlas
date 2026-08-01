import { Injectable } from "@nestjs/common";

import { OpenAiCompatibleProvider } from "./openai-compatible.provider";

/**
 * Doubao (Volcengine Ark).
 *
 * 除了名字之外，它与通用 `openai-chat-completions` 适配器没有任何差别 ——
 * 这个类的唯一作用，是让存量 `provider_code='doubao'` 的行在 protocol 无法
 * 识别时，仍能通过 `ModelRouterService` 的回退层落到正确的实现上。
 *
 * 一旦回退层计数归零（设计文档 §8 / P3），这个类应当删除：doubao 与其他
 * OpenAI 方言上游一样，纯靠 `protocol` 分发。
 */
@Injectable()
export class DoubaoProvider extends OpenAiCompatibleProvider {
  override readonly providerName = "doubao";
}
