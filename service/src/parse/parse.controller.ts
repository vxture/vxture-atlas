import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import { ParseService, type ParseResponse } from "./parse.service";
import type { ParseRequest } from "./parse.types";

@Controller("v1/parse")
@UseGuards(S2sAuthGuard)
export class ParseController {
  constructor(private readonly parse: ParseService) {}

  @Post()
  run(@Body() body: ParseRequest): Promise<ParseResponse> {
    return this.parse.parse(body);
  }
}
