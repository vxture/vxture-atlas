import { describe, it, expect, vi } from "vitest";

import { ModelRegistryService } from "./model-registry.service";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import type { AiModelRecord } from "../types/runtime.types";

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: null,
    modelCode: "m",
    modelName: "M",
    provider: "doubao",
    endpointUrl: "https://api.example.com",
    protocol: "openai",
    modelType: "chat",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: [],
    supportsStreaming: true,
    isActive: true,
    sort: 0,
    config: null,
    providerConfig: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("ModelRegistryService.resolveModelCodeForTaskProfile", () => {
  it("returns the modelCode the repository resolves", async () => {
    const repository = {
      findModelCodeForTaskProfile: vi.fn().mockResolvedValue("chosen-model"),
    };
    const service = new ModelRegistryService(repository as never);

    const modelCode = await service.resolveModelCodeForTaskProfile({
      tenantId: "tenant-1",
      taskProfile: "summarization",
      applicationId: "app-1",
      applicationType: "agent",
    });

    expect(modelCode).toBe("chosen-model");
    expect(repository.findModelCodeForTaskProfile).toHaveBeenCalledWith(
      "summarization",
      "tenant-1",
      "app-1",
      "agent",
    );
  });

  it("throws TASK_PROFILE_NOT_ROUTABLE (404) when no grant matches", async () => {
    const repository = {
      findModelCodeForTaskProfile: vi.fn().mockResolvedValue(null),
    };
    const service = new ModelRegistryService(repository as never);

    await expect(
      service.resolveModelCodeForTaskProfile({
        tenantId: "tenant-1",
        taskProfile: "summarization",
        applicationId: "app-1",
        applicationType: "agent",
      }),
    ).rejects.toMatchObject({ code: "TASK_PROFILE_NOT_ROUTABLE" });

    try {
      await service.resolveModelCodeForTaskProfile({
        tenantId: "tenant-1",
        taskProfile: "summarization",
        applicationId: "app-1",
        applicationType: "agent",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelRuntimeException);
      expect((error as ModelRuntimeException).getStatus()).toBe(404);
    }
  });
});

describe("ModelRegistryService.listModelsForTenant", () => {
  it("delegates to the repository's grant-filtered listing", async () => {
    const model = makeModel();
    const repository = {
      listGrantedModels: vi.fn().mockResolvedValue([model]),
    };
    const service = new ModelRegistryService(repository as never);

    const models = await service.listModelsForTenant({
      tenantId: "tenant-1",
      applicationId: "app-1",
      applicationType: "agent",
    });

    expect(models).toEqual([model]);
    expect(repository.listGrantedModels).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      applicationId: "app-1",
      applicationType: "agent",
    });
  });
});
