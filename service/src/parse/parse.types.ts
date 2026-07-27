import type { ApplicationType, ParseTask } from "../types/runtime.types";

/** A2 parse (layout/OCR/table/formula, TD-003, docs/30-design/200-s2s-provider-surface.md §3). */
export interface ParsePage {
  pageIndex: number;
  imageRef?: string;
  imageBase64?: string;
  regions?: unknown[];
}

export interface ParseRequest {
  /** Required unless `taskProfile` is given - one of the two must resolve to a model. */
  modelCode?: string;
  /** Task-profile routing (docs/70-workplan) - see `ChatRequest.taskProfile`. */
  taskProfile?: string;
  task: ParseTask;
  pages: ParsePage[];
  workspaceId: string;
  tenantId?: string;
  applicationId?: string;
  applicationType?: ApplicationType;
  requestId?: string;
}

export type { ParseTask };
