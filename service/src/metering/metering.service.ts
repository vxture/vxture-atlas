import { Inject, Injectable } from "@nestjs/common";

import {
  normalizeUuidScope,
  resolveApplicationScope,
  toCycleMonth,
} from "../quota/quota.service";
import { ModelRegistryRepository } from "../registry/model-registry.repository";
import type { UsageLogInput } from "../types/runtime.types";

@Injectable()
export class MeteringService {
  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  async record(input: UsageLogInput): Promise<void> {
    const now = new Date();
    const cycleDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const cycleMonth = toCycleMonth(now);
    const applicationScope = resolveApplicationScope(input);
    const normalizedAgentId = normalizeUuidScope(applicationScope.agentId);
    const normalizedFeatureId = normalizeUuidScope(input.featureId);

    await this.repository.recordUsage({
      ...input,
      applicationId: applicationScope.applicationId,
      applicationType: applicationScope.applicationType,
      normalizedAgentId,
      normalizedFeatureId,
      cycleDate,
      cycleMonth,
    });
  }
}
