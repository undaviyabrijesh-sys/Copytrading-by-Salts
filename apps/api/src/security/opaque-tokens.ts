import { createHash, randomBytes } from "node:crypto";

export interface IssuedOpaqueToken {
  token: string;
  tokenHash: string;
}

/** Generate a high-entropy bearer token. Persist only tokenHash, never token. */
export function issueOpaqueToken(): IssuedOpaqueToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashOpaqueToken(token) };
}

/** SHA-256 is appropriate here because tokens are random 256-bit secrets, not human passwords. */
export function hashOpaqueToken(token: string): string {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    throw new Error("Invalid opaque token.");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isTokenUsable(input: {
  expiresAt: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return input.usedAt == null && input.revokedAt == null && input.expiresAt.getTime() > now.getTime();
}
