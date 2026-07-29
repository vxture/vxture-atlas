/**
 * operator-auth.guard.spec.ts - operator token verification tests
 * (product_250_management-plane-contract.md §2 M-1/M-5, vxture-atlas#52)
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

import {
  hasStepUpFactor,
  StepUpRequiredGuard,
  verifyOperatorToken,
} from "./operator-auth.guard";
import type { OperatorAuthContext } from "./operator-auth.guard";
import { verifyS2sToken } from "./s2s-auth.guard";

const ISSUER = "https://accounts.vxture.com";
const AUDIENCE = "atlas";
const KID = "test-key-1";

describe("verifyOperatorToken", () => {
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
    opts: { alg?: string; expiresIn?: string; audience?: string } = {},
  ) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(opts.audience ?? AUDIENCE)
      .setExpirationTime(opts.expiresIn ?? "5m")
      .sign(privateKey);
  }

  const validClaims = {
    sub: "opr_11111111-1111-1111-1111-111111111111",
    act: { sub: "admin" },
    mode: "operator",
    userType: "operator",
    realm: "workforce",
    scope: "mgmt:atlas",
    amr: ["pwd", "otp"],
    operator_role: "platform_admin",
  };

  it("accepts a valid operator token and extracts M-5 attribution", async () => {
    const token = await sign(validClaims);

    const ctx = await verifyOperatorToken(token, { jwks, issuer: ISSUER });

    expect(ctx).toEqual({
      operatorId: "opr_11111111-1111-1111-1111-111111111111",
      actorClientId: "admin",
      amr: ["pwd", "otp"],
      operatorRole: "platform_admin",
      jti: undefined,
    });
  });

  it("rejects a well-formed S2S token - scope disjointness is not incidental", async () => {
    // The two token kinds must never both pass the same guard - product_250
    // §2's own words: "管理票过不了供给面守卫，反之亦然".
    const s2sToken = await sign({
      act: { sub: "varda" },
      mode: "service",
      scope: "tool:atlas",
    });

    await expect(
      verifyOperatorToken(s2sToken, { jwks, issuer: ISSUER }),
    ).rejects.toMatchObject({
      response: { code: "OPERATOR_TOKEN_WRONG_SCOPE" },
    });
  });

  it("rejects scope=tool:atlas even with every other operator claim present", async () => {
    const token = await sign({ ...validClaims, scope: "tool:atlas" });

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toMatchObject({
      response: { code: "OPERATOR_TOKEN_WRONG_SCOPE" },
    });
  });

  it("rejects realm != workforce", async () => {
    const token = await sign({ ...validClaims, realm: "tenant" });

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toMatchObject({
      response: { code: "OPERATOR_TOKEN_WRONG_REALM" },
    });
  });

  it("rejects userType != operator", async () => {
    const token = await sign({ ...validClaims, userType: "customer" });

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toMatchObject({
      response: { code: "OPERATOR_TOKEN_WRONG_USER_TYPE" },
    });
  });

  it("rejects a token missing sub - M-5 has no fallback for attribution", async () => {
    const { sub: _sub, ...withoutSub } = validClaims;
    const token = await sign(withoutSub);

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toMatchObject({
      response: { code: "OPERATOR_TOKEN_MISSING_SUB" },
    });
  });

  it("rejects a token missing act.sub", async () => {
    const { act: _act, ...withoutAct } = validClaims;
    const token = await sign(withoutAct);

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toMatchObject({
      response: { code: "OPERATOR_TOKEN_MISSING_ACT" },
    });
  });

  it("rejects the wrong audience", async () => {
    const token = await sign(validClaims, { audience: "ontos" });

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await sign(validClaims, { expiresIn: "-1h" });

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toThrow();
  });

  it("rejects HS256-signed tokens", async () => {
    const secret = new TextEncoder().encode("shared-secret-not-allowed");
    const token = await new SignJWT(validClaims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(secret);

    await expect(
      verifyOperatorToken(token, { jwks, issuer: ISSUER }),
    ).rejects.toThrow();
  });

  it("defaults amr to [] and omits operatorRole when absent", async () => {
    const { amr: _amr, operator_role: _role, ...rest } = validClaims;
    const token = await sign(rest);

    const ctx = await verifyOperatorToken(token, { jwks, issuer: ISSUER });

    expect(ctx.amr).toEqual([]);
    expect(ctx.operatorRole).toBeUndefined();
  });

  it("ignores a non-array amr rather than throwing", async () => {
    const token = await sign({ ...validClaims, amr: "pwd" });

    const ctx = await verifyOperatorToken(token, { jwks, issuer: ISSUER });

    expect(ctx.amr).toEqual([]);
  });

  // Cross-guard proof, not duplicated coverage: an operator token must also
  // fail S2sAuthGuard's own verification, so the disjointness holds in both
  // directions, not just the one this guard enforces.
  it("a valid operator token is rejected by verifyS2sToken (mode is not obo/service)", async () => {
    const token = await sign(validClaims);

    await expect(
      verifyS2sToken(token, { jwks, issuer: ISSUER, audience: AUDIENCE }),
    ).rejects.toThrow();
  });
});

describe("hasStepUpFactor", () => {
  it("is false for an empty amr", () => {
    expect(hasStepUpFactor([])).toBe(false);
  });

  it("is false for password-only amr", () => {
    expect(hasStepUpFactor(["pwd"])).toBe(false);
  });

  it("is false for password-only amr regardless of case/whitespace", () => {
    expect(hasStepUpFactor([" PWD "])).toBe(false);
  });

  it("is true when a second factor is present alongside pwd", () => {
    expect(hasStepUpFactor(["pwd", "otp"])).toBe(true);
  });

  it("is true for a single non-password factor", () => {
    expect(hasStepUpFactor(["webauthn"])).toBe(true);
  });
});

describe("StepUpRequiredGuard", () => {
  const guard = new StepUpRequiredGuard();

  function makeContext(auth?: OperatorAuthContext) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, operatorAuth: auth }),
      }),
    } as never;
  }

  it("passes when the verified token has a step-up factor", () => {
    expect(
      guard.canActivate(
        makeContext({
          operatorId: "opr_1",
          actorClientId: "admin",
          amr: ["pwd", "otp"],
        }),
      ),
    ).toBe(true);
  });

  it("rejects when the verified token has only pwd", () => {
    expect(() =>
      guard.canActivate(
        makeContext({ operatorId: "opr_1", actorClientId: "admin", amr: ["pwd"] }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: "OPERATOR_STEP_UP_REQUIRED" }),
      }),
    );
  });

  it("fails closed if OperatorAuthGuard did not run first", () => {
    // Defensive path, not an expected caller state - proves the guard does
    // not throw an unhandled TypeError on req.operatorAuth being undefined.
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: "OPERATOR_TOKEN_MISSING" }),
      }),
    );
  });
});
