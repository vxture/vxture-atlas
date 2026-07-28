import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import { QuotaService } from "../quota/quota.service";
import { ProviderKeyService } from "../provider-keys/provider-key.service";
import {
  resolveGatedModel,
  toS2sProviderError,
  withRequestLog,
} from "../runtime/s2s-provider.shared";
import { RequestLogService } from "../reqlog/request-log.service";
import type { S2sAuthContext } from "../runtime/guards/s2s-auth.guard";
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
    @Inject(ProviderKeyService)
    private readonly providerKeys: ProviderKeyService,
    @Inject(RequestLogService)
    private readonly requestLog: RequestLogService,
  ) {}

  async embed(
    request: EmbedRequest,
    auth?: S2sAuthContext,
  ): Promise<EmbedResponse> {
    this.validate(request);

    // A1/A2/A3 address the caller by workspaceId; the gate (and reqlog) speak
    // tenantId. Normalize once so the grant lookup and the recorded row agree -
    // they must not disagree about who was charged for what.
    const gateRequest = { ...request, tenantId: request.workspaceId };

    const gated = await resolveGatedModel(
      {
        registry: this.registry,
        router: this.router,
        quota: this.quota,
        providerKeys: this.providerKeys,
      },
      gateRequest,
      auth,
    );

    try {
      return await withRequestLog(
        this.requestLog,
        { gated, request: gateRequest, auth },
        async () => {
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
        },
      );

    } catch (error) {
      throw toS2sProviderError(error, gated.model, gated.requestId);
    }
  }

  private validate(request: EmbedRequest): void {
    if (!request.modelCode?.trim() && !request.taskProfile?.trim()) {
      throw new BadRequestException("modelCode or taskProfile is required");
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
