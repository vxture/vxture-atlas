/**
 * health.service.ts - 模型平台健康检查编排
 * @package @atlas/service
 * @layer Domain
 * @category service
 * @author AI-Generated
 * @date 2026-06-06
 */

import { Inject, Injectable } from "@nestjs/common";
import {
  buildHealthIdentity,
  serviceIdentity,
  type HealthLiveResponse,
  type ServiceIdentity,
} from "@vxture/shared";

import { ModelRegistryRepository } from "../registry/model-registry.repository";
import type { AiModelRecord, ModelConfig } from "../types/runtime.types";

export type HealthCheckStatus = "pass" | "warn" | "fail";
export type ReadinessStatus = "ready" | "degraded" | "blocked";

export interface HealthCheckResult {
  status: HealthCheckStatus;
  latencyMs?: number;
  message?: string;
  [key: string]: unknown;
}

// Liveness + identity per standard 025.
export type AtlasLiveResponse = HealthLiveResponse;

// Readiness = identity block + per-dependency checks (standard 025 §3).
export interface AtlasReadyResponse extends ServiceIdentity {
  status: ReadinessStatus;
  checks: {
    database: HealthCheckResult;
    modelRegistry: HealthCheckResult;
    providerKeys: HealthCheckResult;
    quotaRead: HealthCheckResult;
    usageSummaryRead: HealthCheckResult;
    reqlogPartitions: HealthCheckResult;
  };
}

@Injectable()
export class AtlasHealthService {
  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  live(): AtlasLiveResponse {
    return buildHealthIdentity({
      service: "atlas",
      product: "vxture",
    });
  }

  async ready(): Promise<AtlasReadyResponse> {
    const [
      database,
      modelRegistry,
      quotaRead,
      usageSummaryRead,
      reqlogPartitions,
    ] =
      await Promise.all([
        this.checkDatabase(),
        this.checkModelRegistry(),
        this.checkQuotaRead(),
        this.checkUsageSummaryRead(),
        this.checkReqlogPartitions(),
      ]);
    const providerKeys =
      modelRegistry.status === "fail"
        ? { status: "fail" as const, message: "model registry unavailable" }
        : this.checkProviderKeys(modelRegistry.models as AiModelRecord[]);

    return {
      ...serviceIdentity({ service: "atlas", product: "vxture" }),
      status: resolveReadinessStatus([
        database,
        modelRegistry,
        providerKeys,
        quotaRead,
        usageSummaryRead,
        reqlogPartitions,
      ]),
      checks: {
        database,
        modelRegistry: omitPrivateCheckData(modelRegistry),
        providerKeys,
        quotaRead,
        usageSummaryRead,
        reqlogPartitions,
      },
    };
  }

  diagnostics(): Promise<AtlasReadyResponse> {
    return this.ready();
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      await this.repository.checkDatabaseConnectivity();
      return { status: "pass", latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: "fail",
        latencyMs: Date.now() - startedAt,
        message: errorMessage(error),
      };
    }
  }

  private async checkModelRegistry(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const models = await this.repository.listActiveModels();
      if (models.length === 0) {
        return {
          status: "fail",
          latencyMs: Date.now() - startedAt,
          activeModels: 0,
          models,
          message: "active model registry is empty",
        };
      }

      return {
        status: "pass",
        latencyMs: Date.now() - startedAt,
        activeModels: models.length,
        models,
      };
    } catch (error) {
      return {
        status: "fail",
        latencyMs: Date.now() - startedAt,
        message: errorMessage(error),
      };
    }
  }

  private checkProviderKeys(models: AiModelRecord[]): HealthCheckResult {
    const keyNames = [
      ...new Set(
        models
          .map((model) => readKeyReferenceName(model.config))
          .filter((name): name is string => Boolean(name)),
      ),
    ].sort();
    const missing = keyNames.filter((name) => !process.env[name]);

    if (missing.length > 0) {
      return {
        status: "fail",
        checkedKeys: keyNames.length,
        missing,
        message: "provider key reference is not configured in runtime env",
      };
    }

    return {
      status: "pass",
      checkedKeys: keyNames.length,
      missing: [],
    };
  }

  /**
   * TD-018: reqlog partitions are pre-built a fixed number of months ahead.
   * When they run out, **nothing errors** - rows silently land in the DEFAULT
   * partition and keep working, while drop-based retention quietly stops
   * being possible. That silence is the actual defect, so it gets a readiness
   * signal rather than relying on someone remembering the calendar.
   *
   * Two independent signals:
   *  - `monthsAhead`: how much runway is left. Low = act soon.
   *  - `defaultPartitionRows`: must be 0. Any row here means a write already
   *    landed with no proper partition - retention is broken *now*, not soon.
   */
  private async checkReqlogPartitions(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const [row] = await this.repository.readReqlogPartitionRunway();
      const monthsAhead = Number(row?.monthsAhead ?? 0);
      const defaultPartitionRows = Number(row?.defaultPartitionRows ?? 0);
      const latencyMs = Date.now() - startedAt;

      if (defaultPartitionRows > 0) {
        return {
          status: "fail",
          latencyMs,
          monthsAhead,
          defaultPartitionRows,
          message:
            "reqlog rows landed in the DEFAULT partition - explicit partitions were missing, so drop-based retention is already broken (TD-018); run db-init to extend partitions, then relocate these rows",
        };
      }

      if (monthsAhead < 2) {
        return {
          status: "warn",
          latencyMs,
          monthsAhead,
          defaultPartitionRows,
          message: `only ${monthsAhead} month(s) of reqlog partitions remain - run db-init to extend before they run out (TD-018)`,
        };
      }

      return { status: "pass", latencyMs, monthsAhead, defaultPartitionRows };
    } catch (error) {
      return {
        status: "fail",
        latencyMs: Date.now() - startedAt,
        message: errorMessage(error),
      };
    }
  }

  private async checkQuotaRead(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const quotas = await this.repository.listSubscriptionQuotas({
        includeExpired: false,
      });
      return {
        status: "pass",
        latencyMs: Date.now() - startedAt,
        activeQuotas: quotas.length,
      };
    } catch (error) {
      return {
        status: "fail",
        latencyMs: Date.now() - startedAt,
        message: errorMessage(error),
      };
    }
  }

  private async checkUsageSummaryRead(): Promise<HealthCheckResult> {
    const startedAt = Date.now();
    try {
      const summaries = await this.repository.listUsageSummaries({
        statType: "summary",
      });
      return {
        status: "pass",
        latencyMs: Date.now() - startedAt,
        summaries: summaries.length,
      };
    } catch (error) {
      return {
        status: "fail",
        latencyMs: Date.now() - startedAt,
        message: errorMessage(error),
      };
    }
  }
}

function resolveReadinessStatus(checks: HealthCheckResult[]): ReadinessStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "blocked";
  }

  if (checks.some((check) => check.status === "warn")) {
    return "degraded";
  }

  return "ready";
}

function readKeyReferenceName(config: ModelConfig | null): string | null {
  const value = config?.["apiKeyEnvVar"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function omitPrivateCheckData(check: HealthCheckResult): HealthCheckResult {
  const publicCheck = { ...check };
  delete publicCheck["models"];
  return publicCheck;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
