import { createHmac } from "node:crypto";

export function createDeltaSignature(input: {
  secret: string;
  method: string;
  timestamp: string;
  path: string;
  queryString?: string;
  body?: string;
}): string {
  if (!input.secret || !/^\/(?!\/)/.test(input.path)) throw new Error("DELTA_SIGNATURE_INPUT_INVALID");
  const message = input.method.toUpperCase() + input.timestamp + input.path +
    (input.queryString ?? "") + (input.body ?? "");
  return createHmac("sha256", input.secret).update(message, "utf8").digest("hex");
}

export async function verifyDeltaAccount(credentials: Record<string, string>): Promise<{ ok: true }> {
  const apiKey = credentials.apiKey?.trim();
  const apiSecret = credentials.apiSecret?.trim();
  if (!apiKey || !apiSecret) throw new Error("DELTA_CREDENTIALS_INCOMPLETE");

  // Delta India production endpoint only. Demo/global keys must not be mixed with it.
  const method = "GET";
  const path = "/v2/users/trading_preferences";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createDeltaSignature({ secret: apiSecret, method, timestamp, path });
  const response = await fetch(`https://api.india.delta.exchange${path}`, {
    method,
    headers: {
      "api-key": apiKey,
      signature,
      timestamp,
      "User-Agent": "Salts-CopyDesk/0.1",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as { success?: boolean; error?: { code?: string; message?: string } } | null;
  if (!response.ok || payload?.success !== true) {
    const providerCode = payload?.error?.code ?? payload?.error?.message;
    if (response.status === 401 || /invalid.*key|signature/i.test(providerCode ?? "")) {
      throw new Error("DELTA_AUTHENTICATION_FAILED");
    }
    if (response.status === 403 || /ip.*whitelist|unauthorized/i.test(providerCode ?? "")) {
      throw new Error("DELTA_IP_OR_PERMISSION_CHECK_FAILED");
    }
    if (response.status === 429) throw new Error("DELTA_RATE_LIMITED");
    throw new Error("DELTA_PROVIDER_UNAVAILABLE");
  }
  return { ok: true };
}
