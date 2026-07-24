import { Injectable } from "@nestjs/common";

import { prisma } from "../prisma";
import type { WorkspaceProvisioningRow } from "../prisma";

const PRODUCT_CODE = "atlas";

@Injectable()
export class ProvisioningWebhookRepository {
  /** Idempotency check - has this delivery_id already been processed? */
  async findDelivery(deliveryId: string): Promise<{ id: string } | null> {
    return prisma.webhookDelivery.findFirst({ where: { deliveryId } });
  }

  async recordDelivery(input: {
    deliveryId: string;
    workspaceId: string;
    eventType: string;
    seq: number;
  }): Promise<void> {
    await prisma.webhookDelivery.create({
      data: {
        deliveryId: input.deliveryId,
        workspaceId: input.workspaceId,
        productCode: PRODUCT_CODE,
        eventType: input.eventType,
        seq: BigInt(input.seq),
      },
    });
  }

  async findProvisioning(
    workspaceId: string,
  ): Promise<WorkspaceProvisioningRow | null> {
    return prisma.workspaceProvisioning.findFirst({
      where: { workspaceId, productCode: PRODUCT_CODE },
    });
  }

  /** Upsert current status. Caller has already checked ordering (payload.seq). */
  async upsertProvisioning(input: {
    workspaceId: string;
    tenantId: string | null;
    status: "provisioned" | "deprovisioned";
    seq: number;
    occurredAt: Date;
  }): Promise<void> {
    const timestampField =
      input.status === "provisioned" ? "provisionedAt" : "deprovisionedAt";

    await prisma.workspaceProvisioning.upsert({
      where: {
        workspaceId_productCode: {
          workspaceId: input.workspaceId,
          productCode: PRODUCT_CODE,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        productCode: PRODUCT_CODE,
        status: input.status,
        seq: BigInt(input.seq),
        [timestampField]: input.occurredAt,
      },
      update: {
        status: input.status,
        seq: BigInt(input.seq),
        [timestampField]: input.occurredAt,
      },
    });
  }
}
