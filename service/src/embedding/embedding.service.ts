import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import { QuotaService } from "../quota/quota.service";
import {
  resolveGatedModel,
  toS2sProviderError,
} from "../runtime/s2s-provider.shared";
import type { EmbedRequest, EmbedResponse } from "./embedding.types";

@Injectable()
export class EmbeddingService {
  constructor(
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
    @Inject(ModelRouterService)
    private readonly router: ModelRouterService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
  ) {}

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    this.validate(request);

    const gated = await resolveGatedModel(
      { registry: this.registry, router: this.router, quota: this.quota },
      { ...request, tenantId: request.workspaceId },
    );

    try {
      const result = await gated.provider.embed({
        endpointUrl: gated.model.endpointUrl,
        apiKey: gated.apiKey,
        modelCode: gated.model.modelCode,
        texts: request.texts,
        ...(gated.model.config != null ? { config: gated.model.config } : {}),
      });

      return {
        modelCode: gated.model.modelCode,
        modelVersion: result.modelVersion,
        dimension: result.dimension,
        vectors: result.vectors,
      };
    } catch (error) {
      throw toS2sProviderError(error, gated.model, gated.requestId);
    }
  }

  private validate(request: EmbedRequest): void {
    if (typeof request.modelCode !== "string" || !request.modelCode.trim()) {
      throw new BadRequestException("modelCode is required");
    }

    if (typeof request.workspaceId !== "string" || !request.workspaceId.trim()) {
      throw new BadRequestException("workspaceId is required");
    }

    if (!Array.isArray(request.texts) || request.texts.length === 0) {
      throw new BadRequestException("texts cannot be empty");
    }

    if (request.texts.some((text) => typeof text !== "string")) {
      throw new BadRequestException("texts must be an array of strings");
    }
  }
}
