/**
 * s2s-auth.guard.ts - product_210 S2S token exchange 被调方校验 (§3.3)
 * @package @atlas/service
 * @layer Domain
 * @category guard
 * @author AI-Generated
 * @date 2026-07-24
 *
 * @description
 *   Verifies the RS256 S2S access token issued by the platform's token-exchange
 *   endpoint (`product_210` §3.2). Implements the eight callee obligations in
 *   §3.3: RS256-only (rule 1), kid-based JWKS lookup with cache (rule 2, via
 *   `jose`'s remote JWKS set), exact `iss` match (rule 3), single-value `aud`
 *   match (rule 4), `exp` with 60s skew (rule 5), required `act.sub` (rule 6).
 *   Rule 7 (never accept `AUTH_INTERNAL_TOKEN` as an inter-product credential)
 *   and rule 8 (never trust header/body-supplied org/workspace context) are
 *   satisfied by omission: this guard only reads the `Authorization: Bearer`
 *   header and only derives context from verified token claims.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

const CLOCK_TOLERANCE_SECONDS = 60;
const JWKS_PATH = "/oidc/jwks";
const DEFAULT_AUDIENCE = "atlas";

export interface S2sAuthContext {
  callerProductCode: string;
  mode: "obo" | "service";
  scope: string;
  orgId?: string;
  workspaceId?: string;
  userId?: string;
  jti?: string;
}

export interface S2sAuthenticatedRequest {
  headers: Record<string, unknown>;
  s2sAuth?: S2sAuthContext;
}

export async function verifyS2sToken(
  token: string,
  options: { jwks: JWTVerifyGetKey; issuer: string; audience: string },
): Promise<S2sAuthContext> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, options.jwks, {
      algorithms: ["RS256"],
      issuer: options.issuer,
      audience: options.audience,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    payload = result.payload;
  } catch {
    throw new UnauthorizedException({
      code: "S2S_TOKEN_INVALID",
      message: "S2S token failed verification",
    });
  }

  const act = payload["act"] as { sub?: unknown } | undefined;
  const callerProductCode = typeof act?.sub === "string" ? act.sub : undefined;
  if (!callerProductCode) {
    // rule 6: act.sub 必须存在 - 无 act = 用户级 token 混用，拒
    throw new UnauthorizedException({
      code: "S2S_TOKEN_MISSING_ACT",
      message: "S2S token is missing act.sub (caller product identity)",
    });
  }

  const mode = payload["mode"];
  if (mode !== "obo" && mode !== "service") {
    throw new UnauthorizedException({
      code: "S2S_TOKEN_INVALID_MODE",
      message: "S2S token has an unrecognized mode claim",
    });
  }

  const orgId = payload["org_id"];
  const workspaceId = payload["workspace_id"];

  return {
    callerProductCode,
    mode,
    scope: typeof payload["scope"] === "string" ? payload["scope"] : "",
    ...(typeof orgId === "string" ? { orgId } : {}),
    ...(typeof workspaceId === "string" ? { workspaceId } : {}),
    ...(typeof payload.sub === "string" ? { userId: payload.sub } : {}),
    ...(typeof payload.jti === "string" ? { jti: payload.jti } : {}),
  };
}

let cachedJwks: JWTVerifyGetKey | undefined;
let cachedJwksUri: string | undefined;

function resolveRemoteJwks(issuer: string): JWTVerifyGetKey {
  const jwksUri = `${issuer.replace(/\/$/, "")}${JWKS_PATH}`;
  if (!cachedJwks || cachedJwksUri !== jwksUri) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUri));
    cachedJwksUri = jwksUri;
  }
  return cachedJwks;
}

function requireIssuer(): string {
  const issuer = process.env["OIDC_ISSUER"];
  if (!issuer) {
    throw new UnauthorizedException({
      code: "S2S_ISSUER_NOT_CONFIGURED",
      message: "OIDC_ISSUER is not configured",
    });
  }
  return issuer;
}

@Injectable()
export class S2sAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<S2sAuthenticatedRequest>();
    const token = extractBearerToken(req.headers);
    if (!token) {
      throw new UnauthorizedException({
        code: "S2S_TOKEN_MISSING",
        message: "Missing S2S bearer token",
      });
    }

    const issuer = requireIssuer();
    const audience = process.env["S2S_AUDIENCE"] || DEFAULT_AUDIENCE;

    req.s2sAuth = await verifyS2sToken(token, {
      jwks: resolveRemoteJwks(issuer),
      issuer,
      audience,
    });
    return true;
  }
}

function extractBearerToken(
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
