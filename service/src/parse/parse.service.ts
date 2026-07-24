import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import { QuotaService } from "../quota/quota.service";
import {
  resolveGatedModel,
  toS2sProviderError,
} from "../runtime/s2s-provider.shared";
import type { ProviderParseResponse } from "../types/runtime.types";
import type { ParseRequest } from "./parse.types";

const VALID_TASKS = new Set(["layout", "ocr", "table", "formula"]);

export type ParseResponse = ProviderParseResponse & { modelCode: string };

@Injectable()
export class ParseService {
  constructor(
    @Inject(ModelRegistryService)
    private readonly registry: ModelRegistryService,
    @Inject(ModelRouterService)
    private readonly router: ModelRouterService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
  ) {}

  async parse(request: ParseRequest): Promise<ParseResponse> {
    this.validate(request);

    const gated = await resolveGatedModel(
      { registry: this.registry, router: this.router, quota: this.quota },
      { ...request, tenantId: request.workspaceId },
    );

    try {
      const result = await gated.provider.parseDocument({
        endpointUrl: gated.model.endpointUrl,
        apiKey: gated.apiKey,
        modelCode: gated.model.modelCode,
        task: request.task,
        pages: request.pages,
        ...(gated.model.config != null ? { config: gated.model.config } : {}),
      });

      return { ...result, modelCode: gated.model.modelCode };
    } catch (error) {
      throw toS2sProviderError(error, gated.model, gated.requestId);
    }
  }

  private validate(request: ParseRequest): void {
    if (typeof request.modelCode !== "string" || !request.modelCode.trim()) {
      throw new BadRequestException("modelCode is required");
    }

    if (typeof request.workspaceId !== "string" || !request.workspaceId.trim()) {
      throw new BadRequestException("workspaceId is required");
    }

    if (!VALID_TASKS.has(request.task)) {
      throw new BadRequestException(
        `task must be one of ${[...VALID_TASKS].join(", ")}`,
      );
    }

    if (!Array.isArray(request.pages) || request.pages.length === 0) {
      throw new BadRequestException("pages cannot be empty");
    }

    const invalidPage = request.pages.some(
      (page) =>
        typeof page.pageIndex !== "number" ||
        (!page.imageRef && !page.imageBase64),
    );
    if (invalidPage) {
      throw new BadRequestException(
        "each page requires a numeric pageIndex and either imageRef or imageBase64",
      );
    }
  }
}
