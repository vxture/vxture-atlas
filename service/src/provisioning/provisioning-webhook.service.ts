/**
 * provisioning-webhook.service.ts - C3 provisioning webhook receiver (TD-003).
 * Authority: docs/30-design/identity/080-rp-integration.md §4 - processing
 * order is a hard requirement (verify -> idempotency -> ordering -> execute),
 * not a style choice: skipping idempotency/ordering causes duplicate
 * initialization or state corruption under the platform's documented
 * at-least-once, possibly-out-of-order delivery behavior.
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";

import { verifyWebhookSignature } from "./provisioning-signature";
import { ProvisioningWebhookRepository } from "./provisioning-webhook.repository";
import type { ProvisioningWebhookPayload } from "./provisioning.types";

export type ProvisioningOutcome =
  | "processed"
  | "duplicate_delivery"
  | "stale_or_out_of_order";

@Injectable()
export class ProvisioningWebhookService {
  private readonly logger = new Logger(ProvisioningWebhookService.name);

  constructor(
    @Inject(ProvisioningWebhookRepository)
    private readonly repository: ProvisioningWebhookRepository,
  ) {}

  async handle(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    payload: ProvisioningWebhookPayload,
  ): Promise<ProvisioningOutcome> {
    // 1. Verify - before anything else, over the raw bytes, both secrets.
    const secrets = [
      process.env["PROVISION_WEBHOOK_SECRET"],
      process.env["PROVISION_WEBHOOK_SECRET_NEXT"],
    ];
    if (!verifyWebhookSignature(rawBody, signatureHeader, secrets)) {
      throw new UnauthorizedException("Invalid provisioning webhook signature");
    }

    this.validatePayload(payload);

    // 2. Idempotency - a retried delivery_id is expected under at-least-once
    // delivery and must short-circuit to "already handled", not re-execute.
    const existingDelivery = await this.repository.findDelivery(payload.id);
    if (existingDelivery) {
      this.logger.log(
        `provisioning webhook: duplicate delivery ${payload.id}, skipping`,
      );
      return "duplicate_delivery";
    }

    // 3. Ordering - per-workspace seq must be monotonic; a stale/out-of-order
    // delivery is acknowledged (200) but ignored, never applied backwards.
    const current = await this.repository.findProvisioning(payload.workspace_id);
    if (current && BigInt(payload.seq) <= current.seq) {
      this.logger.log(
        `provisioning webhook: stale seq ${payload.seq} <= ${current.seq} for workspace ${payload.workspace_id}, ignoring`,
      );
      await this.repository.recordDelivery({
        deliveryId: payload.id,
        workspaceId: payload.workspace_id,
        eventType: payload.type,
        seq: payload.seq,
      });
      return "stale_or_out_of_order";
    }

    // 4. Execute - record-only (TD-003 decision): Atlas has no per-workspace
    // schema to create/tear down (model/grant/quota data is global, not
    // workspace-scoped like an asset-face product's business schema) - this
    // just persists status for Atlas's own future gating logic to consume.
    // Idempotent by construction: re-applying the same status/seq is a no-op.
    const status =
      payload.type === "tenant.provisioned" ? "provisioned" : "deprovisioned";
    await this.repository.upsertProvisioning({
      workspaceId: payload.workspace_id,
      tenantId: payload.tenant_id ?? null,
      status,
      seq: payload.seq,
      occurredAt: new Date(payload.occurred_at * 1000),
    });

    await this.repository.recordDelivery({
      deliveryId: payload.id,
      workspaceId: payload.workspace_id,
      eventType: payload.type,
      seq: payload.seq,
    });

    return "processed";
  }

  private validatePayload(payload: ProvisioningWebhookPayload): void {
    if (typeof payload.id !== "string" || !payload.id.trim()) {
      throw new BadRequestException("id is required");
    }

    if (
      payload.type !== "tenant.provisioned" &&
      payload.type !== "tenant.deprovisioned"
    ) {
      throw new BadRequestException(
        'type must be "tenant.provisioned" or "tenant.deprovisioned"',
      );
    }

    if (
      typeof payload.workspace_id !== "string" ||
      !payload.workspace_id.trim()
    ) {
      throw new BadRequestException("workspace_id is required");
    }

    if (typeof payload.seq !== "number" || !Number.isFinite(payload.seq)) {
      throw new BadRequestException("seq must be a finite number");
    }

    if (
      typeof payload.occurred_at !== "number" ||
      !Number.isFinite(payload.occurred_at)
    ) {
      throw new BadRequestException("occurred_at must be an epoch-seconds number");
    }
  }
}
