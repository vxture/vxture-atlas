import type { ApplicationType } from "../types/runtime.types";

/** A1 embedding (TD-003, docs/30-design/200-s2s-provider-surface.md §2). */
export interface EmbedRequest {
  modelCode: string;
  texts: string[];
  workspaceId: string;
  tenantId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  requestId?: string;
}

export interface EmbedResponse {
  modelCode: string;
  modelVersion: string;
  dimension: number;
  vectors: number[][];
}
