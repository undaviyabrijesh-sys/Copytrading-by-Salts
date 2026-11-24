export type CredentialField = { key: string; label: string; secret: true };
export type CredentialProvider = {
  id: string;
  label: string;
  market: "INDIA" | "CRYPTO";
  auth: "API_TOKEN" | "API_KEY_SECRET" | "OAUTH";
  fields: CredentialField[];
  docsUrl: string;
  connectEnabled: boolean;
  note: string;
};

export const credentialProviders: CredentialProvider[] = [
  { id: "DHAN", label: "DhanHQ", market: "INDIA", auth: "API_TOKEN", fields: [{ key: "accessToken", label: "DhanHQ access token", secret: true }], docsUrl: "https://dhanhq.co/docs/v2/authentication/", connectEnabled: true, note: "Token-only connection. Order permission and static-IP eligibility are not verified until a provider health check is implemented." },
  { id: "GROWW", label: "Groww Trade API", market: "INDIA", auth: "API_TOKEN", fields: [{ key: "accessToken", label: "Groww Trading API access token", secret: true }], docsUrl: "https://groww.in/trade-api/docs", connectEnabled: true, note: "Token-only connection. Daily expiry applies; account and order permissions remain unverified." },
  { id: "DELTA_INDIA", label: "Delta Exchange India", market: "CRYPTO", auth: "API_KEY_SECRET", fields: [{ key: "apiKey", label: "API key", secret: true }, { key: "apiSecret", label: "API secret", secret: true }], docsUrl: "https://docs.delta.exchange/", connectEnabled: true, note: "Use India production credentials, IP allowlisting and no withdrawal permission. Connection remains pending until signed health checks are implemented." },
  ...([
    ["ZERODHA", "Zerodha Kite Connect", "https://kite.trade/docs/connect/v3/"],
    ["ANGEL_ONE", "Angel One SmartAPI", "https://smartapi.angelone.in/docs"],
    ["UPSTOX", "Upstox", "https://upstox.com/developer/api-documentation/authentication/"],
    ["FYERS", "FYERS API v3", "https://fyers.in/api-docs/v3/api/authentication/third-party-app/"],
    ["SHOONYA", "Shoonya", "https://www.shoonya.com/api-documentation/auth-overview"],
    ["FLATTRADE", "Flattrade Pi", "https://pi.flattrade.in/docs"],
    ["FIVE_PAISA", "5paisa Xstream", "https://xstream.5paisa.com/dev-docs/docFundamentals/integration-flow"],
    ["ICICI_BREEZE", "ICICI Direct Breeze", "https://api.icicidirect.com/breezeapi/documents/index.html"],
    ["KOTAK_NEO", "Kotak Neo", "https://www.kotakneo.com/"],
    ["ALICE_BLUE", "Alice Blue ANT", "https://ant.aliceblueonline.com/productdocumentation/"]
  ] as const).map(([id, label, docsUrl]) => ({
    id, label, market: "INDIA" as const, auth: "OAUTH" as const, fields: [], docsUrl, connectEnabled: false,
    note: "OAuth/partner flow is not implemented. No credential form is available for this provider yet."
  })),
  ...([
    ["IIFL", "IIFL Securities", "https://www.iiflcapital.com/"],
    ["MOTILAL_OSWAL", "Motilal Oswal", "https://www.motilaloswal.com/"],
    ["SAMCO", "SAMCO", "https://www.samco.in/"],
    ["TRADEJINI", "Tradejini", "https://tradejini.com/"],
    ["NUVAMA", "Nuvama", "https://www.nuvama.com/"],
    ["HDFC_SKY", "HDFC SKY", "https://www.hdfcsky.com/"],
    ["MSTOCK", "m.Stock", "https://www.mstock.com/"],
    ["SHAREKHAN", "Sharekhan", "https://www.sharekhan.com/"],
    ["AXIS_DIRECT", "Axis Direct", "https://www.axisdirect.in/"],
    ["CHOICE", "Choice Broking", "https://choiceindia.com/"],
    ["JAINAM", "Jainam", "https://www.jainam.in/"],
    ["MASTERTRUST", "Mastertrust", "https://mastertrust.co.in/"],
    ["ZEBU", "Zebu", "https://zebu.in/"],
    ["SAS_ONLINE", "SAS Online", "https://www.sasonline.in/"],
    ["PAYTM_MONEY", "Paytm Money", "https://www.paytmmoney.com/"],
    ["POCKETFUL", "Pocketful", "https://pocketful.in/"],
    ["FIRSTOCK", "Firstock", "https://firstock.in/"],
    ["STOXKART", "Stoxkart", "https://stoxkart.com/"],
    ["PROFITMART", "Profitmart", "https://profitmart.in/"],
    ["WISDOM_CAPITAL", "Wisdom Capital", "https://wisdomcapital.in/"],
    ["COMPOSITE_EDGE", "Composite Edge", "https://compositedge.com/"],
    ["DEFINEDGE", "Definedge", "https://www.definedge.com/"],
    ["INDMONEY", "INDmoney", "https://www.indmoney.com/"],
    ["ANAND_RATHI", "Anand Rathi", "https://www.anandrathi.com/"],
    ["RELIGARE", "Religare Broking", "https://www.religareonline.com/"],
    ["SMC", "SMC Global", "https://www.smcindiaonline.com/"],
    ["GOODWILL", "Goodwill Wealth Management", "https://www.gwcindia.in/"],
    ["ARROW", "Arrow", "https://arrowtrading.in/"]
  ] as const).map(([id, label, docsUrl]) => ({
    id, label, market: "INDIA" as const, auth: "OAUTH" as const, fields: [], docsUrl, connectEnabled: false,
    note: "Catalogue entry only. Official API access, current authentication, platform/vendor approval, market segments, order lifecycle and IP requirements must be verified before enabling a connection."
  }))
];
