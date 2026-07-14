import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryRepository } from "../registry/model-registry.repository";
import { ModelAdminException } from "./model-admin.errors";
import type {
  AiModelGrantRecord,
  AiModelRecord,
  ApplicationType,
  CreateAiModelGrantInput,
  CreateAiModelInput,
  CreateModelPolicyInput,
  CreateModelPriceRuleInput,
  CreateModelProviderInput,
  ModelConfig,
  ModelPolicyRecord,
  ModelPriceRuleRecord,
  ModelProviderRecord,
  TenantSubscriptionQuotaRecord,
  TenantUsageSummaryRecord,
  UpdateAiModelGrantInput,
  UpdateAiModelInput,
  UpdateModelPolicyInput,
  UpdateModelPriceRuleInput,
  UpdateModelProviderInput,
} from "../types/runtime.types";

const APPLICATION_TYPES = new Set<ApplicationType>([
  "agent",
  "workflow",
  "api_client",
  "internal_service",
]);

const SECRET_CONFIG_KEY_PATTERN =
  /^(api[-_]?key|apiKeyEnvVar|secret|token|password|credential|access[-_]?token|refresh[-_]?token|bearer[-_]?token)$/i;

export interface ModelKeyReference {
  source: "env";
  name: string;
  configured: boolean;
}

export interface ModelKeyReferenceInput {
  source?: "env";
  name?: string | null;
}

export interface ModelProviderAdminRecord {
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
  createdAt: string;
  updatedAt: string;
}

