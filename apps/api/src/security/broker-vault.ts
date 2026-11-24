import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";

const context = { application: "salts-copydesk", purpose: "broker-credentials", version: "1" };
let client: KMSClient | undefined;

function kms(): { client: KMSClient; keyId: string } {
  const keyId = process.env.BROKER_SECRETS_KMS_KEY_ID;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!keyId || !region) throw new Error("BROKER_VAULT_NOT_CONFIGURED");
  client ??= new KMSClient({ region });
  return { client, keyId };
}

export interface EncryptedBrokerSecret {
  ciphertext: Buffer;
  fingerprint: string;
}

/** Envelope encryption: KMS protects a per-record AES-256 data key; credentials are AES-256-GCM encrypted. */
export async function encryptBrokerSecret(secret: Record<string, string>): Promise<EncryptedBrokerSecret> {
  const { client: kmsClient, keyId } = kms();
  const plaintext = Buffer.from(JSON.stringify(secret), "utf8");
  const generated = await kmsClient.send(new GenerateDataKeyCommand({
    KeyId: keyId,
    KeySpec: "AES_256",
    EncryptionContext: context
  }));
  if (!generated.Plaintext || !generated.CiphertextBlob) throw new Error("BROKER_VAULT_KMS_FAILED");
  const dataKey = Buffer.from(generated.Plaintext);
  generated.Plaintext.fill(0);
  const nonce = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
    cipher.setAAD(Buffer.from("salts-broker-credential-v1", "utf8"));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = {
      version: 1,
      algorithm: "AES-256-GCM",
      nonce: nonce.toString("base64"),
      tag: tag.toString("base64"),
      encryptedDataKey: Buffer.from(generated.CiphertextBlob).toString("base64"),
      ciphertext: encrypted.toString("base64")
    };
    const fingerprint = createHash("sha256").update(plaintext).digest("hex").slice(0, 16);
    return { ciphertext: Buffer.from(JSON.stringify(envelope), "utf8"), fingerprint };
  } finally {
    plaintext.fill(0);
    dataKey.fill(0);
  }
}

/** Decryption is server-only and must be called only inside a provider adapter operation. */
export async function decryptBrokerSecret(ciphertext: Uint8Array): Promise<Record<string, string>> {
  const { client: kmsClient } = kms();
  const envelope = JSON.parse(Buffer.from(ciphertext).toString("utf8")) as {
    version: number; algorithm: string; nonce: string; tag: string; encryptedDataKey: string; ciphertext: string;
  };
  if (envelope.version !== 1 || envelope.algorithm !== "AES-256-GCM") throw new Error("BROKER_VAULT_INVALID_ENVELOPE");
  const decryptedKey = await kmsClient.send(new DecryptCommand({
    CiphertextBlob: Buffer.from(envelope.encryptedDataKey, "base64"),
    EncryptionContext: context
  }));
  if (!decryptedKey.Plaintext) throw new Error("BROKER_VAULT_KMS_FAILED");
  const key = Buffer.from(decryptedKey.Plaintext);
  decryptedKey.Plaintext.fill(0);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonce, "base64"));
    decipher.setAAD(Buffer.from("salts-broker-credential-v1", "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    try {
      const parsed = JSON.parse(plaintext.toString("utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("BROKER_VAULT_INVALID_SECRET");
      return parsed as Record<string, string>;
    } finally { plaintext.fill(0); }
  } finally { key.fill(0); }
}
