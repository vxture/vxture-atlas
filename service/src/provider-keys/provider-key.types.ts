/** Metadata-only view of a provider key - never carries plaintext or ciphertext. */
export interface ProviderKeyAdminRecord {
  id: string;
  providerCode: string;
  keyAlias: string;
  keyScope: string;
  isActive: boolean;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderKeyBody {
  providerCode?: string;
  keyAlias?: string;
  /** Write-only: accepted once here, never echoed back by any read endpoint. */
  plaintextKey?: string;
  keyScope?: string;
}

export interface RotateProviderKeyBody {
  /** Write-only: the new secret value replacing the current one under the same alias. */
  plaintextKey?: string;
  rotatedBy?: string;
  reason?: string;
}
