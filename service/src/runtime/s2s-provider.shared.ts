/**
 * s2s-provider.shared.ts - shared plumbing for the A1/A2/A3 S2S provider surface
 * (embed/parse/rerank, TD-003, docs/30-design/200-s2s-provider-surface.md).
 * @package @atlas/service
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

import { BadRequestException } from "@nestjs/common";

import { ProviderCapabilityNotImplementedError } from "../providers/base.provider";
import { ModelRegistryService } from "../registry/model-registry.service";
import { ModelRouterService } from "../router/model-router.service";
import {
  QuotaService,
  resolveApplicationScope,
  type QuotaCheckRequest,
} from "../quota/quota.service";
import { ProviderKeyService } from "../provider-keys/provider-key.service";
import { resolveApiKey } from "./resolve-api-key";
import { ModelRuntimeException } from "./runtime.errors";
import { RequestLogService } from "../reqlog/request-log.service";
import type { S2sAuthContext } from "./guards/s2s-auth.guard";
import type { AiModelRecord, IModelProvider } from "../types/runtime.types";

export interface S2sProviderRequestBase extends QuotaCheckRequest {
  /** Required unless `taskProfile` is given - one of the two must resolve to a model. */
  modelCode?: string;
  /** Task-profile routing (docs/70-workplan) - see `ChatRequest.taskProfile`. */
  taskProfile?: string;
  requestId?: string;
}

export interface GatedModel {
  model: AiModelRecord;
  provider: IModelProvider;
  apiKey: string;
  requestId: string;
}

/**
 * TD-017: A1/A2/A3 previously recorded nothing at all - not even the no-op
 * metering call the chat path made - so embed/rerank/parse traffic was
 * invisible even in principle. This wraps the capability call so every
 * outcome lands in `reqlog`.
 *
 * `tokens` is optional because the A1/A3 provider responses do not report
 * usage today (Zhipu's embedding/rerank responses carry no token counts), so
 * those columns stay NULL rather than being invented. Latency and the
 * attribution dimensions are real either way.
 */
export async function withRequestLog<T>(
  requestLog: RequestLogService,
  context: {
    gated: GatedModel;
    request: S2sProviderRequestBase;
    auth?: S2sAuthContext | undefined;
  },
  call: () => Promise<T>,
): Promise<T> {
  const { gated, request, auth } = context;
  const applicationScope = resolveApplicationScope(request);
  const startedAt = Date.now();

  const dimensions = {
    requestId: gated.requestId,
    ...(auth?.workspaceId !== undefined
      ? { workspaceId: auth.workspaceId }
      : {}),
    ...(auth?.userId !== undefined ? { userId: auth.userId } : {}),
    tenantId: auth?.tenantId ?? request.tenantId,
    applicationId: applicationScope.applicationId,
    applicationType: applicationScope.applicationType,
    agentId: applicationScope.agentId,
    ...(request.featureId !== undefined
      ? { featureId: request.featureId }
      : {}),
    modelCode: gated.model.modelCode,
    providerCode: gated.model.provider,
  };

  try {
    const result = await call();
    await requestLog.record({
      ...dimensions,
      status: "success",
      latencyMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    await requestLog.record({
      ...dimensions,
      status: "error",
      latencyMs: Date.now() - startedAt,
    });
    const code =
      error instanceof ModelRuntimeException
        ? error.code
        : error instanceof ProviderCapabilityNotImplementedError
          ? "MODEL_NOT_IMPLEMENTED"
          : undefined;
    await requestLog.recordError({
      requestId: gated.requestId,
      providerCode: gated.model.provider,
      modelCode: gated.model.modelCode,
      ...(code !== undefined ? { errorCode: code } : {}),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
  const modelCode = await resolveModelCode(deps.registry, request);
  const model = await deps.registry.getActiveModel(modelCode);
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

async function resolveModelCode(
  registry: ModelRegistryService,
  request: S2sProviderRequestBase,
): Promise<string> {
  const modelCode = request.modelCode?.trim();
  if (modelCode) {
    return modelCode;
  }

  const taskProfile = request.taskProfile?.trim();
  if (!taskProfile) {
    throw new BadRequestException("modelCode or taskProfile is required");
  }

  const applicationScope = resolveApplicationScope(request);
  return registry.resolveModelCodeForTaskProfile({
    tenantId: request.tenantId,
    taskProfile,
    applicationId: applicationScope.applicationId,
    applicationType: applicationScope.applicationType,
  });
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
