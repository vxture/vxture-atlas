/**
 * s2s-provider.shared.ts - shared plumbing for the A1/A2/A3 S2S provider surface
 * (embed/parse/rerank, TD-003, docs/30-design/200-s2s-provider-surface.md).
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category Runtime
 *
 * @description
 *   Contract-layer only: model resolution + grant/quota gating + api key lookup are
 *   real (reused from the chat path). The actual provider capability call is not -
 *   no provider implements embed/rerank/parseDocument yet (BaseProvider's default
 *   throws ProviderCapabilityNotImplementedError, see base.provider.ts), which this
 *   file maps to a 501 MODEL_NOT_IMPLEMENTED response rather than a fabricated
 *   integration. Which provider/model backs each capability is a product/cost
 *   decision out of scope here.
 */
import { HttpStatus } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { ProviderCapabilityNotImplementedError } from "../providers/base.provider";
import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import { QuotaService, type QuotaCheckRequest } from "../quota/quota.service";
import { ProviderKeyService } from "../provider-keys/provider-key.service";
import { resolveApiKey } from "./resolve-api-key";
import { ModelRuntimeException } from "./runtime.errors";
import type { AiModelRecord, IModelProvider } from "../types/runtime.types";

export interface S2sProviderRequestBase extends QuotaCheckRequest {
  modelCode: string;
  requestId?: string;
}

export interface GatedModel {
  model: AiModelRecord;
  provider: IModelProvider;
  apiKey: string;
  requestId: string;
}

export async function resolveGatedModel(
  deps: {
    registry: ModelRegistryService;
    router: ModelRouterService;
    quota: QuotaService;
    providerKeys: ProviderKeyService;
  },
  request: S2sProviderRequestBase,
): Promise<GatedModel> {
  const requestId = request.requestId?.trim() || randomUUID();
  const model = await deps.registry.getActiveModel(request.modelCode);
  await deps.quota.assertAllowed(model, request);
  const provider = deps.router.resolve(model.provider, model.modelCode);
  const apiKey = await resolveApiKey(
    {
      resolveManagedKey: (providerCode, keyAlias) =>
        deps.providerKeys.resolveKey(providerCode, keyAlias),
    },
    model,
    requestId,
  );

  return { model, provider, apiKey, requestId };
}

export function toS2sProviderError(
  error: unknown,
  model: AiModelRecord,
  requestId: string,
): ModelRuntimeException {
  if (error instanceof ModelRuntimeException) {
    return error;
  }

  if (error instanceof ProviderCapabilityNotImplementedError) {
    return new ModelRuntimeException(
      HttpStatus.NOT_IMPLEMENTED,
      "MODEL_NOT_IMPLEMENTED",
      error.message,
      { requestId, modelCode: model.modelCode, provider: model.provider },
    );
  }

  const message = error instanceof Error ? error.message : "Provider request failed";
  return new ModelRuntimeException(
    HttpStatus.SERVICE_UNAVAILABLE,
    "PROVIDER_UNAVAILABLE",
    message,
    { requestId, modelCode: model.modelCode, provider: model.provider },
  );
}
