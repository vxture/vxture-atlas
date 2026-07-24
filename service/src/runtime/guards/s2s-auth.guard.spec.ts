/**
 * s2s-auth.guard.spec.ts - S2S token 校验测试 (product_210 §3.3)
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category test
 * @author AI-Generated
 * @date 2026-07-24
 */

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { verifyS2sToken } from "./s2s-auth.guard";

const ISSUER = "https://accounts.vxture.com";
const AUDIENCE = "atlas";
const KID = "test-key-1";

describe("verifyS2sToken", () => {
  let privateKey: CryptoKey;
  let jwks: JWTVerifyGetKey;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    jwks = createLocalJWKSet({
      keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }],
    });
  });

  function sign(
    claims: Record<string, unknown>,
    opts: { alg?: string; expiresIn?: string } = {},
  ) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime(opts.expiresIn ?? "5m")
      .sign(privateKey);
  }

  it("accepts a valid service-mode token", async () => {
    const token = await sign({
      act: { sub: "varda" },
      mode: "service",
      scope: "tool:atlas",
      org_id: "org_1",
      workspace_id: "ws_1",
    });

    const ctx = await verifyS2sToken(token, {
      jwks,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(ctx).toEqual({
      callerProductCode: "varda",
      mode: "service",
      scope: "tool:atlas",
      orgId: "org_1",
      workspaceId: "ws_1",
      userId: undefined,
      jti: undefined,
    });
  });

  it("accepts a valid obo-mode token carrying a user subject", async () => {
    const token = await sign({
      sub: "user_42",
      act: { sub: "console-bff" },
      mode: "obo",
      scope: "tool:atlas",
    });

    const ctx = await verifyS2sToken(token, {
      jwks,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(ctx.callerProductCode).toBe("console-bff");
    expect(ctx.mode).toBe("obo");
    expect(ctx.userId).toBe("user_42");
  });

  it("rejects a token for the wrong audience (rule 4)", async () => {
    const token = await new SignJWT({
      act: { sub: "varda" },
      mode: "service",
      scope: "tool:atlas",
    })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience("ontos")
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });

  it("rejects a token from the wrong issuer (rule 3)", async () => {
    const token = await new SignJWT({
      act: { sub: "varda" },
      mode: "service",
      scope: "tool:atlas",
    })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuedAt()
      .setIssuer("https://evil.example")
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });

  it("rejects an expired token (rule 5)", async () => {
    const token = await sign({
      act: { sub: "varda" },
      mode: "service",
      scope: "tool:atlas",
    }, { expiresIn: "-1h" });

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });

  it("rejects a token missing act.sub (rule 6)", async () => {
    const token = await sign({
      mode: "service",
      scope: "tool:atlas",
    });

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });

  it("rejects a token with an unrecognized mode claim", async () => {
    const token = await sign({
      act: { sub: "varda" },
      mode: "admin",
      scope: "tool:atlas",
    });

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });

  it("rejects HS256-signed tokens (rule 1 - RS256 only)", async () => {
    const secret = new TextEncoder().encode("shared-secret-not-allowed");
    const token = await new SignJWT({
      act: { sub: "varda" },
      mode: "service",
      scope: "tool:atlas",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(secret);

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });
});
