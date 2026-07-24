import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import { RerankService } from "./rerank.service";
import type { RerankRequest, RerankResponse } from "./rerank.types";

@Controller("v1/rerank")
@UseGuards(S2sAuthGuard)
export class RerankController {
  constructor(private readonly rerank: RerankService) {}

  @Post()
  score(@Body() body: RerankRequest): Promise<RerankResponse> {
    return this.rerank.rerank(body);
  }
}
