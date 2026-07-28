import { describe, expect, it, vi } from "vitest";

import { TenancyService } from "./tenancy.service";
import { ModelRuntimeException } from "../runtime/runtime.errors";
import type { S2sAuthContext } from "../runtime/guards/s2s-auth.guard";

const ORG = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";

function makeAuth(over: Partial<S2sAuthContext> = {}): S2sAuthContext {
  return {
    callerProductCode: "console",
    mode: "service",
    scope: "tool:atlas",
    tenantId: ORG,
    workspaceId: WS,
    ...over,
  };
}

function makeService(over: { aggregate?: ReturnType<typeof vi.fn> } = {}) {
  const aggregate = over.aggregate ?? vi.fn(async () => []);
  const listModelsForTenant = vi.fn(async () => []);
  const service = new TenancyService(
    { listModelsForTenant } as never,
    { aggregateReqlogUsage: aggregate } as never,
  );
  return { service, aggregate, listModelsForTenant };
}

describe("TenancyService scope resolution", () => {
  it("scopes a workspace read to the token's workspace_id, ignoring any caller input", async () => {
    const { service, listModelsForTenant } = makeService();

    await service.listModels(makeAuth());

    expect(listModelsForTenant).toHaveBeenCalledWith({ tenantId: WS });
  });

  it("scopes a tenant-level usage read to the token's org_id", async () => {
    const { service, aggregate } = makeService();

    const result = await service.usage(makeAuth(), { scope: "tenant" });

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ scopeColumn: "tenant_id", scopeId: ORG }),
    );
    expect(result.scope).toBe("tenant");
    expect(result.scopeId).toBe(ORG);
  });

  it("defaults to the workspace level", async () => {
    const { service, aggregate } = makeService();

    const result = await service.usage(makeAuth(), {});

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ scopeColumn: "workspace_id", scopeId: WS }),
    );
    expect(result.scope).toBe("workspace");
  });

  it("refuses a tenant read when the token carries no org_id", async () => {
    // The whole point of the namespace: a caller cannot reach a scope its
    // token does not carry. There is no request field to fall back to.
    const { service } = makeService();
    const auth = makeAuth();
    delete (auth as { tenantId?: string }).tenantId;

    await expect(service.usage(auth, { scope: "tenant" })).rejects.toThrow(
      ModelRuntimeException,
    );
  });

  it("fails closed on a non-UUID claim rather than querying with it", async () => {
    const { service, aggregate } = makeService();

    await expect(
      service.usage(makeAuth({ workspaceId: "org-acme/ws-main" }), {}),
    ).rejects.toThrow(ModelRuntimeException);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range window", async () => {
    const { service } = makeService();

    await expect(service.usage(makeAuth(), { days: "0" })).rejects.toThrow();
    await expect(service.usage(makeAuth(), { days: "400" })).rejects.toThrow();
    await expect(service.usage(makeAuth(), { days: "x" })).rejects.toThrow();
  });
});

describe("TenancyService.usage aggregation", () => {
  it("normalizes bigint counters and labels the source as Atlas's own log", async () => {
    const aggregate = vi.fn(async () => [
      {
        modelCode: "glm-5.2",
        providerCode: "zhipu",
        requests: 3n,
        inputTokens: 100n,
        outputTokens: 50n,
        totalTokens: 150n,
        errors: 1n,
      },
    ]);
    const { service } = makeService({ aggregate });

    const result = await service.usage(makeAuth(), {});

    expect(result.rows).toEqual([
      {
        modelCode: "glm-5.2",
        providerCode: "zhipu",
        requests: 3,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        errors: 1,
      },
    ]);
    // Must never be mistaken for a billing figure - that is the platform's
    // usage_events, not this.
    expect(result.source).toBe("atlas.reqlog");
  });
});
