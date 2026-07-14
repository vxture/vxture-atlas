/**
 * internal-diagnostics.guard.spec.ts - 内部诊断访问保护测试
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category test
 * @author AI-Generated
 * @date 2026-06-07
 */

import type { ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";

import { InternalDiagnosticsGuard } from "./internal-diagnostics.guard";

function makeContext(
  headers: Record<string, string | string[]>,
  ip?: string,
  remoteAddress?: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip, socket: { remoteAddress } }),
    }),
  } as unknown as ExecutionContext;
}

describe("InternalDiagnosticsGuard", () => {
  afterEach(() => {
    delete process.env["ALLOW_INTERNAL_DIAGNOSTICS"];
  });

  it("allows internal header", () => {
    const guard = new InternalDiagnosticsGuard();

    expect(guard.canActivate(makeContext({ "x-internal-call": "1" }))).toBe(
      true,
    );
  });

  it("allows internal env override", () => {
    process.env["ALLOW_INTERNAL_DIAGNOSTICS"] = "1";
    const guard = new InternalDiagnosticsGuard();

    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it("rejects public requests by default", () => {
    const guard = new InternalDiagnosticsGuard();

    expect(guard.canActivate(makeContext({}))).toBe(false);
  });

  it("allows loopback source without explicit auth", () => {
    const guard = new InternalDiagnosticsGuard();

    // 容器内 docker exec curl localhost/metrics 的典型来源。
    expect(guard.canActivate(makeContext({}, "127.0.0.1"))).toBe(true);
    expect(guard.canActivate(makeContext({}, "::1"))).toBe(true);
    expect(
      guard.canActivate(makeContext({}, undefined, "::ffff:127.0.0.1")),
    ).toBe(true);
  });

  it("still rejects non-loopback public ip without auth", () => {
    const guard = new InternalDiagnosticsGuard();

    expect(guard.canActivate(makeContext({}, "203.0.113.5"))).toBe(false);
  });

  it("allows internal call when token matches", () => {
    process.env["INTERNAL_DIAGNOSTICS_TOKEN"] = "secret";
    const guard = new InternalDiagnosticsGuard();

    expect(
      guard.canActivate(makeContext({ "x-internal-token": "secret" })),
    ).toBe(true);
  });

  it("rejects wrong token", () => {
    process.env["INTERNAL_DIAGNOSTICS_TOKEN"] = "secret";
    const guard = new InternalDiagnosticsGuard();

    expect(
      guard.canActivate(makeContext({ "x-internal-token": "wrong" })),
    ).toBe(false);
  });

  it("supports cidr/ip allowlist", () => {
    process.env["INTERNAL_DIAGNOSTICS_ALLOW_IPS"] = "10.1.0.0/24";
    const guard = new InternalDiagnosticsGuard();

    expect(
      guard.canActivate(
        makeContext({ "x-internal-call": "1" }, "10.1.0.1", "10.1.0.0"),
      ),
    ).toBe(true);

    expect(
      guard.canActivate(
        makeContext({ "x-internal-call": "1" }, "10.2.0.1", "10.2.0.1"),
      ),
    ).toBe(false);
  });
});
