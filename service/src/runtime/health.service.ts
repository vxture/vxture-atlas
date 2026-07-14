/**
 * health.service.ts - 模型平台健康检查编排
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category service
 * @author AI-Generated
 * @date 2026-06-06
 */

import { Inject, Injectable } from "@nestjs/common";

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

export interface ModelPlatformLiveResponse {
  status: "ok";
  checkedAt: string;
  service: "model-platform";
}

export interface ModelPlatformReadyResponse {
  status: ReadinessStatus;
  checkedAt: string;
  service: "model-platform";
  checks: {
    database: HealthCheckResult;
    modelRegistry: HealthCheckResult;
    providerKeys: HealthCheckResult;
    quotaRead: HealthCheckResult;
    usageSummaryRead: HealthCheckResult;
  };
}

@Injectable()
export class ModelPlatformHealthService {
  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  live(): ModelPlatformLiveResponse {
    return {
      status: "ok",
      checkedAt: new Date().toISOString(),
      service: "model-platform",
    };
  }

  async ready(): Promise<ModelPlatformReadyResponse> {
    const [database, modelRegistry, quotaRead, usageSummaryRead] =
      await Promise.all([
        this.checkDatabase(),
        this.checkModelRegistry(),
        this.checkQuotaRead(),
        this.checkUsageSummaryRead(),
      ]);
    const providerKeys =
      modelRegistry.status === "fail"
        ? { status: "fail" as const, message: "model registry unavailable" }
        : this.checkProviderKeys(modelRegistry.models as AiModelRecord[]);

    return {
      status: resolveReadinessStatus([
        database,
        modelRegistry,
        providerKeys,
        quotaRead,
        usageSummaryRead,
      ]),
      checkedAt: new Date().toISOString(),
      service: "model-platform",
      checks: {
        database,
        modelRegistry: omitPrivateCheckData(modelRegistry),
        providerKeys,
        quotaRead,
        usageSummaryRead,
      },
    };
  }

  diagnostics(): Promise<ModelPlatformReadyResponse> {
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
