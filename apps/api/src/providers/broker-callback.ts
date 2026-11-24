const CALLBACK_PROVIDERS = new Set(["ZERODHA", "UPSTOX", "FYERS", "ANGEL_ONE", "FIVE_PAISA"]);

/**
 * Build the exact callback route registered by broker-oauth.ts.
 * The configured value is the public API origin/base, not a broker callback path.
 */
export function buildBrokerCallbackUri(apiBase: string, provider: string): string {
  const normalizedProvider = provider.toUpperCase();
  if (!CALLBACK_PROVIDERS.has(normalizedProvider)) {
    throw new Error("BROKER_CALLBACK_PROVIDER_UNSUPPORTED");
  }

  let base: URL;
  try {
    base = new URL(apiBase);
  } catch {
    throw new Error("BROKER_CALLBACK_BASE_INVALID");
  }

  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error("BROKER_CALLBACK_BASE_MUST_BE_PUBLIC_HTTPS");
  }

  const prefix = base.pathname.replace(/\\/+$/, "");
  return `${base.origin}${prefix}/api/v1/brokers/oauth/${normalizedProvider.toLowerCase()}/callback`;
}
