import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma singleton; only tenantSubscriptionQuota.findFirst is exercised.
// vi.hoisted so the fn exists before the hoisted vi.mock factory runs.
const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("../prisma", () => ({
  prisma: { tenantSubscriptionQuota: { findFirst } },
}));

import { ModelRegistryRepository } from "./model-registry.repository";

const repo = new ModelRegistryRepository();
const AT = new Date("2026-06-11T00:00:00Z");
const row = (id: string) => ({ id }) as never;

beforeEach(() => findFirst.mockReset());

describe("findCurrentSubscriptionQuota (subscription-aware, #9)", () => {
  it("prefers the subscription-scoped quota when subscriptionId resolves one", async () => {
    findFirst.mockResolvedValueOnce(row("scoped"));
    const out = await repo.findCurrentSubscriptionQuota("t1", AT, "sub1");
    expect(out).toMatchObject({ id: "scoped" }); // repo 现映射为 QuotaRecord（带默认字段），验 id + 回退逻辑
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]![0].where).toMatchObject({
      workspaceId: "t1", // tenantId 作 workspace_id stand-in（metering 解耦前的占位，见 repo 注释）
      subscriptionId: "sub1",
    });
  });

  it("falls back to tenant-wide when the scoped quota is missing", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(row("wide"));
    const out = await repo.findCurrentSubscriptionQuota("t1", AT, "sub1");
    expect(out).toMatchObject({ id: "wide" });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst.mock.calls[1]![0].where).not.toHaveProperty(
      "subscriptionId",
    );
  });

  it("queries tenant-wide only when no subscriptionId given (unchanged path)", async () => {
    findFirst.mockResolvedValueOnce(row("wide"));
    const out = await repo.findCurrentSubscriptionQuota("t1", AT);
    expect(out).toMatchObject({ id: "wide" });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0]![0].where).not.toHaveProperty(
      "subscriptionId",
    );
  });
});
