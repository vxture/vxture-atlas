import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import type { S2sAuthenticatedRequest } from "../runtime/guards/s2s-auth.guard";
import { TenancyService } from "./tenancy.service";
import type {
  TenancyGrantRow,
  TenancyQuotaResponse,
  TenancyUsageResponse,
} from "./tenancy.types";
import type { AiModelRecord } from "../types/runtime.types";

/**
 * Tenant self-service plane (owner decision 2026-07-28).
 *
 * Three faces, one auth model each - this is the third:
 *   `/v1/*`         "do this work"          product identity  (tool:atlas)
 *   `/tenancy/*`    "what do I have/use"    scope from token  (tool:atlas)
 *   `/capability/*` "change what exists"    operator identity (mgmt:atlas)
 *
 * Named after the tenancy *dimension*, not a level, because it serves both:
 * workspace is the cost-accounting unit and tenant (org) is the rollup, and a
 * tenant operator needs both views. `?scope=` picks the level; both ids come
 * from the token, never the caller.
 *
 * This is what `console-bff` should call instead of `/capability/*` - see
 * `vxture-atlas`#52 / #66: locking the capability plane to operator tokens
 * would otherwise 401 the tenant console.
 */
@Controller("tenancy")
@UseGuards(S2sAuthGuard)
export class TenancyController {
  // Explicit @Inject: the deployed artifact is an esbuild bundle, which does
  // not emit `design:paramtypes`, so constructor injection by type alone
  // resolves to undefined at runtime even though tsconfig sets
  // emitDecoratorMetadata and the unit tests (swc) pass.
  constructor(
    @Inject(TenancyService)
    private readonly tenancy: TenancyService,
  ) {}

  @Get("models")
  listModels(@Req() req: S2sAuthenticatedRequest): Promise<AiModelRecord[]> {
    return this.tenancy.listModels(req.s2sAuth);
  }

  /** What this workspace may call, and under what routing conditions. */
  @Get("grants")
  listGrants(@Req() req: S2sAuthenticatedRequest): Promise<TenancyGrantRow[]> {
    return this.tenancy.listGrants(req.s2sAuth);
  }

  /**
   * Entitlement from the platform's C2 envelope. `status` distinguishes
   * "uncovered" (resolved, no coverage - expected while atlas's plan catalog
   * is an unpublished draft) from "unavailable" (could not ask).
   */
  @Get("quotas")
  quotas(@Req() req: S2sAuthenticatedRequest): Promise<TenancyQuotaResponse> {
    return this.tenancy.quotas(req.s2sAuth);
  }

  @Get("usage")
  usage(
    @Req() req: S2sAuthenticatedRequest,
    @Query("scope") scope?: string,
    @Query("days") days?: string,
  ): Promise<TenancyUsageResponse> {
    return this.tenancy.usage(req.s2sAuth, {
      ...(scope !== undefined ? { scope } : {}),
      ...(days !== undefined ? { days } : {}),
    });
  }
}
