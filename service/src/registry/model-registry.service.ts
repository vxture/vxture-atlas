import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryRepository } from "./model-registry.repository";
import type { AiModelRecord, ApplicationType } from "../types/runtime.types";
import { ModelRuntimeException } from "../runtime/runtime.errors";

export interface ResolveModelCodeForTaskProfileInput {
  tenantId: string;
  taskProfile: string;
  applicationId: string;
  applicationType: ApplicationType;
}

@Injectable()
export class ModelRegistryService {
  constructor(
    @Inject(ModelRegistryRepository)
    private readonly repository: ModelRegistryRepository,
  ) {}

  async getActiveModel(modelCode: string): Promise<AiModelRecord> {
    const model = await this.repository.findActiveModelByCode(modelCode);

    if (!model) {
      throw new ModelRuntimeException(
        HttpStatus.NOT_FOUND,
        "MODEL_NOT_ROUTABLE",
        `AI model "${modelCode}" is not registered or inactive`,
        { modelCode },
      );
    }

    return model;
  }

  listActiveModels(): Promise<AiModelRecord[]> {
    return this.repository.listActiveModels();
  }

  /**
   * Task-profile routing (docs/70-workplan): resolve a modelCode from the
   * tenant's active `model_grants.task_profile` match instead of requiring
   * the caller to pass an explicit modelCode. Picks the highest-priority
   * (lowest `priority` number) active, non-expired grant scoped to the exact
   * application (or the tenant-wide wildcard grant), same precedence as
   * `QuotaService.assertAllowed`'s entitlement lookup.
   */
  async resolveModelCodeForTaskProfile(
    input: ResolveModelCodeForTaskProfileInput,
  ): Promise<string> {
    const modelCode = await this.repository.findModelCodeForTaskProfile(
      input.taskProfile,
      input.tenantId,
      input.applicationId,
      input.applicationType,
    );

    if (!modelCode) {
      throw new ModelRuntimeException(
        HttpStatus.NOT_FOUND,
        "TASK_PROFILE_NOT_ROUTABLE",
        `No active model grant matches taskProfile "${input.taskProfile}" for this tenant/application`,
      );
    }

    return modelCode;
  }

  /**
   * Tenant-filtered "available models" list (docs/70-workplan): the models a
   * tenant/application is actually entitled to call today, derived from
   * active non-expired `model_grants` - not the full unfiltered catalog
   * `listActiveModels()` returns.
   */
  listModelsForTenant(filters: {
    tenantId: string;
    applicationId?: string;
    applicationType?: ApplicationType;
  }): Promise<AiModelRecord[]> {
    return this.repository.listGrantedModels(filters);
  }
}
