import { PrismaClient as PrismaClientImpl } from "./generated/prisma";
import type {
  AiModelGrantRecord,
  AiModelRecord,
  ModelPolicyRecord,
  ModelPriceRuleRecord,
  ModelProviderRecord,
} from "./types/runtime.types";

// AiModelRecord / AiModelGrantRecord are kept as-is for backward compat with callers.
// The Prisma delegate names match the new model schema: modelDefinition / modelGrant.
//
// Post-cutover the DB rows no longer match the service's public *Record shapes 1:1:
//   - model.models dropped the redundant `provider` varchar column → AiModelRow omits it
//     and carries the joined providerRef; the repository derives AiModelRecord.provider.
//
// There used to be tenantSubscriptionQuota/tenantUsageEvent/tenantUsageSummary delegates
// here, type-asserted onto this same generated client via `as unknown as`. They never had
// a real backing model in schema.prisma - Atlas's own DB has no metering.quota_pools/
// usage_events/usage_summary_months (those live in the platform's DB, and Atlas cannot
// cross-database FK into them, boundary #1). The assertion satisfied the compiler; calling
// any of those three delegates threw at runtime (TD-005). Removed 2026-07-24 along with the
// call sites in model-registry.repository.ts, which now fail-open instead - see the platform
// architecture's own documented doctrine in data_model_200_schema.md §3 ("同步 + 有界本地
// fail-open + 异步对账"). A real fix (C2 entitlement read + C3 consume write) is blocked on
// the platform's product.agent_catalog (application/agent → product mapping), which per
// data_model_200_schema.md §2 has not landed yet - see TD-002/TD-005.

/** model.models row (no `provider` scalar; provider derived from the joined providerRef). */
export type AiModelRow = Omit<AiModelRecord, "provider"> & {
  providerRef?: { providerCode: string } | null;
};

/** provisioning.workspace_provisionings row (TD-003, C3 provisioning webhook receiver). */
export interface WorkspaceProvisioningRow {
  id: string;
  workspaceId: string;
  tenantId: string | null;
  productCode: string;
  status: string;
  seq: bigint;
  provisionedAt: Date | null;
  deprovisionedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** provisioning.webhook_deliveries row (append-only idempotency ledger). */
export interface WebhookDeliveryRow {
  id: string;
  deliveryId: string;
  workspaceId: string;
  productCode: string;
  eventType: string;
  seq: bigint;
  receivedAt: Date;
}

/** key.provider_api_keys row - encryptedKey is envelope-encrypted ciphertext, never plaintext. */
export interface ProviderApiKeyRow {
  id: string;
  providerCode: string;
  keyAlias: string;
  encryptedKey: Buffer;
  encryptionKeyId: string;
  keyScope: string;
  isActive: boolean;
  lastRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** key.key_rotation_logs row (append-only audit trail). */
export interface KeyRotationLogRow {
  id: string;
  providerApiKeyId: string;
  rotatedBy: string | null;
  reason: string | null;
  rotatedAt: Date;
}

/**
 * reqlog.request_records row (TD-017) - Atlas's own per-request history, the
 * detail layer of the metering split (docs/30-design/210-usage-metering-and-history.md).
 * Unlike the three metering delegates removed above, these two DO have real
 * backing models in schema.prisma and real partitioned tables in this repo's
 * own database - they are Atlas's to write, not the platform's.
 */
export interface RequestRecordRow {
  id: string;
  requestId: string;
  tenantId: string | null;
  workspaceId: string | null;
  productId: string | null;
  userId: string | null;
  applicationId: string | null;
  applicationType: string | null;
  agentId: string | null;
  featureId: string | null;
  downstreamIdentityHash: string | null;
  modelCode: string | null;
  providerCode: string | null;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  totalTokens: bigint | null;
  latencyMs: number | null;
  usageType: string | null;
  status: string | null;
  businessId: string | null;
  billedMetricKey: string | null;
  billedAmount: bigint | null;
  usageEventId: string | null;
  createdAt: Date;
}

/** reqlog.error_records row (TD-017). */
export interface ErrorRecordRow {
  id: string;
  requestId: string | null;
  providerCode: string | null;
  modelCode: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

type PrismaArgs = Record<string, unknown>;

interface PrismaMutationResult {
  count: number;
}

interface PrismaDelegate<TRecord> {
  findFirst(args: PrismaArgs): Promise<TRecord | null>;
  findMany(args?: PrismaArgs): Promise<TRecord[]>;
  create(args: PrismaArgs): Promise<TRecord>;
  update(args: PrismaArgs): Promise<TRecord>;
  updateMany(args: PrismaArgs): Promise<PrismaMutationResult>;
  upsert(args: PrismaArgs): Promise<TRecord>;
}

export interface AtlasPrismaClient {
  modelProvider: PrismaDelegate<ModelProviderRecord>;
  modelDefinition: PrismaDelegate<AiModelRow>;
  modelGrant: PrismaDelegate<AiModelGrantRecord>;
  modelPriceRule: PrismaDelegate<ModelPriceRuleRecord>;
  modelPolicy: PrismaDelegate<ModelPolicyRecord>;
  workspaceProvisioning: PrismaDelegate<WorkspaceProvisioningRow>;
  webhookDelivery: PrismaDelegate<WebhookDeliveryRow>;
  providerApiKey: PrismaDelegate<ProviderApiKeyRow>;
  keyRotationLog: PrismaDelegate<KeyRotationLogRow>;
  requestRecord: PrismaDelegate<RequestRecordRow>;
  errorRecord: PrismaDelegate<ErrorRecordRow>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  /**
   * Only for fixed, constant catalogue queries with no interpolation - the
   * reqlog partition-runway readiness check (TD-018) reads `pg_inherits`,
   * which has no Prisma model. Never pass caller-derived input here.
   */
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $transaction<T>(
    fn: (tx: AtlasPrismaClient) => Promise<T>,
  ): Promise<T>;
}

declare global {
  var __vxtureAtlasPrisma: AtlasPrismaClient | undefined;
}

export const prisma: AtlasPrismaClient =
  globalThis.__vxtureAtlasPrisma ??
  (new PrismaClientImpl() as unknown as AtlasPrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalThis.__vxtureAtlasPrisma = prisma;
}
