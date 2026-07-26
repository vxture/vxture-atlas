import { BadRequestException, HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import { QuotaService } from "../quota/quota.service";
import { ProviderKeyService } from "../provider-keys/provider-key.service";
import {
  resolveGatedModel,
  toS2sProviderError,
} from "../runtime/s2s-provider.shared";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import {
  RERANK_CANDIDATE_POOL_LIMIT,
  type RerankRequest,
  type RerankResponse,
} from "./rerank.types";

@Injectable()
export class RerankService {
  constructor(
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
    @Inject(ModelRouterService)
    private readonly router: ModelRouterService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
    @Inject(ProviderKeyService)
    private readonly providerKeys: ProviderKeyService,
  ) {}

  async rerank(request: RerankRequest): Promise<RerankResponse> {
    this.validate(request);

    const gated = await resolveGatedModel(
      {
        registry: this.registry,
        router: this.router,
        quota: this.quota,
        providerKeys: this.providerKeys,
      },
      { ...request, tenantId: request.workspaceId },
    );

    try {
      const result = await gated.provider.rerank({
        endpointUrl: gated.model.endpointUrl,
        apiKey: gated.apiKey,
        modelCode: gated.model.modelCode,
        query: request.query,
        candidates: request.candidates,
        ...(gated.model.config != null ? { config: gated.model.config } : {}),
      });

      return { modelCode: gated.model.modelCode, scores: result.scores };
    } catch (error) {
      throw toS2sProviderError(error, gated.model, gated.requestId);
    }
  }

  private validate(request: RerankRequest): void {
    if (typeof request.modelCode !== "string" || !request.modelCode.trim()) {
      throw new BadRequestException("modelCode is required");
    }

    if (typeof request.workspaceId !== "string" || !request.workspaceId.trim()) {
      throw new BadRequestException("workspaceId is required");
    }

    if (typeof request.query !== "string" || !request.query.trim()) {
      throw new BadRequestException("query is required");
    }

    if (!Array.isArray(request.candidates) || request.candidates.length === 0) {
      throw new BadRequestException("candidates cannot be empty");
    }

    // A3.2 hard constraint - reject, never silently truncate.
    if (request.candidates.length > RERANK_CANDIDATE_POOL_LIMIT) {
      throw new ModelRuntimeException(
        HttpStatus.BAD_REQUEST,
        "CANDIDATE_POOL_TOO_LARGE",
        `candidates cannot exceed ${RERANK_CANDIDATE_POOL_LIMIT} (got ${request.candidates.length})`,
        { modelCode: request.modelCode },
      );
    }

    const invalidCandidate = request.candidates.some(
      (candidate) =>
        typeof candidate.id !== "string" ||
        !candidate.id.trim() ||
        typeof candidate.text !== "string",
    );
    if (invalidCandidate) {
      throw new BadRequestException(
        "candidates must each have a non-empty id and a text string",
      );
    }
  }
}
