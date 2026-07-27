import type { ToolDescriptor } from "./discovery.types";

/**
 * TD-008: descriptors for Atlas's four S2S contract shapes. Kept in sync by
 * hand with the real request/response types (`runtime.types.ts`,
 * `embedding.types.ts`, `rerank.types.ts`, `parse.types.ts`) and
 * `docs/30-design/200-s2s-provider-surface.md` - not generated, since the
 * project has no JSON-Schema-from-TS pipeline today.
 */
export const ATLAS_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: "atlas.chat",
    title: "Chat completion",
    description:
      "Generation (A4): chat/completion against a registered model, with optional tool-calling and streaming.",
    input_schema: {
      type: "object",
      required: ["modelCode", "messages"],
      properties: {
        modelCode: { type: "string" },
        messages: { type: "array" },
        temperature: { type: "number" },
        maxTokens: { type: "integer" },
        topP: { type: "number" },
        tools: { type: "array" },
        toolChoice: {},
        stream: { type: "boolean" },
        applicationId: { type: "string" },
        applicationType: {
          enum: ["agent", "workflow", "api_client", "internal_service"],
        },
        usageType: { enum: ["normal", "retry", "test"] },
      },
    },
    version: "1.0.0",
    deprecated: false,
    metering: { metric: "atlas.chat", mode: "per_call" },
  },
  {
    name: "atlas.embed",
    title: "Text embedding",
    description:
      "A1: batch text embedding. modelCode is itself the version-pinned identifier - dimension is stable per modelCode.",
    input_schema: {
      type: "object",
      required: ["modelCode", "texts", "workspaceId"],
      properties: {
        modelCode: { type: "string" },
        texts: { type: "array", items: { type: "string" } },
        workspaceId: { type: "string" },
        tenantId: { type: "string" },
        applicationId: { type: "string" },
        applicationType: {
          enum: ["agent", "workflow", "api_client", "internal_service"],
        },
      },
    },
    output_schema: {
      type: "object",
      properties: {
        modelCode: { type: "string" },
        modelVersion: { type: "string" },
        dimension: { type: "integer" },
        vectors: { type: "array", items: { type: "array", items: { type: "number" } } },
      },
    },
    version: "1.0.0",
    deprecated: false,
    metering: { metric: "atlas.embed", mode: "per_call" },
  },
  {
    name: "atlas.rerank",
    title: "Candidate rerank",
    description:
      "A3: cross-encoder rerank of up to 100 candidates against a query. Scores are globally comparable within a modelCode.",
    input_schema: {
      type: "object",
      required: ["modelCode", "query", "candidates", "workspaceId"],
      properties: {
        modelCode: { type: "string" },
        query: { type: "string" },
        candidates: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            required: ["id", "text"],
            properties: { id: { type: "string" }, text: { type: "string" } },
          },
        },
        workspaceId: { type: "string" },
        tenantId: { type: "string" },
        applicationId: { type: "string" },
        applicationType: {
          enum: ["agent", "workflow", "api_client", "internal_service"],
        },
      },
    },
    output_schema: {
      type: "object",
      properties: {
        modelCode: { type: "string" },
        scores: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, score: { type: "number" } },
          },
        },
      },
    },
    version: "1.0.0",
    deprecated: false,
    metering: { metric: "atlas.rerank", mode: "per_call" },
  },
  {
    name: "atlas.parse",
    title: "Document parse",
    description:
      "A2: layout/OCR/table/formula extraction over one or more page images, batched per request.",
    input_schema: {
      type: "object",
      required: ["modelCode", "task", "pages", "workspaceId"],
      properties: {
        modelCode: { type: "string" },
        task: { enum: ["layout", "ocr", "table", "formula"] },
        pages: {
          type: "array",
          items: {
            type: "object",
            required: ["pageIndex"],
            properties: {
              pageIndex: { type: "integer" },
              imageRef: { type: "string" },
              imageBase64: { type: "string" },
              regions: { type: "array" },
            },
          },
        },
        workspaceId: { type: "string" },
        tenantId: { type: "string" },
        applicationId: { type: "string" },
        applicationType: {
          enum: ["agent", "workflow", "api_client", "internal_service"],
        },
      },
    },
    version: "1.0.0",
    deprecated: false,
    metering: { metric: "atlas.parse", mode: "per_call" },
  },
];

export const VXTURE_TOOLS_PROTOCOL_VERSION = "1.0";
