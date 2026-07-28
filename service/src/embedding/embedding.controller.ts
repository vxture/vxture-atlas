import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import type { S2sAuthenticatedRequest } from "../runtime/guards/s2s-auth.guard";
import { EmbeddingService } from "./embedding.service";
import type { EmbedRequest, EmbedResponse } from "./embedding.types";

@Controller("v1/embed")
@UseGuards(S2sAuthGuard)
export class EmbeddingController {
  constructor(private readonly embedding: EmbeddingService) {}

  // TD-017: attribution comes from the verified token, never the body (rule 8).
  @Post()
  embed(
    @Body() body: EmbedRequest,
    @Req() req: S2sAuthenticatedRequest,
  ): Promise<EmbedResponse> {
    return this.embedding.embed(body, req.s2sAuth);
  }
}
