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
