/**
 * internal-diagnostics.guard.ts - 模型平台内部诊断访问保护
 * @package @vxture/service-model-platform
 * @layer Domain
 * @category guard
 * @author AI-Generated
 * @date 2026-06-07
 */
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class InternalDiagnosticsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const headers = (req.headers ?? {}) as Record<string, unknown>;

    const allowInternalAll = process.env["ALLOW_INTERNAL_DIAGNOSTICS"] === "1";
    if (allowInternalAll) {
      return true;
    }

    const sourceIp = getRequestIp(req.ip, req.socket?.remoteAddress);

    // 容器内 loopback 访问（如 docker exec curl localhost/metrics、部署后 40-verify 巡检）
    // 来自服务自身网络命名空间，天然内部可信；外部访问仍需 header / token / IP 白名单。
    if (isLoopbackIp(sourceIp)) {
      return true;
    }

    const token = process.env["INTERNAL_DIAGNOSTICS_TOKEN"];
    const allowIps = parseAllowList(
      process.env["INTERNAL_DIAGNOSTICS_ALLOW_IPS"],
    );
    const hasAuth =
      isInternalCallHeaderAllowed(headers) || hasInternalToken(headers, token);

    if (!hasAuth) {
      return false;
    }

    if (allowIps.length === 0) {
      return true;
    }

    return isIpAllowed(sourceIp, allowIps);
  }
}

function parseAllowList(raw?: string): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRequestIp(ip?: string, remoteAddress?: string): string | undefined {
  return normalizeIp(ip) || normalizeIp(remoteAddress);
}

function isLoopbackIp(ip?: string): boolean {
  if (!ip) {
    return false;
  }

  // normalizeIp 已去除 ::ffff: 前缀，故 ::ffff:127.0.0.1 → 127.0.0.1。
  return ip === "::1" || ip === "127.0.0.1" || ip.startsWith("127.");
}

function normalizeIp(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/^::ffff:/i, "");
}

function isInternalCallHeaderAllowed(
  headers: Record<string, unknown>,
): boolean {
  const rawHeader =
    headers["x-internal-call"] || headers["x-internal-call".toLowerCase()];

  if (Array.isArray(rawHeader)) {
    return rawHeader.includes("1");
  }

  return rawHeader === "1";
}

function hasInternalToken(
  headers: Record<string, unknown>,
  token: string | undefined,
): boolean {
  if (!token) {
    return false;
  }

  const tokenHeader =
    headers["x-internal-token"] || headers["x-internal-token".toLowerCase()];

  if (Array.isArray(tokenHeader)) {
    return tokenHeader.includes(token);
  }

  return tokenHeader === token;
}

function isIpAllowed(
  remoteIp: string | undefined,
  allowList: string[],
): boolean {
  if (allowList.length === 0) {
    return true;
  }

  if (!remoteIp) {
    return false;
  }

  for (const allow of allowList) {
    if (isIpMatch(remoteIp, allow)) {
      return true;
    }
  }

  return false;
}

function isIpMatch(remoteIp: string, allow: string): boolean {
  if (allow === "*") {
    return true;
  }

  if (allow.includes("/")) {
    return isIpInCidr(remoteIp, allow);
  }

  return remoteIp === allow;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [network, bitsStr] = cidr.split("/", 2);
  if (!network || !bitsStr) {
    return false;
  }

  const bits = Number(bitsStr);

  if (
    !isValidIp4(network) ||
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > 32
  ) {
    return false;
  }

  const ipValue = parseIp4(ip);
  const netValue = parseIp4(network);

  if (ipValue === null || netValue === null) {
    return false;
  }

  if (bits === 0) {
    return true;
  }

  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipValue & mask) === (netValue & mask);
}

function isValidIp4(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function parseIp4(value: string): number | null {
  if (!isValidIp4(value)) {
    return null;
  }

  const parts = value.split(".").map((item) => Number(item));
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  return (
    ((parts[0]! << 24) >>> 0) +
    ((parts[1]! << 16) >>> 0) +
    ((parts[2]! << 8) >>> 0) +
    (parts[3]! >>> 0)
  );
}
