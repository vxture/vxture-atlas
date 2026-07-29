/**
 * operator-auth.guard.ts - management-plane operator-token verification
 * (product_250_management-plane-contract.md §2 M-1/M-5, vxture-atlas#52).
 *
 * Guards the capability plane (`/capability/*`) - registry CRUD and
 * provider-keys. Replaces the previous unauthenticated-registry /
 * S2sAuthGuard-on-provider-keys posture: registry routes were open to
 * anything on the network, and guarding provider-keys with `S2sAuthGuard`
 * asserted a *service* identity where the actual actor is a *person*
 * (admin-bff cannot present an S2S token on an operator's behalf - that is
 * exactly the gap this issue closes).
 *
 * Token contract (minted by the platform's token-exchange operator-OBO
 * mode): RS256, same issuer/JWKS `S2sAuthGuard` trusts. `aud="atlas"` ·
 * `sub="opr_<operator uuid>"` · `act.sub`=workforce client_id (currently
 * `"admin"`) · `mode="operator"` · `userType="operator"` · `realm="workforce"`
 * · `scope="mgmt:atlas"` · `amr` (mirrored from the operator session when
 * present) · `operator_role` (when present) · `exp` (TTL 300s) · `jti`.
 *
 * `scope` discipline: management tokens carry `mgmt:atlas`, S2S tokens carry
 * `tool:atlas` - the two audiences are structurally disjoint by design
 * (product_250 §2: "管理票过不了供给面守卫，反之亦然"). This guard only
 * accepts `mgmt:atlas`; `S2sAuthGuard` only accepts `tool:atlas`.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

import {
  extractBearerToken,
  requireIssuer,
  resolveRemoteJwks,
} from "./jwt-shared";

const CLOCK_TOLERANCE_SECONDS = 60;
const AUDIENCE = "atlas";
const REQUIRED_REALM = "workforce";
const REQUIRED_USER_TYPE = "operator";
const REQUIRED_SCOPE = "mgmt:atlas";

export interface OperatorAuthContext {
  /** `opr_<uuid>` - the verified operator's identity (M-5 attribution). */
  operatorId: string;
  /** Workforce RP client id that minted the OBO exchange (`act.sub`). */
  actorClientId: string;
  amr: string[];
  operatorRole?: string;
  jti?: string;
}

export interface OperatorAuthenticatedRequest {
  headers: Record<string, unknown>;
  operatorAuth?: OperatorAuthContext;
}

export async function verifyOperatorToken(
  token: string,
  options: { jwks: JWTVerifyGetKey; issuer: string },
): Promise<OperatorAuthContext> {
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, options.jwks, {
      algorithms: ["RS256"],
      issuer: options.issuer,
      audience: AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    payload = result.payload;
  } catch {
    throw new UnauthorizedException({
      code: "OPERATOR_TOKEN_INVALID",
      message: "Operator token failed verification",
    });
  }

  if (payload["scope"] !== REQUIRED_SCOPE) {
    // Disjoint-by-design (product_250 §2) - an S2S tool:atlas token must
    // 401 here exactly as an mgmt:atlas token must 401 on S2sAuthGuard.
    throw new UnauthorizedException({
      code: "OPERATOR_TOKEN_WRONG_SCOPE",
      message: `Operator token must carry scope="${REQUIRED_SCOPE}"`,
    });
  }

  if (payload["realm"] !== REQUIRED_REALM) {
    throw new UnauthorizedException({
      code: "OPERATOR_TOKEN_WRONG_REALM",
      message: `Operator token must carry realm="${REQUIRED_REALM}"`,
    });
  }

  if (payload["userType"] !== REQUIRED_USER_TYPE) {
    throw new UnauthorizedException({
      code: "OPERATOR_TOKEN_WRONG_USER_TYPE",
      message: `Operator token must carry userType="${REQUIRED_USER_TYPE}"`,
    });
  }

  const operatorId = typeof payload.sub === "string" ? payload.sub : undefined;
  if (!operatorId) {
    // M-5: attribution has no fallback - a token with no verifiable operator
    // identity cannot be allowed to mutate anything under this guard.
    throw new UnauthorizedException({
      code: "OPERATOR_TOKEN_MISSING_SUB",
      message: "Operator token is missing sub (operator identity)",
    });
  }

  const act = payload["act"] as { sub?: unknown } | undefined;
  const actorClientId = typeof act?.sub === "string" ? act.sub : undefined;
  if (!actorClientId) {
    throw new UnauthorizedException({
      code: "OPERATOR_TOKEN_MISSING_ACT",
      message: "Operator token is missing act.sub (workforce RP identity)",
    });
  }

  const rawAmr = payload["amr"];
  const amr = Array.isArray(rawAmr)
    ? rawAmr.filter((v): v is string => typeof v === "string")
    : [];
  const operatorRole =
    typeof payload["operator_role"] === "string"
      ? payload["operator_role"]
      : undefined;

  return {
    operatorId,
    actorClientId,
    amr,
    ...(operatorRole !== undefined ? { operatorRole } : {}),
    ...(typeof payload.jti === "string" ? { jti: payload.jti } : {}),
  };
}

/**
 * Step-up freshness (M-1 item 2, product_250 §2: "高危端点...额外校 step-up
 * 新鲜度(amr claim)"). The contract gives one concrete example -
 * `amr: ["pwd","otp"]` - and no enumerated policy of which factors qualify;
 * per product_250's own division of labor ("step-up 策略...归 platform"),
 * the *policy* is platform's to set, this is a defensible baseline pending
 * their correction: step-up means the session verified something beyond the
 * primary password. An absent/empty `amr`, or one containing only `pwd`,
 * does not count.
 */
export function hasStepUpFactor(amr: string[]): boolean {
  return amr.some((factor) => factor.trim().toLowerCase() !== "pwd");
}

@Injectable()
export class OperatorAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<OperatorAuthenticatedRequest>();
    const token = extractBearerToken(req.headers);
    if (!token) {
      throw new UnauthorizedException({
        code: "OPERATOR_TOKEN_MISSING",
        message: "Missing operator bearer token",
      });
    }

    const issuer = requireIssuer();
    req.operatorAuth = await verifyOperatorToken(token, {
      jwks: resolveRemoteJwks(issuer),
      issuer,
    });
    return true;
  }
}

/**
 * Additive guard for high-stakes provider-key mutations (create / rotate /
 * activate / deactivate, M-1 item 2). Runs after `OperatorAuthGuard` (Nest
 * runs `@UseGuards` left-to-right, and controller-level guards before
 * method-level ones) so `req.operatorAuth` is always populated first - if it
 * is not, that is this guard's own bug, not a caller's fault, so it fails
 * closed with a 401 rather than throwing a raw TypeError.
 */
@Injectable()
export class StepUpRequiredGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<OperatorAuthenticatedRequest>();
    const auth = req.operatorAuth;
    if (!auth) {
      throw new UnauthorizedException({
        code: "OPERATOR_TOKEN_MISSING",
        message: "Missing operator bearer token",
      });
    }

    if (!hasStepUpFactor(auth.amr)) {
      throw new UnauthorizedException({
        code: "OPERATOR_STEP_UP_REQUIRED",
        message:
          "This action requires step-up verification (amr beyond password) - re-authenticate with an additional factor",
      });
    }

    return true;
  }
}
