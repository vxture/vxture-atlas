import { describe, it, expect } from "vitest";

import { ModelRegistryRepository } from "./model-registry.repository";

const repo = new ModelRegistryRepository();
const AT = new Date("2026-06-11T00:00:00Z");

// TD-002/TD-005: these four read paths used to call Prisma delegates
// (tenantSubscriptionQuota/tenantUsageSummary) that had no real backing model in
// schema.prisma - the real answer requires the platform's C2 entitlement read, which
// is blocked on product.agent_catalog landing (data_model_200_schema.md §2). Until
// then they fail-open: null/[] rather than throwing.
describe("quota/usage reads fail-open (no prisma access - TD-002/TD-005)", () => {
  it("findCurrentSubscriptionQuota always resolves null", async () => {
    await expect(
      repo.findCurrentSubscriptionQuota("t1", AT, "sub1"),
    ).resolves.toBeNull();
    await expect(repo.findCurrentSubscriptionQuota("t1", AT)).resolves.toBeNull();
  });

  it("listSubscriptionQuotas always resolves an empty array", async () => {
    await expect(
      repo.listSubscriptionQuotas({ tenantId: "t1", includeExpired: false }),
    ).resolves.toEqual([]);
  });

  it("findUsageSummary always resolves null", async () => {
    await expect(
      repo.findUsageSummary({
        tenantId: "t1",
        agentId: "a1",
        featureId: "f1",
        cycleMonth: "202601",
        statType: "summary",
      }),
    ).resolves.toBeNull();
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
