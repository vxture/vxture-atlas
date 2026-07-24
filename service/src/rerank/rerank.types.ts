import type { ApplicationType } from "../types/runtime.types";

/** A3 rerank (TD-003, docs/30-design/200-s2s-provider-surface.md §4). */
export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankRequest {
  modelCode: string;
  query: string;
  candidates: RerankCandidate[];
  workspaceId: string;
  tenantId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  requestId?: string;
}

export interface RerankScore {
  id: string;
  score: number;
}

export interface RerankResponse {
  modelCode: string;
  scores: RerankScore[];
}

/** A3.2 hard constraint - server-side validated, never silently truncated. */
export const RERANK_CANDIDATE_POOL_LIMIT = 100;
