import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import { S2sAuthGuard } from "../runtime/guards/s2s-auth.guard";
import { ProviderKeyService } from "./provider-key.service";
import type {
  CreateProviderKeyBody,
  ProviderKeyAdminRecord,
  RotateProviderKeyBody,
} from "./provider-key.types";

@Controller("model-platform/admin/provider-keys")
@UseGuards(S2sAuthGuard)
export class ProviderKeyController {
  constructor(
    @Inject(ProviderKeyService) private readonly keys: ProviderKeyService,
  ) {}

  @Get()
  list(
    @Query("providerCode") providerCode?: string,
  ): Promise<ProviderKeyAdminRecord[]> {
    return this.keys.list(providerCode);
  }

  @Post()
  create(
    @Body() body: CreateProviderKeyBody,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.create(body);
  }

  @Post(":providerKeyId/rotate")
  rotate(
    @Param("providerKeyId") providerKeyId: string,
    @Body() body: RotateProviderKeyBody,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.rotate(providerKeyId, body);
  }

  @Put(":providerKeyId/deactivate")
  deactivate(
    @Param("providerKeyId") providerKeyId: string,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.setActive(providerKeyId, false);
  }

  @Put(":providerKeyId/activate")
  activate(
    @Param("providerKeyId") providerKeyId: string,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.setActive(providerKeyId, true);
  }
}
