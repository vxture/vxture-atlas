import { HttpStatus, Injectable, Logger } from "@nestjs/common";

import { prisma, type AiModelRow } from "../prisma";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import type {
  AiModelGrantRecord,
  AiModelRecord,
  ApplicationType,
  CreateAiModelGrantInput,
  CreateAiModelInput,
  CreateModelPolicyInput,
  CreateModelPriceRuleInput,
  CreateModelProviderInput,
  ModelPolicyRecord,
  ModelPriceRuleRecord,
  ModelProviderRecord,
  TenantSubscriptionQuotaRecord,
  TenantUsageEventRecord,
  TenantUsageSummaryRecord,
  UpdateAiModelGrantInput,
  UpdateAiModelInput,
  UpdateModelPolicyInput,
  UpdateModelPriceRuleInput,
  UpdateModelProviderInput,
  UsageLogInput,
} from "../types/runtime.types";

const COMMERCE_SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `model.model_grants.tenant_id`/`application_id` are `uuid` columns
 * (`deploy/database/ddl/00_baseline.sql`) with no FK (boundary #1) - nothing
 * validated the shape of these before they hit Postgres. A non-UUID value
 * (e.g. a caller's own composite tenant identifier instead of the platform's
 * actual UUID) previously crashed as an unhandled Prisma UUID-cast error,
 * surfacing as an opaque 500 (found live via karda's first real end-to-end
 * probe, `vxture-atlas`#47) instead of a clean 400.
 */
function assertUuid(value: string, code: "INVALID_TENANT_ID" | "INVALID_APPLICATION_ID", label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new ModelRuntimeException(
      HttpStatus.BAD_REQUEST,
      code,
      `${label} must be a UUID (got a non-UUID value) - use the platform tenant/workspace id from your token context, not an internal composite identifier`,
    );
  }
}

// model.models dropped the `provider` varchar column; provider identity is now the joined
// model_providers.provider_code. Every model read pulls it so AiModelRecord.provider stays populated.
const PROVIDER_INCLUDE = {
  providerRef: { select: { providerCode: true } },
} as const;

type UsagePersistenceInput = UsageLogInput & {
  applicationId: string;
  applicationType: ApplicationType;
  normalizedAgentId: string;
  normalizedFeatureId: string;
  cycleDate: Date;
  cycleMonth: string;
};

@Injectable()
export class ModelRegistryRepository {
  private readonly logger = new Logger(ModelRegistryRepository.name);

  checkDatabaseConnectivity(): Promise<void> {
    return prisma.$connect();
  }

  listProviders(includeInactive = false): Promise<ModelProviderRecord[]> {
    return prisma.modelProvider.findMany({
      where: includeInactive
        ? { deletedAt: null }
        : { isActive: true, deletedAt: null },
      orderBy: [
        { isActive: "desc" },
        { providerType: "asc" },
        { providerName: "asc" },
      ],
    });
  }

  findProviderById(providerId: string): Promise<ModelProviderRecord | null> {
    return prisma.modelProvider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
  }

  createProvider(
    input: CreateModelProviderInput,
  ): Promise<ModelProviderRecord> {
    return prisma.modelProvider.create({ data: input });
  }

  updateProvider(
    providerId: string,
    input: UpdateModelProviderInput,
  ): Promise<ModelProviderRecord> {
    return prisma.modelProvider.update({
      where: { id: providerId },
      data: input,
    });
  }

  deleteProvider(providerId: string): Promise<ModelProviderRecord> {
    return prisma.modelProvider.update({
      where: { id: providerId },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async findActiveModelByCode(
    modelCode: string,
  ): Promise<AiModelRecord | null> {
    const row = await prisma.modelDefinition.findFirst({
      where: {
        modelCode,
        isActive: true,
        deletedAt: null,
      },
      include: PROVIDER_INCLUDE,
    });

    return row ? mapAiModel(row) : null;
  }

  async listActiveModels(): Promise<AiModelRecord[]> {
    const rows = await prisma.modelDefinition.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: PROVIDER_INCLUDE,
    });

    return rows.map(mapAiModel);
  }

  async listModels(includeInactive = false): Promise<AiModelRecord[]> {
    const rows = await prisma.modelDefinition.findMany({
      where: includeInactive
        ? { deletedAt: null }
        : { isActive: true, deletedAt: null },
      orderBy: [
        { isActive: "desc" },
        // provider column retired → order by the joined provider_code (was `provider` asc).
        { providerRef: { providerCode: "asc" } },
        { createdAt: "desc" },
      ],
      include: PROVIDER_INCLUDE,
    });

    return rows.map(mapAiModel);
  }

  async findModelById(modelId: string): Promise<AiModelRecord | null> {
    const row = await prisma.modelDefinition.findFirst({
      where: {
        id: modelId,
        deletedAt: null,
      },
      include: PROVIDER_INCLUDE,
    });

    return row ? mapAiModel(row) : null;
  }

  async createModel(input: CreateAiModelInput): Promise<AiModelRecord> {
    const row = await prisma.modelDefinition.create({
      data: stripRetiredProvider(input),
      include: PROVIDER_INCLUDE,
    });

    return mapAiModel(row);
  }

  async updateModel(
    modelId: string,
    input: UpdateAiModelInput,
  ): Promise<AiModelRecord> {
    const row = await prisma.modelDefinition.update({
      where: {
        id: modelId,
      },
      data: stripRetiredProvider(input),
      include: PROVIDER_INCLUDE,
    });

    return mapAiModel(row);
  }

  deleteGrant(grantId: string): Promise<AiModelGrantRecord> {
    return prisma.modelGrant.update({
      where: { id: grantId },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
  }

  async deleteModel(modelId: string): Promise<AiModelRecord> {
    const deletedAt = new Date();

    return prisma.$transaction(async (tx) => {
      await tx.modelGrant.updateMany({
        where: {
          modelId,
          deletedAt: null,
        },
        data: {
          isActive: false,
          deletedAt,
        },
      });

      const row = await tx.modelDefinition.update({
        where: {
          id: modelId,
        },
        data: {
          isActive: false,
          deletedAt,
        },
        include: PROVIDER_INCLUDE,
      });

      return mapAiModel(row);
    });
  }

  async findBestGrant(
    modelId: string,
    tenantId: string,
    applicationId: string,
    applicationType: ApplicationType,
  ): Promise<AiModelGrantRecord | null> {
    assertUuid(tenantId, "INVALID_TENANT_ID", "tenantId");
    assertUuid(applicationId, "INVALID_APPLICATION_ID", "applicationId");

    const grants = await prisma.modelGrant.findMany({
      where: {
        modelId,
        tenantId,
        deletedAt: null,
        isActive: true,
        OR: [
          {
            applicationId,
            applicationType,
          },
          { applicationId: null, applicationType: null },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [
        { applicationId: "desc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      take: 2,
    });

    return (
      grants.find(
        (grant) =>
          grant.applicationId === applicationId &&
          grant.applicationType === applicationType,
      ) ??
      grants.find(
        (grant) =>
          grant.applicationId === null && grant.applicationType === null,
      ) ??
      null
    );
  }

  /**
   * Task-profile routing (docs/70-workplan): pick the modelCode for the
   * highest-priority active, non-expired grant matching `taskProfile` for
   * this tenant - preferring an exact application-scope match over the
   * tenant-wide wildcard (application_id/type both null), same precedence
   * `findBestGrant` uses for entitlement.
   */
  async findModelCodeForTaskProfile(
    taskProfile: string,
    tenantId: string,
    applicationId: string,
    applicationType: ApplicationType,
  ): Promise<string | null> {
    assertUuid(tenantId, "INVALID_TENANT_ID", "tenantId");
    assertUuid(applicationId, "INVALID_APPLICATION_ID", "applicationId");

    const grants = await prisma.modelGrant.findMany({
      where: {
        tenantId,
        taskProfile,
        deletedAt: null,
        isActive: true,
        modelDef: { isActive: true, deletedAt: null },
        OR: [
          { applicationId, applicationType },
          { applicationId: null, applicationType: null },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [
        { applicationId: "desc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      take: 2,
    });

    const picked =
      grants.find(
        (grant) =>
          grant.applicationId === applicationId &&
          grant.applicationType === applicationType,
      ) ??
      grants.find(
        (grant) =>
          grant.applicationId === null && grant.applicationType === null,
      ) ??
      null;

    if (!picked) {
      return null;
    }

    const model = await this.findModelById(picked.modelId);
    return model?.modelCode ?? null;
  }

  /**
   * Tenant-filtered "available models" list (docs/70-workplan): distinct
   * active models the tenant/application has an active, non-expired grant
   * for - not the global unfiltered catalog.
   */
  async listGrantedModels(filters: {
    tenantId: string;
    applicationId?: string;
    applicationType?: ApplicationType;
  }): Promise<AiModelRecord[]> {
    assertUuid(filters.tenantId, "INVALID_TENANT_ID", "tenantId");
    if (filters.applicationId) {
      assertUuid(filters.applicationId, "INVALID_APPLICATION_ID", "applicationId");
    }

    const grants = await prisma.modelGrant.findMany({
      where: {
        tenantId: filters.tenantId,
        deletedAt: null,
        isActive: true,
        modelDef: { isActive: true, deletedAt: null },
        OR: [
          filters.applicationId
            ? {
                applicationId: filters.applicationId,
                ...(filters.applicationType
                  ? { applicationType: filters.applicationType }
                  : {}),
              }
            : {},
          { applicationId: null, applicationType: null },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });

    const modelIds = [...new Set(grants.map((grant) => grant.modelId))];
    const models = await Promise.all(
      modelIds.map((modelId) => this.findModelById(modelId)),
    );

    return models.filter((model): model is AiModelRecord => model !== null);
  }

  listGrants(filters: {
    tenantId?: string;
    modelId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
  }): Promise<AiModelGrantRecord[]> {
    return prisma.modelGrant.findMany({
      where: {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.modelId ? { modelId: filters.modelId } : {}),
        ...(filters.applicationId
          ? { applicationId: filters.applicationId }
          : {}),
        ...(filters.applicationType
          ? { applicationType: filters.applicationType }
          : {}),
        deletedAt: null,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
  }

  findGrantById(grantId: string): Promise<AiModelGrantRecord | null> {
    return prisma.modelGrant.findFirst({
      where: {
        id: grantId,
        deletedAt: null,
      },
    });
  }

  createGrant(input: CreateAiModelGrantInput): Promise<AiModelGrantRecord> {
    return prisma.modelGrant.create({
      data: {
        modelId: input.modelId,
        tenantId: input.tenantId,
        applicationId: input.applicationId ?? input.agentId ?? null,
        applicationType:
          input.applicationType ?? (input.agentId ? "agent" : null),
        agentId: input.agentId ?? null,
        taskProfile: input.taskProfile ?? null,
        priority: input.priority ?? 100,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  updateGrant(
    grantId: string,
    input: UpdateAiModelGrantInput,
  ): Promise<AiModelGrantRecord> {
    return prisma.modelGrant.update({
      where: {
        id: grantId,
      },
      data: input,
    });
  }

  listPriceRules(filters: {
    modelId?: string;
    includeInactive?: boolean;
  }): Promise<ModelPriceRuleRecord[]> {
    return prisma.modelPriceRule.findMany({
      where: {
        ...(filters.modelId ? { modelId: filters.modelId } : {}),
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [
        { isActive: "desc" },
        { effectiveAt: "desc" },
        { createdAt: "desc" },
      ],
    });
  }

  findPriceRuleById(priceRuleId: string): Promise<ModelPriceRuleRecord | null> {
    return prisma.modelPriceRule.findFirst({
      where: { id: priceRuleId },
    });
  }

  createPriceRule(
    input: CreateModelPriceRuleInput,
  ): Promise<ModelPriceRuleRecord> {
    return prisma.modelPriceRule.create({ data: input });
  }

  updatePriceRule(
    priceRuleId: string,
    input: UpdateModelPriceRuleInput,
  ): Promise<ModelPriceRuleRecord> {
    return prisma.modelPriceRule.update({
      where: { id: priceRuleId },
      data: input,
    });
  }

  listPolicies(filters: {
    modelId?: string;
    tenantId?: string;
    includeInactive?: boolean;
  }): Promise<ModelPolicyRecord[]> {
    return prisma.modelPolicy.findMany({
      where: {
        ...(filters.modelId ? { modelId: filters.modelId } : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [
        { isActive: "desc" },
        { priority: "asc" },
        { effectiveAt: "desc" },
      ],
    });
  }

  findPolicyById(policyId: string): Promise<ModelPolicyRecord | null> {
    return prisma.modelPolicy.findFirst({
      where: { id: policyId },
    });
  }

  createPolicy(input: CreateModelPolicyInput): Promise<ModelPolicyRecord> {
    return prisma.modelPolicy.create({ data: input });
  }

  updatePolicy(
    policyId: string,
    input: UpdateModelPolicyInput,
  ): Promise<ModelPolicyRecord> {
    return prisma.modelPolicy.update({
      where: { id: policyId },
      data: input,
    });
  }

  /**
   * Bulk quota listing for the operator surface (`/capability/quotas`).
   *
   * Always empty (TD-002/TD-005, 2026-07-28 cleanup): this used to be
   * documented as a temporary fail-open pending the platform's
   * `product.agent_catalog` mapping. That framing no longer applies - real
   * per-workspace quota resolution now exists via C2
   * (`PlatformEntitlementClient`, TD-016), but C2 only answers "this one
   * workspace" and the platform exposes no bulk/list entitlements endpoint
   * (checked directly against `platform-entitlements.router.ts`: a single
   * `GET /platform/entitlements?workspace_id=`, nothing else). There is
   * currently no way to answer "every tenant's quota" at all, not a
   * temporary gap - `ModelAdminService.listTenantQuotas` reports this
   * honestly as 501 rather than serving this empty array as if it meant "no
   * tenant has a quota".
   */
  listSubscriptionQuotas(_filters: {
    tenantId?: string;
    includeExpired?: boolean;
  }): Promise<TenantSubscriptionQuotaRecord[]> {
    return Promise.resolve([]);
  }

  /**
   * Tenant self-service usage, aggregated from Atlas's own request log.
   *
   * Deliberately NOT read from `listUsageSummaries` (which is a stub returning
   * `[]` - the platform-side mirror was removed in the DB split, TD-005): that
   * would serve an empty page and look like "no usage" rather than "not
   * wired". `reqlog.request_records` is real data Atlas actually writes
   * (TD-017), so this answers the question honestly.
   *
   * `scopeColumn` is chosen by the caller from a fixed pair - never
   * interpolated from request input - and `scopeId` is bound as a parameter.
   */
  aggregateReqlogUsage(params: {
    scopeColumn: "tenant_id" | "workspace_id";
    scopeId: string;
    from: Date;
    to: Date;
  }): Promise<
    Array<{
      modelCode: string | null;
      providerCode: string | null;
      requests: bigint;
      inputTokens: bigint | null;
      outputTokens: bigint | null;
      totalTokens: bigint | null;
      errors: bigint;
    }>
  > {
    const column = params.scopeColumn === "tenant_id" ? "tenant_id" : "workspace_id";
    return prisma.$queryRawUnsafe(
      `
      SELECT
        model_code                                   AS "modelCode",
        provider_code                                AS "providerCode",
        count(*)                                     AS "requests",
        coalesce(sum(input_tokens), 0)               AS "inputTokens",
        coalesce(sum(output_tokens), 0)              AS "outputTokens",
        coalesce(sum(total_tokens), 0)               AS "totalTokens",
        count(*) FILTER (WHERE status <> 'success')  AS "errors"
      FROM reqlog.request_records
      WHERE ${column} = $1::uuid
        AND created_at >= $2 AND created_at < $3
      GROUP BY model_code, provider_code
      ORDER BY "totalTokens" DESC, model_code
      `,
      params.scopeId,
      params.from,
      params.to,
    );
  }

  /**
   * TD-018: reqlog partition runway + DEFAULT-partition occupancy, for the
   * readiness check. Reads `pg_inherits` because partitions have no Prisma
   * model. The query is a constant - nothing here is caller-derived.
   *
   * The partition month is recovered from the child's own name suffix, which
   * `reqlog.ensure_partitions` generates (see
   * `deploy/database/ddl/incr/02_reqlog_partition_maintenance.sql`), so naming
   * and parsing stay a closed loop.
   */
  readReqlogPartitionRunway(): Promise<
    Array<{ monthsAhead: bigint | number; defaultPartitionRows: bigint | number }>
  > {
    return prisma.$queryRawUnsafe(`
      SELECT
        (SELECT count(*)
           FROM pg_inherits inh
           JOIN pg_class c      ON c.oid = inh.inhrelid
           JOIN pg_class parent ON parent.oid = inh.inhparent
           JOIN pg_namespace n  ON n.oid = c.relnamespace
          WHERE n.nspname = 'reqlog'
            AND parent.relname = 'request_records'
            AND c.relname ~ '_y[0-9]{4}m[0-9]{2}$'
            AND to_date(right(c.relname, 8), '"y"YYYY"m"MM')
                >= date_trunc('month', now())::date
        ) AS "monthsAhead",
        (SELECT count(*) FROM ONLY reqlog.request_records_default)
          AS "defaultPartitionRows"
    `);
  }

  listUsageSummaries(_filters: {
    tenantId?: string;
    applicationId?: string;
    applicationType?: ApplicationType;
    cycleMonth?: string;
    statType?: string;
  }): Promise<TenantUsageSummaryRecord[]> {
    return Promise.resolve([]);
  }

  /**
   * FLAG (usage write disabled post-cutover): metering.usage_events requires workspace_id +
   * product_id + metric_key, each with a real cross-schema FK (tenancy.workspaces / product.products),
   * plus an append-only guard trigger. This service only has tenantId and cannot satisfy those keys
   * yet, so writing bogus/sentinel ids would violate the FKs. Until the tenant→workspace / product /
   * metric mapping lands (commerce 域解耦重构), usage is not persisted. Chat requests still succeed;
   * usage is simply unmetered. Re-implement here against usage_events + usage_summary_* once the
   * mapping is available.
   */
  async recordUsage(
    _input: UsagePersistenceInput,
  ): Promise<TenantUsageEventRecord | null> {
    this.logger.warn(
      "usage metering skipped: metering.usage_events integration pending (needs workspace_id/product_id/metric_key mapping)",
    );
    return null;
  }

  /**
   * FLAG: summary write disabled post-cutover (same reason as recordUsage). Returns an in-memory
   * projection of the increment; nothing is persisted. Kept for API stability.
   */
  upsertUsageSummary(input: {
    tenantId: string;
    applicationId: string;
    applicationType: ApplicationType;
    agentId: string;
    featureId: string;
    cycleMonth: string;
    statType: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): Promise<TenantUsageSummaryRecord> {
    return Promise.resolve({
      id: COMMERCE_SENTINEL_UUID,
      tenantId: input.tenantId,
      featureId: input.featureId,
      applicationId: input.applicationId,
      applicationType: input.applicationType,
      agentId: input.agentId,
      cycleMonth: input.cycleMonth,
      totalQuota: BigInt(input.usage.totalTokens),
      inputQuota: BigInt(input.usage.promptTokens),
      outputQuota: BigInt(input.usage.completionTokens),
      requestCount: 1n,
      statType: input.statType,
    });
  }
}

/** model.models row → AiModelRecord, deriving `provider` from the joined provider_code. */
function mapAiModel(row: AiModelRow): AiModelRecord {
  const { providerRef, ...rest } = row;
  return { ...rest, provider: providerRef?.providerCode ?? "" };
}

/** Drop the retired `provider` column before writing model.models. */
function stripRetiredProvider(
  input: CreateAiModelInput | UpdateAiModelInput,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...input };
  delete data["provider"];
  return data;
}