export interface AiModelAdminRecord {
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
  sort: number;
  isActive: boolean;
  config: ModelConfig | null;
  keyReference: ModelKeyReference | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelGrantAdminRecord {
  id: string;
  modelId: string;
  tenantId: string;
  applicationId: string | null;
  applicationType: ApplicationType | null;
  agentId: string | null;
  priority: number;
  reason: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPriceRuleAdminRecord {
  id: string;
  modelId: string;
  billingMode: string;
  currency: string;
  unitTokens: number;
  inputUnitPrice: string;
  outputUnitPrice: string;
  requestUnitPrice: string;
  isActive: boolean;
  effectiveAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPolicyAdminRecord {
  id: string;
  modelId: string;
  tenantId: string | null;
  name: string | null;
  priority: number;
  maxConcurrent: number | null;
  rateLimitRpm: number | null;
  rateLimitTpm: string | null;
  rateLimitTpd: string | null;
  maxContextTokens: number | null;
  isActive: boolean;
  effectiveAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantQuotaAdminRecord {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  maxUsers: number;
  maxApiKeys: number;
  maxWorkflows: number;
  maxConcurrent: number;
  rateLimitPerMinute: number;
  periodTokens: string;
  quotaCycle: string;
  allowedModels: string[];
  allowCustomModel: boolean;
  effectiveAt: string;
  expiresAt: string | null;
}

export interface TenantUsageSummaryAdminRecord {
  id: string;
  tenantId: string;
  featureId: string;
  applicationId: string;
  applicationType: ApplicationType;
  agentId: string;
  cycleMonth: string;
  totalQuota: string;
  inputQuota: string;
  outputQuota: string;
  requestCount: string;
  statType: string;
}

export type CreateModelProviderBody = Partial<
  Omit<CreateModelProviderInput, "config">
> & {
  config?: ModelConfig | null;
};

export type UpdateModelProviderBody = Partial<
  Omit<UpdateModelProviderInput, "config">
> & {
  config?: ModelConfig | null;
};

export type CreateAiModelBody = Partial<Omit<CreateAiModelInput, "config">> & {
  config?: ModelConfig | null;
  keyReference?: ModelKeyReferenceInput | null;
  /** @deprecated P3 控制面输入兼容字段；响应不再暴露该字段。 */
  apiKeyEnvVar?: string | null;
};

export type UpdateAiModelBody = Partial<Omit<UpdateAiModelInput, "config">> & {
  config?: ModelConfig | null;
  keyReference?: ModelKeyReferenceInput | null;
  /** @deprecated P3 控制面输入兼容字段；响应不再暴露该字段。 */
  apiKeyEnvVar?: string | null;
};

export type CreateAiModelGrantBody = {
  modelId?: string;
  tenantId?: string;
  applicationId?: string | null;
  applicationType?: ApplicationType | null;
  agentId?: string | null;
  priority?: number | null;
  reason?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
};

export type UpdateAiModelGrantBody = {
  applicationId?: string | null;
  applicationType?: ApplicationType | null;
  agentId?: string | null;
  priority?: number | null;
  reason?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
};

export type CreateModelPriceRuleBody = {
  modelId?: string;
  billingMode?: string;
  currency?: string;
  unitTokens?: number | null;
  inputUnitPrice?: string | number | null;
  outputUnitPrice?: string | number | null;
  requestUnitPrice?: string | number | null;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
};

export type UpdateModelPriceRuleBody = Partial<
  Omit<CreateModelPriceRuleBody, "modelId">
>;

export type CreateModelPolicyBody = {
  modelId?: string;
  tenantId?: string | null;
  name?: string | null;
  priority?: number | null;
  maxConcurrent?: number | null;
  rateLimitRpm?: number | null;
  rateLimitTpm?: string | number | bigint | null;
  rateLimitTpd?: string | number | bigint | null;
  maxContextTokens?: number | null;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
};

export type UpdateModelPolicyBody = Partial<
  Omit<CreateModelPolicyBody, "modelId">
>;

@Injectable()
export class ModelAdminService {
  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  async listProviders(
    includeInactive = true,
  ): Promise<ModelProviderAdminRecord[]> {
    const providers = await this.repository.listProviders(includeInactive);
    return providers.map(mapProvider);
  }

  async createProvider(
    body: CreateModelProviderBody,
  ): Promise<ModelProviderAdminRecord> {
    const input = this.normalizeCreateProvider(body);
    const provider = await this.repository.createProvider(input);
    return mapProvider(provider);
  }

  async updateProvider(
    providerId: string,
    body: UpdateModelProviderBody,
  ): Promise<ModelProviderAdminRecord> {
    await this.assertProviderExists(providerId);
    const input = this.normalizeUpdateProvider(body);
    const provider = await this.repository.updateProvider(providerId, input);
    return mapProvider(provider);
  }

  async setProviderActive(
    providerId: string,
    isActive: boolean,
  ): Promise<ModelProviderAdminRecord> {
    await this.assertProviderExists(providerId);
    const provider = await this.repository.updateProvider(providerId, {
      isActive,
    });
    return mapProvider(provider);
  }

  async deleteProvider(providerId: string): Promise<ModelProviderAdminRecord> {
    await this.assertProviderExists(providerId);
    const provider = await this.repository.deleteProvider(providerId);
    return mapProvider(provider);
  }

  async listModels(includeInactive = true): Promise<AiModelAdminRecord[]> {
    const models = await this.repository.listModels(includeInactive);
    return models.map(mapModel);
  }

  async createModel(body: CreateAiModelBody): Promise<AiModelAdminRecord> {
    const input = this.normalizeCreateModel(body);
    const model = await this.repository.createModel(input);
    return mapModel(model);
  }

  async updateModel(
    modelId: string,
    body: UpdateAiModelBody,
  ): Promise<AiModelAdminRecord> {
    await this.assertModelExists(modelId);
    const input = this.normalizeUpdateModel(body);
    const model = await this.repository.updateModel(modelId, input);
    return mapModel(model);
  }

  async setModelActive(
    modelId: string,
    isActive: boolean,
  ): Promise<AiModelAdminRecord> {
    await this.assertModelExists(modelId);
    const model = await this.repository.updateModel(modelId, { isActive });
    return mapModel(model);
  }

  async deleteModel(modelId: string): Promise<AiModelAdminRecord> {
    await this.assertModelExists(modelId);
    const model = await this.repository.deleteModel(modelId);
    return mapModel(model);
  }

  async listGrants(filters: {
    tenantId?: string;
    modelId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
  }): Promise<AiModelGrantAdminRecord[]> {
    const grants = await this.repository.listGrants(
      normalizeGrantFilters(filters),
    );
    return grants.map(mapGrant);
  }

  async createGrant(
    body: CreateAiModelGrantBody,
  ): Promise<AiModelGrantAdminRecord> {
    const input = await this.normalizeCreateGrant(body);
    const grant = await this.repository.createGrant(input);
    return mapGrant(grant);
  }

  async updateGrant(
    grantId: string,
    body: UpdateAiModelGrantBody,
  ): Promise<AiModelGrantAdminRecord> {
    await this.assertGrantExists(grantId);
    const input = this.normalizeUpdateGrant(body);
    const grant = await this.repository.updateGrant(grantId, input);
    return mapGrant(grant);
  }

  async setGrantActive(
    grantId: string,
    isActive: boolean,
  ): Promise<AiModelGrantAdminRecord> {
    await this.assertGrantExists(grantId);
    const grant = await this.repository.updateGrant(grantId, { isActive });
    return mapGrant(grant);
  }

  async deleteGrant(grantId: string): Promise<AiModelGrantAdminRecord> {
    await this.assertGrantExists(grantId);
    const grant = await this.repository.deleteGrant(grantId);
    return mapGrant(grant);
  }

  async listPriceRules(filters: {
    modelId?: string;
    includeInactive?: string;
  }): Promise<ModelPriceRuleAdminRecord[]> {
    const rules = await this.repository.listPriceRules({
      ...(filters.modelId !== undefined
        ? { modelId: requiredString(filters.modelId, "modelId") }
        : {}),
      includeInactive: filters.includeInactive !== "false",
    });
    return rules.map(mapPriceRule);
  }

  async createPriceRule(
    body: CreateModelPriceRuleBody,
  ): Promise<ModelPriceRuleAdminRecord> {
    const input = await this.normalizeCreatePriceRule(body);
    const rule = await this.repository.createPriceRule(input);
    return mapPriceRule(rule);
  }

  async updatePriceRule(
    priceRuleId: string,
    body: UpdateModelPriceRuleBody,
  ): Promise<ModelPriceRuleAdminRecord> {
    await this.assertPriceRuleExists(priceRuleId);
    const input = this.normalizeUpdatePriceRule(body);
    const rule = await this.repository.updatePriceRule(priceRuleId, input);
    return mapPriceRule(rule);
  }

  async setPriceRuleActive(
    priceRuleId: string,
    isActive: boolean,
  ): Promise<ModelPriceRuleAdminRecord> {
    await this.assertPriceRuleExists(priceRuleId);
    const rule = await this.repository.updatePriceRule(priceRuleId, {
      isActive,
    });
    return mapPriceRule(rule);
  }

  async listPolicies(filters: {
    modelId?: string;
    tenantId?: string;
    includeInactive?: string;
  }): Promise<ModelPolicyAdminRecord[]> {
    const policies = await this.repository.listPolicies({
      ...(filters.modelId !== undefined
        ? { modelId: requiredString(filters.modelId, "modelId") }
        : {}),
      ...(filters.tenantId !== undefined
        ? { tenantId: requiredString(filters.tenantId, "tenantId") }
        : {}),
      includeInactive: filters.includeInactive !== "false",
    });
    return policies.map(mapPolicy);
  }

  async createPolicy(
    body: CreateModelPolicyBody,
  ): Promise<ModelPolicyAdminRecord> {
    const input = await this.normalizeCreatePolicy(body);
    const policy = await this.repository.createPolicy(input);
    return mapPolicy(policy);
  }

  async updatePolicy(
    policyId: string,
    body: UpdateModelPolicyBody,
  ): Promise<ModelPolicyAdminRecord> {
    await this.assertPolicyExists(policyId);
    const input = this.normalizeUpdatePolicy(body);
    const policy = await this.repository.updatePolicy(policyId, input);
    return mapPolicy(policy);
  }

  async setPolicyActive(
    policyId: string,
    isActive: boolean,
  ): Promise<ModelPolicyAdminRecord> {
    await this.assertPolicyExists(policyId);
    const policy = await this.repository.updatePolicy(policyId, { isActive });
    return mapPolicy(policy);
  }

  async listTenantQuotas(filters: {
    tenantId?: string;
    includeExpired?: string;
  }): Promise<TenantQuotaAdminRecord[]> {
    const quotas = await this.repository.listSubscriptionQuotas({
      ...(filters.tenantId !== undefined
        ? { tenantId: requiredString(filters.tenantId, "tenantId") }
        : {}),
      includeExpired: filters.includeExpired === "true",
    });
    return quotas.map(mapTenantQuota);
  }

  async listUsageSummaries(filters: {
    tenantId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
    cycleMonth?: string;
    statType?: string;
  }): Promise<TenantUsageSummaryAdminRecord[]> {
    const normalized = normalizeUsageSummaryFilters(filters);
    const summaries = await this.repository.listUsageSummaries(normalized);
    return summaries.map(mapUsageSummary);
  }

  private normalizeCreateProvider(
    body: CreateModelProviderBody,
  ): CreateModelProviderInput {
    return {
      providerCode: requiredString(body.providerCode, "providerCode"),
      providerType: body.providerType
        ? requiredString(body.providerType, "providerType")
        : "online",
      providerName: requiredString(body.providerName, "providerName"),
      description: optionalString(body.description),
      logoUrl: optionalUrl(body.logoUrl, "logoUrl"),
      homepageUrl: optionalUrl(body.homepageUrl, "homepageUrl"),
      consoleUrl: optionalUrl(body.consoleUrl, "consoleUrl"),
      billingUrl: optionalUrl(body.billingUrl, "billingUrl"),
      config: sanitizeWritableConfig(body.config ?? null),
      isActive: body.isActive ?? true,
    };
  }

  private normalizeUpdateProvider(
    body: UpdateModelProviderBody,
  ): UpdateModelProviderInput {
    const input: UpdateModelProviderInput = {};

    if (body.providerCode !== undefined)
      input.providerCode = requiredString(body.providerCode, "providerCode");
    if (body.providerType !== undefined)
      input.providerType = requiredString(body.providerType, "providerType");
    if (body.providerName !== undefined)
      input.providerName = requiredString(body.providerName, "providerName");
    if (body.description !== undefined)
      input.description = optionalString(body.description);
    if (body.logoUrl !== undefined)
      input.logoUrl = optionalUrl(body.logoUrl, "logoUrl");
    if (body.homepageUrl !== undefined)
      input.homepageUrl = optionalUrl(body.homepageUrl, "homepageUrl");
    if (body.consoleUrl !== undefined)
      input.consoleUrl = optionalUrl(body.consoleUrl, "consoleUrl");
    if (body.billingUrl !== undefined)
      input.billingUrl = optionalUrl(body.billingUrl, "billingUrl");
    if (body.config !== undefined)
      input.config = sanitizeWritableConfig(body.config);
    if (body.isActive !== undefined) input.isActive = body.isActive;

    return input;
  }

  private normalizeCreateModel(body: CreateAiModelBody): CreateAiModelInput {
    const capabilities = normalizeCapabilities(body.capabilities);
    const keyReferenceName = normalizeKeyReferenceName(body);

    return {
      modelCode: requiredString(body.modelCode, "modelCode"),
      providerId: optionalString(body.providerId),
      modelName: requiredString(body.modelName, "modelName"),
      provider: requiredString(body.provider, "provider"),
      endpointUrl: requiredUrl(body.endpointUrl, "endpointUrl"),
      protocol: requiredString(body.protocol, "protocol"),
      modelType: body.modelType ?? "chat",
      description: optionalString(body.description),
      contextWindow: optionalInt(body.contextWindow, "contextWindow"),
      maxOutputTokens: optionalInt(body.maxOutputTokens, "maxOutputTokens"),
      capabilities,
      supportsStreaming: body.supportsStreaming ?? true,
      sort: body.sort ?? 999,
      config: mergeModelConfig(
        sanitizeWritableConfig(body.config ?? null),
        keyReferenceName,
      ),
    };
  }

  private normalizeUpdateModel(body: UpdateAiModelBody): UpdateAiModelInput {
    const input: UpdateAiModelInput = {};

    if (body.modelCode !== undefined)
      input.modelCode = requiredString(body.modelCode, "modelCode");
    if (body.providerId !== undefined)
      input.providerId = optionalString(body.providerId);
    if (body.modelName !== undefined)
      input.modelName = requiredString(body.modelName, "modelName");
    if (body.provider !== undefined)
      input.provider = requiredString(body.provider, "provider");
    if (body.endpointUrl !== undefined)
      input.endpointUrl = requiredUrl(body.endpointUrl, "endpointUrl");
    if (body.protocol !== undefined)
      input.protocol = requiredString(body.protocol, "protocol");
    if (body.modelType !== undefined)
      input.modelType = requiredString(body.modelType, "modelType");
    if (body.description !== undefined)
      input.description = optionalString(body.description);
    if (body.contextWindow !== undefined)
      input.contextWindow = optionalInt(body.contextWindow, "contextWindow");
    if (body.maxOutputTokens !== undefined)
      input.maxOutputTokens = optionalInt(
        body.maxOutputTokens,
        "maxOutputTokens",
      );
    if (body.capabilities !== undefined)
      input.capabilities = normalizeCapabilities(body.capabilities);
    if (body.supportsStreaming !== undefined)
      input.supportsStreaming = body.supportsStreaming;
    if (body.sort !== undefined) input.sort = body.sort;
    if (body.config !== undefined || hasKeyReferenceInput(body)) {
      input.config = mergeModelConfig(
        sanitizeWritableConfig(body.config ?? null),
        normalizeKeyReferenceName(body),
      );
    }
    if (body.isActive !== undefined) input.isActive = body.isActive;

    return input;
  }

  private async normalizeCreateGrant(
    body: CreateAiModelGrantBody,
  ): Promise<CreateAiModelGrantInput> {
    const modelId = requiredString(body.modelId, "modelId");
    await this.assertModelExists(modelId);
    const agentId = optionalString(body.agentId);
    const applicationId = optionalString(body.applicationId ?? agentId);
    const applicationType =
      body.applicationType !== undefined && body.applicationType !== null
        ? normalizeApplicationType(body.applicationType, "applicationType")
        : agentId
          ? "agent"
          : null;

    validateApplicationScope({ applicationId, applicationType });

    return {
      modelId,
      tenantId: requiredString(body.tenantId, "tenantId"),
      applicationId,
      applicationType,
      agentId,
      priority: parsePriority(body.priority),
      reason: optionalString(body.reason),
      expiresAt: parseDateOrNull(body.expiresAt),
      isActive: body.isActive ?? true,
    };
  }

  private normalizeUpdateGrant(
    body: UpdateAiModelGrantBody,
  ): UpdateAiModelGrantInput {
    const input: UpdateAiModelGrantInput = {};
    const updatesApplicationId =
      body.applicationId !== undefined || body.agentId !== undefined;
    const updatesApplicationType =
      body.applicationType !== undefined || body.agentId !== undefined;

    if (body.agentId !== undefined) {
      const agentId = optionalString(body.agentId);
      input.agentId = agentId;
      if (body.applicationId === undefined) {
        input.applicationId = agentId;
        input.applicationType = agentId ? "agent" : null;
      }
    }
    if (body.applicationId !== undefined)
      input.applicationId = optionalString(body.applicationId);
    if (body.applicationType !== undefined)
      input.applicationType =
        body.applicationType === null
          ? null
          : normalizeApplicationType(body.applicationType, "applicationType");
    if (body.priority !== undefined)
      input.priority = parsePriority(body.priority);
    if (body.reason !== undefined) input.reason = optionalString(body.reason);
    if (body.expiresAt !== undefined)
      input.expiresAt = parseDateOrNull(body.expiresAt);
    if (body.isActive !== undefined) input.isActive = body.isActive;

    if (updatesApplicationId || updatesApplicationType) {
      const applicationId = updatesApplicationId
        ? (input.applicationId ?? null)
        : null;
      const applicationType = updatesApplicationType
        ? (input.applicationType ?? null)
        : null;

      validateApplicationScope({
        applicationId,
        applicationType,
      });
    }

    return input;
  }

  private async normalizeCreatePriceRule(
    body: CreateModelPriceRuleBody,
  ): Promise<CreateModelPriceRuleInput> {
    const modelId = requiredString(body.modelId, "modelId");
    await this.assertModelExists(modelId);

    return {
      modelId,
      billingMode: body.billingMode
        ? requiredString(body.billingMode, "billingMode")
        : "token",
      currency: body.currency
        ? requiredString(body.currency, "currency").toUpperCase()
        : "CNY",
      unitTokens: parsePositiveInt(body.unitTokens, "unitTokens", 1000000),
      inputUnitPrice: parseDecimalText(
        body.inputUnitPrice,
        "inputUnitPrice",
        "0",
      ),
      outputUnitPrice: parseDecimalText(
        body.outputUnitPrice,
        "outputUnitPrice",
        "0",
      ),
      requestUnitPrice: parseDecimalText(
        body.requestUnitPrice,
        "requestUnitPrice",
        "0",
      ),
      effectiveAt: parseDateOrNow(body.effectiveAt, "effectiveAt"),
      expiresAt: parseDateOrNull(body.expiresAt),
      isActive: body.isActive ?? true,
    };
  }

  private normalizeUpdatePriceRule(
    body: UpdateModelPriceRuleBody,
  ): UpdateModelPriceRuleInput {
    const input: UpdateModelPriceRuleInput = {};

    if (body.billingMode !== undefined)
      input.billingMode = requiredString(body.billingMode, "billingMode");
    if (body.currency !== undefined)
      input.currency = requiredString(body.currency, "currency").toUpperCase();
    if (body.unitTokens !== undefined)
      input.unitTokens = parsePositiveInt(body.unitTokens, "unitTokens");
    if (body.inputUnitPrice !== undefined)
      input.inputUnitPrice = parseDecimalText(
        body.inputUnitPrice,
        "inputUnitPrice",
      );
    if (body.outputUnitPrice !== undefined)
      input.outputUnitPrice = parseDecimalText(
        body.outputUnitPrice,
        "outputUnitPrice",
      );
    if (body.requestUnitPrice !== undefined)
      input.requestUnitPrice = parseDecimalText(
        body.requestUnitPrice,
        "requestUnitPrice",
      );
    if (body.effectiveAt !== undefined)
      input.effectiveAt = parseDateOrNow(body.effectiveAt, "effectiveAt");
    if (body.expiresAt !== undefined)
      input.expiresAt = parseDateOrNull(body.expiresAt);
    if (body.isActive !== undefined) input.isActive = body.isActive;

    return input;
  }

  private async normalizeCreatePolicy(
    body: CreateModelPolicyBody,
  ): Promise<CreateModelPolicyInput> {
    const modelId = requiredString(body.modelId, "modelId");
    await this.assertModelExists(modelId);

    return {
      modelId,
      tenantId: optionalString(body.tenantId),
      name: optionalString(body.name),
      priority: parsePriority(body.priority),
      maxConcurrent: optionalInt(body.maxConcurrent, "maxConcurrent"),
      rateLimitRpm: optionalInt(body.rateLimitRpm, "rateLimitRpm"),
      rateLimitTpm: optionalBigInt(body.rateLimitTpm, "rateLimitTpm"),
      rateLimitTpd: optionalBigInt(body.rateLimitTpd, "rateLimitTpd"),
      maxContextTokens: optionalInt(body.maxContextTokens, "maxContextTokens"),
      effectiveAt: parseDateOrNow(body.effectiveAt, "effectiveAt"),
      expiresAt: parseDateOrNull(body.expiresAt),
      isActive: body.isActive ?? true,
    };
  }

  private normalizeUpdatePolicy(
    body: UpdateModelPolicyBody,
  ): UpdateModelPolicyInput {
    const input: UpdateModelPolicyInput = {};

    if (body.tenantId !== undefined)
      input.tenantId = optionalString(body.tenantId);
    if (body.name !== undefined) input.name = optionalString(body.name);
    if (body.priority !== undefined)
      input.priority = parsePriority(body.priority);
    if (body.maxConcurrent !== undefined)
      input.maxConcurrent = optionalInt(body.maxConcurrent, "maxConcurrent");
    if (body.rateLimitRpm !== undefined)
      input.rateLimitRpm = optionalInt(body.rateLimitRpm, "rateLimitRpm");
    if (body.rateLimitTpm !== undefined)
      input.rateLimitTpm = optionalBigInt(body.rateLimitTpm, "rateLimitTpm");
    if (body.rateLimitTpd !== undefined)
      input.rateLimitTpd = optionalBigInt(body.rateLimitTpd, "rateLimitTpd");
    if (body.maxContextTokens !== undefined)
      input.maxContextTokens = optionalInt(
        body.maxContextTokens,
        "maxContextTokens",
      );
    if (body.effectiveAt !== undefined)
      input.effectiveAt = parseDateOrNow(body.effectiveAt, "effectiveAt");
    if (body.expiresAt !== undefined)
      input.expiresAt = parseDateOrNull(body.expiresAt);
    if (body.isActive !== undefined) input.isActive = body.isActive;

    return input;
  }

  private async assertModelExists(modelId: string): Promise<AiModelRecord> {
    const model = await this.repository.findModelById(modelId);

    if (!model) {
      throw new ModelAdminException(
        HttpStatus.NOT_FOUND,
        "MODEL_ADMIN_MODEL_NOT_FOUND",
        `AI model "${modelId}" was not found`,
        { modelId },
      );
    }

    return model;
  }

  private async assertProviderExists(
    providerId: string,
  ): Promise<ModelProviderRecord> {
    const provider = await this.repository.findProviderById(providerId);

    if (!provider) {
      throw new ModelAdminException(
        HttpStatus.NOT_FOUND,
        "MODEL_ADMIN_PROVIDER_NOT_FOUND",
        `Model provider "${providerId}" was not found`,
        { providerId },
      );
    }

    return provider;
  }

  private async assertGrantExists(
    grantId: string,
  ): Promise<AiModelGrantRecord> {
    const grant = await this.repository.findGrantById(grantId);

    if (!grant) {
      throw new ModelAdminException(
        HttpStatus.NOT_FOUND,
        "MODEL_ADMIN_GRANT_NOT_FOUND",
        `AI model grant "${grantId}" was not found`,
        { grantId },
      );
    }

    return grant;
  }

  private async assertPriceRuleExists(
    priceRuleId: string,
  ): Promise<ModelPriceRuleRecord> {
    const rule = await this.repository.findPriceRuleById(priceRuleId);

    if (!rule) {
      throw new ModelAdminException(
        HttpStatus.NOT_FOUND,
        "MODEL_ADMIN_PRICE_RULE_NOT_FOUND",
        `Model price rule "${priceRuleId}" was not found`,
        { priceRuleId },
      );
    }

    return rule;
  }

  private async assertPolicyExists(
    policyId: string,
  ): Promise<ModelPolicyRecord> {
    const policy = await this.repository.findPolicyById(policyId);

    if (!policy) {
      throw new ModelAdminException(
        HttpStatus.NOT_FOUND,
        "MODEL_ADMIN_POLICY_NOT_FOUND",
        `Model policy "${policyId}" was not found`,
        { policyId },
      );
    }

    return policy;
  }
}

function mapProvider(provider: ModelProviderRecord): ModelProviderAdminRecord {
  return {
    id: provider.id,
    providerCode: provider.providerCode,
    providerType: provider.providerType,
    providerName: provider.providerName,
    description: provider.description,
    logoUrl: provider.logoUrl,
    homepageUrl: provider.homepageUrl,
    consoleUrl: provider.consoleUrl,
    billingUrl: provider.billingUrl,
    isActive: provider.isActive,
    config: sanitizeModelConfig(provider.config),
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

function mapModel(model: AiModelRecord): AiModelAdminRecord {
  return {
    id: model.id,
    providerId: model.providerId,
    modelCode: model.modelCode,
    modelName: model.modelName,
    provider: model.provider,
    endpointUrl: model.endpointUrl,
    protocol: model.protocol,
    modelType: model.modelType,
    description: model.description,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities,
    supportsStreaming: model.supportsStreaming,
    sort: model.sort,
    isActive: model.isActive,
    config: sanitizeModelConfig(model.config),
    keyReference: readKeyReference(model.config),
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

function mapGrant(grant: AiModelGrantRecord): AiModelGrantAdminRecord {
  return {
    id: grant.id,
    modelId: grant.modelId,
    tenantId: grant.tenantId,
    applicationId: grant.applicationId,
    applicationType: grant.applicationType,
    agentId: grant.agentId,
    priority: grant.priority,
    reason: grant.reason,
    expiresAt: grant.expiresAt?.toISOString() ?? null,
    isActive: grant.isActive,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
  };
}

function mapPriceRule(rule: ModelPriceRuleRecord): ModelPriceRuleAdminRecord {
  return {
    id: rule.id,
    modelId: rule.modelId,
    billingMode: rule.billingMode,
    currency: rule.currency,
    unitTokens: rule.unitTokens,
    inputUnitPrice: rule.inputUnitPrice.toString(),
    outputUnitPrice: rule.outputUnitPrice.toString(),
    requestUnitPrice: rule.requestUnitPrice.toString(),
    isActive: rule.isActive,
    effectiveAt: rule.effectiveAt.toISOString(),
    expiresAt: rule.expiresAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function mapPolicy(policy: ModelPolicyRecord): ModelPolicyAdminRecord {
  return {
    id: policy.id,
    modelId: policy.modelId,
    tenantId: policy.tenantId,
    name: policy.name,
    priority: policy.priority,
    maxConcurrent: policy.maxConcurrent,
    rateLimitRpm: policy.rateLimitRpm,
    rateLimitTpm: policy.rateLimitTpm?.toString() ?? null,
    rateLimitTpd: policy.rateLimitTpd?.toString() ?? null,
    maxContextTokens: policy.maxContextTokens,
    isActive: policy.isActive,
    effectiveAt: policy.effectiveAt.toISOString(),
    expiresAt: policy.expiresAt?.toISOString() ?? null,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function mapTenantQuota(
  quota: TenantSubscriptionQuotaRecord,
): TenantQuotaAdminRecord {
  return {
    id: quota.id,
    tenantId: quota.tenantId,
    subscriptionId: quota.subscriptionId,
    maxUsers: quota.maxUsers,
    maxApiKeys: quota.maxApiKeys,
    maxWorkflows: quota.maxWorkflows,
    maxConcurrent: quota.maxConcurrent,
    rateLimitPerMinute: quota.rateLimitPerMinute,
    periodTokens: quota.periodTokens.toString(),
    quotaCycle: quota.quotaCycle,
    allowedModels: quota.allowedModels,
    allowCustomModel: quota.allowCustomModel,
    effectiveAt: quota.effectiveAt.toISOString(),
    expiresAt: quota.expiresAt?.toISOString() ?? null,
  };
}

function mapUsageSummary(
  summary: TenantUsageSummaryRecord,
): TenantUsageSummaryAdminRecord {
  return {
    id: summary.id,
    tenantId: summary.tenantId,
    featureId: summary.featureId,
    applicationId: summary.applicationId,
    applicationType: summary.applicationType,
    agentId: summary.agentId,
    cycleMonth: summary.cycleMonth,
    totalQuota: summary.totalQuota.toString(),
    inputQuota: summary.inputQuota.toString(),
    outputQuota: summary.outputQuota.toString(),
    requestCount: summary.requestCount.toString(),
    statType: summary.statType,
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throwValidationError(`${field} is required`, field);
  }

  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalInt(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throwValidationError(`${field} must be a non-negative integer`, field);
  }
  return value;
}

function parsePositiveInt(
  value: number | null | undefined,
  field: string,
  fallback?: number,
): number {
  if (value === null || value === undefined) {
    if (fallback !== undefined) return fallback;
    throwValidationError(`${field} is required`, field);
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throwValidationError(`${field} must be a positive integer`, field);
  }

  return value;
}

function optionalBigInt(
  value: string | number | bigint | null | undefined,
  field: string,
): bigint | null {
  if (value === null || value === undefined || value === "") return null;

  try {
    const parsed = BigInt(value);
    if (parsed < 0n) {
      throw new Error("negative bigint");
    }
    return parsed;
  } catch {
    throwValidationError(`${field} must be a non-negative integer`, field);
  }
}

function requiredUrl(value: unknown, field: string): string {
  const text = requiredString(value, field);

  try {
    new URL(text);
  } catch {
    throwValidationError(`${field} must be a valid URL`, field);
  }

  return text;
}

function optionalUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredUrl(value, field);
}

function parseDecimalText(
  value: string | number | null | undefined,
  field: string,
  fallback?: string,
): string {
  if (value === null || value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throwValidationError(`${field} is required`, field);
  }

  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throwValidationError(`${field} must be a non-negative decimal`, field);
  }

  return text;
}

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throwValidationError("capabilities must be an array", "capabilities");
  }

  const capabilities = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (capabilities.length === 0) {
    throwValidationError("capabilities cannot be empty", "capabilities");
  }

  return [...new Set(capabilities)];
}

function parsePriority(value: number | null | undefined): number {
  if (value === null || value === undefined) {
    return 100;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throwValidationError("priority must be a positive integer", "priority");
  }

  return value;
}

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throwValidationError("expiresAt must be a valid date", "expiresAt");
  }

  return date;
}

function parseDateOrNow(value: string | null | undefined, field: string): Date {
  if (!value) return new Date();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throwValidationError(`${field} must be a valid date`, field);
  }

  return date;
}

function normalizeGrantFilters(filters: {
  tenantId?: string;
  modelId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
}): {
  tenantId?: string;
  modelId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
} {
  const normalized: {
    tenantId?: string;
    modelId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
  } = {};

  if (filters.tenantId !== undefined)
    normalized.tenantId = requiredString(filters.tenantId, "tenantId");
  if (filters.modelId !== undefined)
    normalized.modelId = requiredString(filters.modelId, "modelId");
  if (filters.applicationId !== undefined)
    normalized.applicationId = requiredString(
      filters.applicationId,
      "applicationId",
    );
  if (filters.applicationType !== undefined)
    normalized.applicationType = normalizeApplicationType(
      filters.applicationType,
      "applicationType",
    );

  if (
    normalized.applicationId !== undefined &&
    normalized.applicationType === undefined
  ) {
    throwScopeError(
      "applicationType is required when applicationId is provided",
    );
  }

  if (
    normalized.applicationType !== undefined &&
    normalized.applicationId === undefined
  ) {
    throwScopeError(
      "applicationId is required when applicationType is provided",
    );
  }

  return normalized;
}

function normalizeUsageSummaryFilters(filters: {
  tenantId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  cycleMonth?: string;
  statType?: string;
}): {
  tenantId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  cycleMonth?: string;
  statType?: string;
} {
  const normalized: {
    tenantId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
    cycleMonth?: string;
    statType?: string;
  } = {};

  if (filters.tenantId !== undefined)
    normalized.tenantId = requiredString(filters.tenantId, "tenantId");
  if (filters.applicationId !== undefined)
    normalized.applicationId = requiredString(
      filters.applicationId,
      "applicationId",
    );
  if (filters.applicationType !== undefined)
    normalized.applicationType = normalizeApplicationType(
      filters.applicationType,
      "applicationType",
    );
  if (filters.cycleMonth !== undefined)
    normalized.cycleMonth = requiredString(filters.cycleMonth, "cycleMonth");
  if (filters.statType !== undefined)
    normalized.statType = requiredString(filters.statType, "statType");

  if (
    normalized.applicationId !== undefined &&
    normalized.applicationType === undefined
  ) {
    throwScopeError(
      "applicationType is required when applicationId is provided",
    );
  }

  if (
    normalized.applicationType !== undefined &&
    normalized.applicationId === undefined
  ) {
    throwScopeError(
      "applicationId is required when applicationType is provided",
    );
  }

  return normalized;
}

function sanitizeModelConfig(config: ModelConfig | null): ModelConfig | null {
  if (config === null) return null;

  return sanitizeConfigRecord(config);
}

function sanitizeWritableConfig(
  config: ModelConfig | null,
): ModelConfig | null {
  const sanitized = sanitizeModelConfig(config);
  if (sanitized === null) return null;
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function mergeModelConfig(
  config: ModelConfig | null,
  keyReferenceName: string | null | undefined,
): ModelConfig | null {
  if (keyReferenceName === undefined) return config;

  const nextConfig = { ...(config ?? {}) };
  delete nextConfig["apiKeyEnvVar"];

  if (keyReferenceName) {
    nextConfig["apiKeyEnvVar"] = keyReferenceName;
  }

  return Object.keys(nextConfig).length > 0 ? nextConfig : null;
}

function sanitizeConfigRecord(config: ModelConfig): ModelConfig {
  return Object.entries(config).reduce<ModelConfig>((result, [key, value]) => {
    if (SECRET_CONFIG_KEY_PATTERN.test(key)) return result;
    result[key] = sanitizeConfigValue(value);
    return result;
  }, {});
}

function sanitizeConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeConfigValue(item));
  }

  if (isPlainRecord(value)) {
    return sanitizeConfigRecord(value);
  }

  return value;
}

function readKeyReference(
  config: ModelConfig | null,
): ModelKeyReference | null {
  const apiKeyEnvVar = config?.["apiKeyEnvVar"];
  if (typeof apiKeyEnvVar !== "string" || !apiKeyEnvVar.trim()) return null;

  const name = apiKeyEnvVar.trim();
  return {
    source: "env",
    name,
    configured: Boolean(process.env[name]),
  };
}

function hasKeyReferenceInput(
  body: Pick<UpdateAiModelBody, "apiKeyEnvVar" | "keyReference">,
): boolean {
  return body.apiKeyEnvVar !== undefined || body.keyReference !== undefined;
}

function normalizeKeyReferenceName(
  body: Pick<CreateAiModelBody, "apiKeyEnvVar" | "keyReference">,
): string | null | undefined {
  if (body.keyReference !== undefined) {
    if (body.keyReference === null) return null;

    if (
      body.keyReference.source !== undefined &&
      body.keyReference.source !== "env"
    ) {
      throwValidationError("keyReference.source is invalid", "keyReference");
    }

    return optionalString(body.keyReference.name);
  }

  if (body.apiKeyEnvVar !== undefined) {
    return optionalString(body.apiKeyEnvVar);
  }

  return undefined;
}

function isPlainRecord(value: unknown): value is ModelConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeApplicationType(
  value: unknown,
  field: string,
): ApplicationType {
  const text = requiredString(value, field);
  if (!APPLICATION_TYPES.has(text as ApplicationType)) {
    throwValidationError(`${field} is invalid`, field);
  }

  return text as ApplicationType;
}

function validateApplicationScope(input: {
  applicationId?: string | null;
  applicationType?: ApplicationType | null;
  fieldPrefix?: string;
}): void {
  const hasApplicationId = Boolean(input.applicationId);
  const hasApplicationType = Boolean(input.applicationType);
  const prefix = input.fieldPrefix ? `${input.fieldPrefix}.` : "";

  if (hasApplicationId && !hasApplicationType) {
    throwScopeError(
      `${prefix}applicationType is required when applicationId is provided`,
    );
  }

  if (hasApplicationType && !hasApplicationId) {
    throwScopeError(
      `${prefix}applicationId is required when applicationType is provided`,
    );
  }
}

function throwValidationError(message: string, field: string): never {
  throw new ModelAdminException(
    HttpStatus.BAD_REQUEST,
    "MODEL_ADMIN_VALIDATION_FAILED",
    message,
    { field },
  );
}

function throwScopeError(message: string): never {
  throw new ModelAdminException(
    HttpStatus.BAD_REQUEST,
    "MODEL_ADMIN_SCOPE_INVALID",
    message,
  );
}
