/**
 * jwt-shared.ts - RS256/JWKS plumbing shared by every token-verifying guard.
 * Both `S2sAuthGuard` (S2S supply surface, `tool:atlas`) and
 * `OperatorAuthGuard` (management plane, `mgmt:atlas`, vxture-atlas#52)
 * trust the same platform issuer/JWKS - factored out so there is one JWKS
 * cache, not two, and one place that reads `OIDC_ISSUER`.
 */
import { UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

const JWKS_PATH = "/oidc/jwks";

let cachedJwks: JWTVerifyGetKey | undefined;
let cachedJwksUri: string | undefined;

export function resolveRemoteJwks(issuer: string): JWTVerifyGetKey {
  const jwksUri = `${issuer.replace(/\/$/, "")}${JWKS_PATH}`;
  if (!cachedJwks || cachedJwksUri !== jwksUri) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUri));
    cachedJwksUri = jwksUri;
  }
  return cachedJwks;
}

export function requireIssuer(): string {
  const issuer = process.env["OIDC_ISSUER"];
  if (!issuer) {
    throw new UnauthorizedException({
      code: "AUTH_ISSUER_NOT_CONFIGURED",
      message: "OIDC_ISSUER is not configured",
    });
  }
  return issuer;
}

export function extractBearerToken(
  headers: Record<string, unknown>,
): string | undefined {
  const raw = headers["authorization"] ?? headers["Authorization"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1];
}
