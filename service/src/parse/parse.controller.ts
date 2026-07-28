import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import type { S2sAuthenticatedRequest } from "../runtime/guards/s2s-auth.guard";
import { ParseService, type ParseResponse } from "./parse.service";
import type { ParseRequest } from "./parse.types";

@Controller("v1/parse")
@UseGuards(S2sAuthGuard)
export class ParseController {
  constructor(private readonly parse: ParseService) {}

  // TD-017: attribution comes from the verified token, never the body (rule 8).
  @Post()
  run(
    @Body() body: ParseRequest,
    @Req() req: S2sAuthenticatedRequest,
  ): Promise<ParseResponse> {
    return this.parse.parse(body, req.s2sAuth);
  }
}
