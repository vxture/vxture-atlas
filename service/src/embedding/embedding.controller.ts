import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import { EmbeddingService } from "./embedding.service";
import type { EmbedRequest, EmbedResponse } from "./embedding.types";

@Controller("v1/embed")
@UseGuards(S2sAuthGuard)
export class EmbeddingController {
  constructor(private readonly embedding: EmbeddingService) {}

  @Post()
  embed(@Body() body: EmbedRequest): Promise<EmbedResponse> {
    return this.embedding.embed(body);
  }
}
