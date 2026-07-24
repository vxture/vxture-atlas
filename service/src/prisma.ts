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
  workspaceProvisioning: PrismaDelegate<WorkspaceProvisioningRow>;
  webhookDelivery: PrismaDelegate<WebhookDeliveryRow>;
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
