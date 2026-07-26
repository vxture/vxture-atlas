import { BadRequestException } from "@nestjs/common";
import { describe, it, expect, vi } from "vitest";

import { ParseService } from "./parse.service";
import { ProviderCapabilityNotImplementedError } from "../providers/base.provider";
import type { AiModelRecord } from "../types/runtime.types";

function makeModel(overrides: Partial<AiModelRecord> = {}): AiModelRecord {
  return {
    id: "model-1",
    providerId: null,
    modelCode: "parse-layout-v1",
    modelName: "Layout Parser v1",
    provider: "doubao",
    endpointUrl: "https://api.doubao.example/v1",
    protocol: "openai",
    modelType: "parse",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    capabilities: ["parse"],
    supportsStreaming: false,
    isActive: true,
    sort: 0,
    config: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makeService(
  model: AiModelRecord,
  providerOverrides: Partial<{ parseDocument: ReturnType<typeof vi.fn> }> = {},
) {
  const registry = { getActiveModel: vi.fn().mockResolvedValue(model) };
  const quota = { assertAllowed: vi.fn().mockResolvedValue(undefined) };
  const provider = {
    parseDocument:
      providerOverrides.parseDocument ??
      vi
        .fn()
        .mockRejectedValue(
          new ProviderCapabilityNotImplementedError("doubao", "parseDocument"),
        ),
  };
  const router = { resolve: vi.fn().mockReturnValue(provider) };
  const providerKeys = { resolveKey: vi.fn().mockResolvedValue(null) };

  const service = new ParseService(
    registry as never,
    router as never,
    quota as never,
    providerKeys as never,
  );

  return { service, registry, quota, router, provider, providerKeys };
}

const PAGES = [{ pageIndex: 0, imageRef: "ref-1" }];

describe("ParseService.parse", () => {
  it("rejects when modelCode is missing", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.parse({
        modelCode: "",
        task: "ocr",
        pages: PAGES,
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an invalid task", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.parse({
        modelCode: "m",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        task: "unknown-task" as any,
        pages: PAGES,
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects empty pages", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.parse({
        modelCode: "m",
        task: "ocr",
        pages: [],
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a page missing both imageRef and imageBase64", async () => {
    const { service } = makeService(makeModel());
    await expect(
      service.parse({
        modelCode: "m",
        task: "ocr",
        pages: [{ pageIndex: 0 }],
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps a not-implemented provider to a 501 MODEL_NOT_IMPLEMENTED error", async () => {
    const model = makeModel();
    const { service } = makeService(model);

    try {
      await service.parse({
        modelCode: model.modelCode,
        task: "ocr",
        pages: PAGES,
        workspaceId: "ws-1",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "MODEL_NOT_IMPLEMENTED" });
      expect((error as { getStatus(): number }).getStatus()).toBe(501);
    }
  });

  it("returns the provider's parse result with modelCode attached", async () => {
    const model = makeModel();
    const parseDocument = vi
      .fn()
      .mockResolvedValue({ task: "ocr", spans: [{ bbox: [0, 0, 1, 1], text: "hi" }] });
    const { service } = makeService(model, { parseDocument });

    const result = await service.parse({
      modelCode: model.modelCode,
      task: "ocr",
      pages: PAGES,
      workspaceId: "ws-1",
    });

    expect(result).toEqual({
      task: "ocr",
      spans: [{ bbox: [0, 0, 1, 1], text: "hi" }],
      modelCode: model.modelCode,
    });
  });
});
