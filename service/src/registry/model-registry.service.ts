import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryRepository } from "./model-registry.repository";
import type { AiModelRecord } from "../types/runtime.types";
import { ModelRuntimeException } from "../runtime/runtime.errors";

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
}
