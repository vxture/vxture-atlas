import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import type { S2sAuthenticatedRequest } from "../runtime/guards/s2s-auth.guard";
import { RerankService } from "./rerank.service";
import type { RerankRequest, RerankResponse } from "./rerank.types";

@Controller("v1/rerank")
@UseGuards(S2sAuthGuard)
export class RerankController {
  constructor(private readonly rerank: RerankService) {}

  // TD-017: attribution comes from the verified token, never the body (rule 8).
  @Post()
  score(
    @Body() body: RerankRequest,
    @Req() req: S2sAuthenticatedRequest,
  ): Promise<RerankResponse> {
    return this.rerank.rerank(body, req.s2sAuth);
  }
}
