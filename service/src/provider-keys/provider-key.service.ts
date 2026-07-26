/**
 * provider-key.service.ts - Phase A provider-key vault (envelope encryption, TD-003 follow-up).
 * Replaces the apiKeyEnvVar/env-var path for provider secrets: adding or rotating a
 * key is a DB write via this service, not a redeploy. Only the master key set
 * (PROVIDER_KEY_ENCRYPTION_KEYS) is env-configured, and that only changes on the
 * rare master-key-rotation event, not per provider.
 */
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";

import {
  decryptProviderKey,
  encryptProviderKey,
} from "./provider-key-crypto";
import { ProviderKeyException } from "./provider-key.errors";
import { ProviderKeyRepository } from "./provider-key.repository";
import type {
  CreateProviderKeyBody,
  ProviderKeyAdminRecord,
  RotateProviderKeyBody,
} from "./provider-key.types";
import type { ProviderApiKeyRow } from "../prisma";

const VALID_KEY_SCOPES = new Set(["shared", "dedicated"]);
const PRISMA_UNIQUE_VIOLATION = "P2002";

function toAdminRecord(row: ProviderApiKeyRow): ProviderKeyAdminRecord {
  return {
    id: row.id,
    providerCode: row.providerCode,
    keyAlias: row.keyAlias,
    keyScope: row.keyScope,
    isActive: row.isActive,
    lastRotatedAt: row.lastRotatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
  );
}

@Injectable()
export class ProviderKeyService {
  private readonly logger = new Logger(ProviderKeyService.name);

  constructor(
    @Inject(ProviderKeyRepository)
    private readonly repository: ProviderKeyRepository,
  ) {}

  async list(providerCode?: string): Promise<ProviderKeyAdminRecord[]> {
    const rows = await this.repository.list(providerCode);
    return rows.map(toAdminRecord);
  }

  async create(body: CreateProviderKeyBody): Promise<ProviderKeyAdminRecord> {
    const providerCode = body.providerCode?.trim();
    if (!providerCode) {
      throw new ProviderKeyException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_KEY_VALIDATION_FAILED",
        "providerCode is required",
        { field: "providerCode" },
      );
    }

    const keyAlias = body.keyAlias?.trim();
    if (!keyAlias) {
      throw new ProviderKeyException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_KEY_VALIDATION_FAILED",
        "keyAlias is required",
        { field: "keyAlias" },
      );
    }

    if (!body.plaintextKey || !body.plaintextKey.trim()) {
      throw new ProviderKeyException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_KEY_VALIDATION_FAILED",
        "plaintextKey is required",
        { field: "plaintextKey" },
      );
    }

    const keyScope = body.keyScope?.trim() || "shared";
    if (!VALID_KEY_SCOPES.has(keyScope)) {
      throw new ProviderKeyException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_KEY_VALIDATION_FAILED",
        'keyScope must be "shared" or "dedicated"',
        { field: "keyScope" },
      );
    }

    const { encryptedKey, encryptionKeyId } = encryptProviderKey(
      body.plaintextKey,
    );

    try {
      const row = await this.repository.create({
        providerCode,
        keyAlias,
        encryptedKey,
        encryptionKeyId,
        keyScope,
      });
      return toAdminRecord(row);
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        throw new ProviderKeyException(
          HttpStatus.CONFLICT,
          "PROVIDER_KEY_VALIDATION_FAILED",
          `A key with alias "${keyAlias}" already exists for provider "${providerCode}"`,
          { field: "keyAlias" },
        );
      }
      throw error;
    }
  }

  /** Rotates the secret material in place under the same (providerCode, keyAlias); old ciphertext is overwritten, never retained. */
  async rotate(
    providerKeyId: string,
    body: RotateProviderKeyBody,
  ): Promise<ProviderKeyAdminRecord> {
    const existing = await this.repository.findById(providerKeyId);
    if (!existing) {
      throw new ProviderKeyException(
        HttpStatus.NOT_FOUND,
        "PROVIDER_KEY_NOT_FOUND",
        `Provider key "${providerKeyId}" not found`,
        { providerKeyId },
      );
    }

    if (!body.plaintextKey || !body.plaintextKey.trim()) {
      throw new ProviderKeyException(
        HttpStatus.BAD_REQUEST,
        "PROVIDER_KEY_VALIDATION_FAILED",
        "plaintextKey is required",
        { field: "plaintextKey" },
      );
    }

    const { encryptedKey, encryptionKeyId } = encryptProviderKey(
      body.plaintextKey,
    );

    const row = await this.repository.update(providerKeyId, {
      encryptedKey,
      encryptionKeyId,
      isActive: true,
      lastRotatedAt: new Date(),
    });

    await this.repository.recordRotation({
      providerApiKeyId: providerKeyId,
      ...(body.rotatedBy !== undefined ? { rotatedBy: body.rotatedBy } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });

    this.logger.log(
      `provider key rotated: ${row.providerCode}/${row.keyAlias} (${providerKeyId})`,
    );

    return toAdminRecord(row);
  }

  async setActive(
    providerKeyId: string,
    isActive: boolean,
  ): Promise<ProviderKeyAdminRecord> {
    const existing = await this.repository.findById(providerKeyId);
    if (!existing) {
      throw new ProviderKeyException(
        HttpStatus.NOT_FOUND,
        "PROVIDER_KEY_NOT_FOUND",
        `Provider key "${providerKeyId}" not found`,
        { providerKeyId },
      );
    }

    const row = await this.repository.update(providerKeyId, { isActive });
    return toAdminRecord(row);
  }

  /** Runtime resolution path - decrypts in memory only, never logged, never returned over any admin endpoint. */
  async resolveKey(
    providerCode: string,
    keyAlias: string,
  ): Promise<string | null> {
    const row = await this.repository.findByCodeAndAlias(providerCode, keyAlias);
    if (!row || !row.isActive) return null;
    return decryptProviderKey(row.encryptedKey, row.encryptionKeyId);
  }
}
