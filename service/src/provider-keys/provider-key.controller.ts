import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import {
  OperatorAuthGuard,
  StepUpRequiredGuard,
} from "../runtime/guards/operator-auth.guard";
import type { OperatorAuthenticatedRequest } from "../runtime/guards/operator-auth.guard";
import { ProviderKeyService } from "./provider-key.service";
import type {
  CreateProviderKeyBody,
  ProviderKeyAdminRecord,
  RotateProviderKeyBody,
} from "./provider-key.types";

// See model-admin.controller.ts for the /capability naming rationale - the
// legacy model-platform/admin/provider-keys prefix is retired, no alias.
//
// Auth swapped from S2sAuthGuard to OperatorAuthGuard 2026-07-29 (#52, M-1) -
// same rationale as model-admin.controller.ts. The four mutation routes
// additionally require StepUpRequiredGuard (M-1 item 2): rotating/activating/
// deactivating/creating a provider key is exactly the class of action
// step-up exists for. `list` stays read-only, no step-up needed for it.
@Controller("capability/provider-keys")
@UseGuards(OperatorAuthGuard)
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

  @UseGuards(StepUpRequiredGuard)
  @Post()
  create(
    @Body() body: CreateProviderKeyBody,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.create(body);
  }

  // M-5: rotatedBy comes only from the verified operator token, never the
  // body - a caller-supplied identity claim is exactly what M-5 exists to
  // stop being possible (rule 8 precedent: never trust caller-asserted
  // identity context).
  @UseGuards(StepUpRequiredGuard)
  @Post(":providerKeyId/rotate")
  rotate(
    @Param("providerKeyId") providerKeyId: string,
    @Body() body: RotateProviderKeyBody,
    @Req() req: OperatorAuthenticatedRequest,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.rotate(providerKeyId, {
      ...body,
      ...(req.operatorAuth?.operatorId !== undefined
        ? { rotatedBy: req.operatorAuth.operatorId }
        : {}),
    });
  }

  @UseGuards(StepUpRequiredGuard)
  @Put(":providerKeyId/deactivate")
  deactivate(
    @Param("providerKeyId") providerKeyId: string,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.setActive(providerKeyId, false);
  }

  @UseGuards(StepUpRequiredGuard)
  @Put(":providerKeyId/activate")
  activate(
    @Param("providerKeyId") providerKeyId: string,
  ): Promise<ProviderKeyAdminRecord> {
    return this.keys.setActive(providerKeyId, true);
  }
}
