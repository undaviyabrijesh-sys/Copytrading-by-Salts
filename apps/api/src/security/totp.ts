import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ISSUER = "Copy Trading by Salts";

function encryptionKey(): Buffer {
  const encoded = process.env.MFA_ENCRYPTION_KEY;
  if (!encoded) throw new Error("MFA_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encodeBase32(input: Buffer): string {
  let bits = 0, value = 0, output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Buffer {
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function encryptTotpSecret(secret: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptTotpSecret(encrypted: Uint8Array): string {
  const data = Buffer.from(encrypted);
  if (data.length < 29) throw new Error("Encrypted TOTP secret is invalid.");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpProvisioningUri(secret: string, email: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 30000);
  for (let offset = -1; offset <= 1; offset++) {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter + offset));
    const digest = createHmac("sha1", key).update(message).digest();
    const index = digest[digest.length - 1] & 15;
    const binary = ((digest[index] & 127) << 24) | ((digest[index + 1] & 255) << 16) | ((digest[index + 2] & 255) << 8) | (digest[index + 3] & 255);
    if ((binary % 1_000_000).toString().padStart(6, "0") === code) return true;
  }
  return false;
}

export function newTotpSecret(): { secret: string; encrypted: Buffer } {
  const secret = generateTotpSecret();
  return { secret, encrypted: encryptTotpSecret(secret) };
}
