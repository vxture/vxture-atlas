import { describe, it, expect } from "vitest";

import { ModelRegistryRepository } from "./model-registry.repository";

const repo = new ModelRegistryRepository();

// TD-002/TD-005 (2026-07-28): findCurrentSubscriptionQuota/findUsageSummary
// were removed outright - they were unreachable dead code (QuotaService's
// only caller was deleted alongside them, see quota.service.ts). The two
// remaining stubs are kept: listSubscriptionQuotas/listUsageSummaries answer
// "every tenant", which has no possible backing - the platform's C2 exposes
// only a single-workspace read, no bulk endpoint - so these stay honestly
// empty rather than becoming half-real. See ModelAdminService.listTenantQuotas
// for where that's surfaced as an explicit 501 instead of a silent [].
describe("bulk tenant reads have no possible backing (TD-002/TD-005)", () => {
  it("listSubscriptionQuotas always resolves an empty array", async () => {
    await expect(
      repo.listSubscriptionQuotas({ tenantId: "t1", includeExpired: false }),
    ).resolves.toEqual([]);
  });

  it("listUsageSummaries always resolves an empty array", async () => {
    await expect(
      repo.listUsageSummaries({ tenantId: "t1", cycleMonth: "202601" }),
    ).resolves.toEqual([]);
  });
});

// vxture-atlas#47: karda's first real end-to-end probe hit a non-UUID tenantId
// (their own composite org/workspace identifier, not the platform's UUID) and got
// an opaque 500 (unhandled Prisma UUID-cast error against model_grants.tenant_id,
// a `uuid` column with no FK - deploy/database/ddl/00_baseline.sql). These reject
// BEFORE any Prisma call, so no real database is needed to exercise them.
describe("tenantId/applicationId UUID validation (vxture-atlas#47)", () => {
  const MALFORMED_TENANT_ID =
    "2a4271d4-aaaa-bbbb-cccc-dddddddddddd/13306e79-1111-2222-3333-444444444444";

  it("findBestGrant rejects a non-UUID tenantId with a clean 400", async () => {
    await expect(
      repo.findBestGrant(
        "00000000-0000-0000-0000-000000000001",
        MALFORMED_TENANT_ID,
        "00000000-0000-0000-0000-000000000000",
        "internal_service",
      ),
    ).rejects.toMatchObject({ code: "INVALID_TENANT_ID" });
  });

  it("findBestGrant rejects a non-UUID applicationId with a clean 400", async () => {
    await expect(
      repo.findBestGrant(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "not-a-uuid",
        "agent",
      ),
    ).rejects.toMatchObject({ code: "INVALID_APPLICATION_ID" });
  });

  it("findModelCodeForTaskProfile rejects a non-UUID tenantId with a clean 400", async () => {
    await expect(
      repo.findModelCodeForTaskProfile(
        "karda.ask",
        MALFORMED_TENANT_ID,
        "00000000-0000-0000-0000-000000000000",
        "internal_service",
      ),
    ).rejects.toMatchObject({ code: "INVALID_TENANT_ID" });
  });

  it("listGrantedModels rejects a non-UUID tenantId with a clean 400", async () => {
    await expect(
      repo.listGrantedModels({ tenantId: MALFORMED_TENANT_ID }),
    ).rejects.toMatchObject({ code: "INVALID_TENANT_ID" });
  });

  it("listGrantedModels rejects a non-UUID applicationId with a clean 400", async () => {
    await expect(
      repo.listGrantedModels({
        tenantId: "00000000-0000-0000-0000-000000000002",
        applicationId: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_APPLICATION_ID" });
  });

});
