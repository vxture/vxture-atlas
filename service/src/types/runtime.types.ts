export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** assistant 角色：模型本轮发起的工具调用列表 */
  toolCalls?: ToolCall[];
  /** tool 角色：本条消息对应的 toolCall ID */
  toolCallId?: string;
  /** tool 角色：工具名称（部分 provider 要求） */
  name?: string;
}

/**
 * 工具定义（function calling 兼容形态）
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * 工具选择策略
 */
export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "function"; name: string };

/**
 * 模型发起的一次工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * 模型结束原因
 */
export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter";

export type ApplicationType =
  | "agent"
  | "workflow"
  | "api_client"
  | "internal_service";

export interface ChatRequest {
  modelCode: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  stream?: boolean;
  tenantId: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  /** @deprecated 迁移期兼容字段，会映射为 applicationId + applicationType=agent */
  agentId?: string;
  userId?: string;
  featureId?: string;
  requestId?: string;
  businessId?: string;
  usageType?: "normal" | "retry" | "test";
}

export interface ChatResponse {
  id: string;
  modelCode: string;
  message: ChatMessage;
  usage: TokenUsage;
  latencyMs: number;
  finishReason?: FinishReason;
}

/**
 * 流式响应事件（与 ai-sdk LLMStreamChunk 形态对齐）
 *
 * Model Runtime 以 SSE 形式逐条 `data: <json>` 推送，
 * 流尾以 `data: [DONE]` 结束。
 */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; usage?: TokenUsage; finishReason?: FinishReason }
  | { type: "error"; code: string; message: string };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface IModelProvider {
  readonly providerName: string;
  chat(request: ProviderChatRequest): Promise<ProviderChatResponse>;
  chatStream(request: ProviderChatRequest): AsyncGenerator<StreamEvent>;
}

export interface ProviderChatRequest {
  endpointUrl: string;
  apiKey: string;
  modelCode: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  config?: ModelConfig;
}

export interface ProviderChatResponse extends TokenUsage {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: FinishReason;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  remaining: bigint;
}

export type ModelConfig = Record<string, unknown>;
export type DecimalLike = { toString(): string };

export interface ModelProviderRecord {
  id: string;
  providerCode: string;
  providerType: string;
  providerName: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  consoleUrl: string | null;
  billingUrl: string | null;
  isActive: boolean;
  config: ModelConfig | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AiModelRecord {
  id: string;
  providerId: string | null;
  modelCode: string;
  modelName: string;
  provider: string;
  endpointUrl: string;
  protocol: string;
  modelType: string;
  description: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: string[];
  supportsStreaming: boolean;
  isActive: boolean;
  sort: number;
  config: ModelConfig | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AiModelGrantRecord {
  id: string;
  modelId: string;
  tenantId: string;
  applicationId: string | null;
  applicationType: ApplicationType | null;
  agentId: string | null;
  priority: number;
  reason: string | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ModelPriceRuleRecord {
  id: string;
  modelId: string;
  billingMode: string;
  currency: string;
  unitTokens: number;
  inputUnitPrice: DecimalLike;
  outputUnitPrice: DecimalLike;
  requestUnitPrice: DecimalLike;
  isActive: boolean;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelPolicyRecord {
  id: string;
  modelId: string;
  tenantId: string | null;
  name: string | null;
  priority: number;
  maxConcurrent: number | null;
  rateLimitRpm: number | null;
  rateLimitTpm: bigint | null;
  rateLimitTpd: bigint | null;
  maxContextTokens: number | null;
  isActive: boolean;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSubscriptionQuotaRecord {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  maxUsers: number;
  maxApiKeys: number;
  maxWorkflows: number;
  maxConcurrent: number;
  rateLimitPerMinute: number;
  periodTokens: bigint;
  quotaCycle: string;
  allowedModels: string[];
  allowCustomModel: boolean;
  effectiveAt: Date;
  expiresAt: Date | null;
}

export interface TenantUsageSummaryRecord {
  id: string;
  tenantId: string;
  featureId: string;
  applicationId: string;
  applicationType: ApplicationType;
  agentId: string;
  cycleMonth: string;
  totalQuota: bigint;
  inputQuota: bigint;
  outputQuota: bigint;
  requestCount: bigint;
  statType: string;
}

export interface TenantUsageEventRecord {
  id: string;
  tenantId: string;
  applicationId: string;
  applicationType: ApplicationType;
  agentId: string;
  featureId: string;
  userId: string | null;
  usedQuota: bigint;
  inputQuota: bigint | null;
  outputQuota: bigint | null;
  requestId: string | null;
  businessId: string | null;
  usageType: string;
  cycleDate: Date;
  cycleMonth: string;
  createdAt: Date;
  modelCode: string | null;
  latencyMs: number | null;
}

export interface UsageLogInput {
  requestId: string;
  tenantId: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  agentId?: string;
  userId?: string;
  featureId?: string;
  businessId?: string;
  modelCode: string;
  usage: TokenUsage;
  latencyMs: number;
  usageType?: "normal" | "retry" | "test";
}

export interface CreateAiModelInput {
  providerId?: string | null;
  modelCode: string;
  modelName: string;
  provider: string;
  endpointUrl: string;
  protocol: string;
  modelType?: string;
  description?: string | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  capabilities: string[];
  supportsStreaming?: boolean;
  sort?: number;
  config?: ModelConfig | null;
}

export interface UpdateAiModelInput {
  providerId?: string | null;
  modelCode?: string;
  modelName?: string;
  provider?: string;
  endpointUrl?: string;
  protocol?: string;
  modelType?: string;
  description?: string | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  capabilities?: string[];
  supportsStreaming?: boolean;
  sort?: number;
  config?: ModelConfig | null;
  isActive?: boolean;
}

export interface CreateAiModelGrantInput {
  modelId: string;
  tenantId: string;
  applicationId?: string | null;
  applicationType?: ApplicationType | null;
  agentId?: string | null;
  priority?: number;
  reason?: string | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export interface UpdateAiModelGrantInput {
  applicationId?: string | null;
  applicationType?: ApplicationType | null;
  agentId?: string | null;
  priority?: number;
  reason?: string | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export interface CreateModelProviderInput {
  providerCode: string;
  providerType?: string;
  providerName: string;
  description?: string | null;
  logoUrl?: string | null;
  homepageUrl?: string | null;
  consoleUrl?: string | null;
  billingUrl?: string | null;
  config?: ModelConfig | null;
  isActive?: boolean;
}

export type UpdateModelProviderInput = Partial<CreateModelProviderInput>;

export interface CreateModelPriceRuleInput {
  modelId: string;
  billingMode?: string;
  currency?: string;
  unitTokens?: number;
  inputUnitPrice?: string;
  outputUnitPrice?: string;
  requestUnitPrice?: string;
  effectiveAt?: Date;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export type UpdateModelPriceRuleInput = Partial<
  Omit<CreateModelPriceRuleInput, "modelId">
>;

export interface CreateModelPolicyInput {
  modelId: string;
  tenantId?: string | null;
  name?: string | null;
  priority?: number;
  maxConcurrent?: number | null;
  rateLimitRpm?: number | null;
  rateLimitTpm?: bigint | null;
  rateLimitTpd?: bigint | null;
  maxContextTokens?: number | null;
  effectiveAt?: Date;
  expiresAt?: Date | null;
  isActive?: boolean;
}

export type UpdateModelPolicyInput = Partial<
  Omit<CreateModelPolicyInput, "modelId">
>;
