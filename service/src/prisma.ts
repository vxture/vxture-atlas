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
//   - metering.quota_pools / usage_events / usage_summary_months replace the old commerce
//     tables with a workspace+product+metric model → the delegates below expose the real
//     new columns (QuotaPoolRow / UsageEventRow / UsageSummaryRow); the repository maps them
//     onto the legacy *Record contracts (see model-registry.repository.ts FLAG comments).

/** model.models row (no `provider` scalar; provider derived from the joined providerRef). */
export type AiModelRow = Omit<AiModelRecord, "provider"> & {
  providerRef?: { providerCode: string } | null;
};

/** metering.quota_pools row. */
export interface QuotaPoolRow {
  id: string;
  workspaceId: string;
  subscriptionId: string | null;
  productId: string;
  metricKey: string;
  quotaLimit: bigint;
  quotaUsed: bigint;
  priority: number;
  componentRole: string;
  poolSource: string;
  resetPeriod: string;
  periodAnchor: Date | null;
  currentPeriodStart: Date | null;
  status: string;
  retiredAt: Date | null;
  grantedBy: string | null;
  grantReason: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** metering.usage_events row (append-only, month-partitioned; write path pending integration). */
export interface UsageEventRow {
  id: string;
  workspaceId: string;
  productId: string;
  metricKey: string;
  totalAmount: bigint;
  requestedAmount: bigint | null;
  idempotencyKey: string | null;
  requestId: string | null;
  createdAt: Date;
}

/** metering.usage_summary_months row. */
export interface UsageSummaryRow {
  id: string;
  workspaceId: string;
  productId: string;
  metricKey: string;
  periodMonth: string;
  totalAmount: bigint;
  createdAt: Date;
  updatedAt: Date;
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

export interface ModelPlatformPrismaClient {
  modelProvider: PrismaDelegate<ModelProviderRecord>;
  modelDefinition: PrismaDelegate<AiModelRow>;
  modelGrant: PrismaDelegate<AiModelGrantRecord>;
  modelPriceRule: PrismaDelegate<ModelPriceRuleRecord>;
  modelPolicy: PrismaDelegate<ModelPolicyRecord>;
  tenantSubscriptionQuota: PrismaDelegate<QuotaPoolRow>;
  tenantUsageEvent: PrismaDelegate<UsageEventRow>;
  tenantUsageSummary: PrismaDelegate<UsageSummaryRow>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(
    fn: (tx: ModelPlatformPrismaClient) => Promise<T>,
  ): Promise<T>;
}

declare global {
  var __vxtureModelPlatformPrisma: ModelPlatformPrismaClient | undefined;
}

export const prisma: ModelPlatformPrismaClient =
  globalThis.__vxtureModelPlatformPrisma ??
  (new PrismaClientImpl() as unknown as ModelPlatformPrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalThis.__vxtureModelPlatformPrisma = prisma;
}
