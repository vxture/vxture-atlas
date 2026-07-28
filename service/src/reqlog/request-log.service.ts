import { Injectable, Logger } from "@nestjs/common";

import { prisma } from "../prisma";
import type { ErrorLogEntry, RequestLogEntry } from "./request-log.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `reqlog.request_records`'s attribution columns are `uuid` (nullable). A
 * caller's own composite identifier - karda's `tenantId` is the live example
 * (`vxture-atlas`#47, TD-010) - would abort the INSERT with a UUID cast error.
 *
 * For the *request path* TD-010 rightly turned that into a 400. Here it must
 * not: refusing to log because one dimension is malformed would lose the whole
 * record, including the dimensions that were fine. So a non-UUID is written
 * NULL. That is honest - the column cannot hold the value - and the row still
 * carries model/provider/tokens/latency plus whatever else resolved.
 */
function asUuidOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function asBigIntOrNull(value: number | undefined): bigint | null {
  return typeof value === "number" && Number.isFinite(value)
    ? BigInt(Math.trunc(value))
    : null;
}

/** Postgres `varchar(n)` rejects overlong input; truncate rather than lose the row. */
function clamp(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * TD-017: Atlas's own per-request history - the detail layer of the metering
 * split described in `docs/30-design/210-usage-metering-and-history.md`. This
 * is the half that depends on nothing external; the platform-side
 * `POST /usage/consume` call (which fills `usage_event_id`) is the other half
 * and is not implemented yet.
 *
 * Hard rule: **recording must never fail the request it describes.** An
 * inference call that succeeded must not be turned into an error because the
 * log write failed. Every method swallows its errors into a warning.
 */
@Injectable()
export class RequestLogService {
  private readonly logger = new Logger(RequestLogService.name);

  async record(entry: RequestLogEntry): Promise<void> {
    try {
      await prisma.requestRecord.create({
        data: {
          requestId: clamp(entry.requestId, 128) ?? entry.requestId,
          status: entry.status,
          // Token-derived (authoritative per S2S rule 8).
          workspaceId: asUuidOrNull(entry.workspaceId),
          userId: asUuidOrNull(entry.userId),
          // Caller-supplied scope, as the grant/quota lookup used it.
          tenantId: asUuidOrNull(entry.tenantId),
          applicationId: asUuidOrNull(entry.applicationId),
          applicationType: clamp(entry.applicationType, 32),
          agentId: asUuidOrNull(entry.agentId),
          featureId: asUuidOrNull(entry.featureId),
          // Atlas domain facts.
          modelCode: clamp(entry.modelCode, 128),
          providerCode: clamp(entry.providerCode, 64),
          inputTokens: asBigIntOrNull(entry.inputTokens),
          outputTokens: asBigIntOrNull(entry.outputTokens),
          totalTokens: asBigIntOrNull(entry.totalTokens),
          latencyMs:
            typeof entry.latencyMs === "number"
              ? Math.trunc(entry.latencyMs)
              : null,
          usageType: clamp(entry.usageType, 16),
          businessId: clamp(entry.businessId, 128),
          // `productId` stays NULL: the S2S token carries the caller's product
          // *code* (act.sub, e.g. "karda") and this column is a uuid FK-shaped
          // reference into the platform's product.products - resolving one to
          // the other needs the cross-database read that TD-005/TD-016 track.
          // `usageEventId`/`billed*` stay NULL until the consume call lands
          // (TD-017 part 2); a NULL there is the documented reconciliation
          // signal, not missing data.
        },
      });
    } catch (error) {
      this.logger.warn(
        `request log write failed for requestId=${entry.requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async recordError(entry: ErrorLogEntry): Promise<void> {
    try {
      await prisma.errorRecord.create({
        data: {
          requestId: clamp(entry.requestId, 128),
          providerCode: clamp(entry.providerCode, 64),
          modelCode: clamp(entry.modelCode, 128),
          errorCode: clamp(entry.errorCode, 64),
          // error_message is `text` - no length cap, but keep a sane bound so a
          // provider echoing back a huge body cannot bloat the partition.
          errorMessage: clamp(entry.errorMessage, 4000),
        },
      });
    } catch (error) {
      this.logger.warn(
        `error log write failed for requestId=${entry.requestId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
