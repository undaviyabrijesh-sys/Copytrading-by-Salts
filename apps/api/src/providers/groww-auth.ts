export async function verifyGrowwAccount(accessToken: string): Promise<{ accountId: string; ucc?: string; segments: string[] }> {
  if (!accessToken?.trim()) throw new Error("GROWW_TOKEN_MISSING");
  const response = await fetch("https://api.groww.in/v1/user/detail", {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}`, "X-API-VERSION": "1.0" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as { status?: string; payload?: { vendor_user_id?: string; ucc?: string; active_segments?: string[] } } | null;
  if (!response.ok || body?.status !== "SUCCESS" || !body.payload?.vendor_user_id) {
    if (response.status === 401 || response.status === 403) throw new Error("GROWW_AUTHENTICATION_FAILED");
    if (response.status === 429) throw new Error("GROWW_RATE_LIMITED");
    throw new Error("GROWW_PROVIDER_UNAVAILABLE");
  }
  return { accountId: body.payload.vendor_user_id, ucc: body.payload.ucc, segments: Array.isArray(body.payload.active_segments) ? body.payload.active_segments : [] };
}
