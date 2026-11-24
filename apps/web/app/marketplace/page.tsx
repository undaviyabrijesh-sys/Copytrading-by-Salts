"use client";

import LogoutButton from "../../components/logout-button.js";
import { useEffect, useState } from "react";

type Listing = { id: string; market: "INDIA" | "CRYPTO"; title: string; description: string; riskDisclosure: string; publishedAt: string | null; host: { id: string; displayName: string } };
type Subscription = { id: string; status: string; market: string; settings: { quantityMultiplier?: number; maxOrderValue?: number }; destinationConnection: { id: string; provider: string; label: string; status: string } | null; listing: { id: string; title: string; market: string; status: string; host: { id: string; displayName: string } } };
type BrokerConnection = { id: string; market: "INDIA" | "CRYPTO"; provider: string; label: string; status: string; lastHealthAt: string | null };
type CopyIntent = { id: string; status: string; decisionCode: string | null; decisionReason: string | null; attemptCount: number; createdAt: string; updatedAt: string; completedAt: string | null; signal: { market: string; event: string; instrument: unknown; occurredAt: string }; subscription: { listing: { id: string; title: string } } };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, credentials: "include", headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Request failed."), { status: response.status });
  return data as T;
}

export default function MarketplacePage() {
  const [market, setMarket] = useState<"INDIA" | "CRYPTO">("INDIA");
  const [listings, setListings] = useState<Listing[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [intents, setIntents] = useState<CopyIntent[]>([]);
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [destinationConnectionId, setDestinationConnectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [quantityMultiplier, setQuantityMultiplier] = useState("1");
  const [maxOrderValue, setMaxOrderValue] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [listingData, subscriptionData, intentData, connectionData] = await Promise.all([
        api<{ listings: Listing[] }>(`/api/v1/listings?market=${market}`),
        api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions"),
        api<{ intents: CopyIntent[] }>("/api/v1/subscriber/copy-intents")
      ]);
      setListings(listingData.listings);
      setSubscriptions(subscriptionData.subscriptions);
      setIntents(intentData.intents);
      setConnections(connectionData.connections);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load marketplace."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [market]);

  async function subscribe(listingId: string) {
    setBusyId(listingId); setError("");
    try {
      await api(`/api/v1/listings/${listingId}/subscribe`, { method: "POST", body: JSON.stringify({ quantityMultiplier: Number(quantityMultiplier), ...(maxOrderValue ? { maxOrderValue: Number(maxOrderValue) } : {}), ...(destinationConnectionId ? { destinationConnectionId } : {}) }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to subscribe."); }
    finally { setBusyId(""); }
  }

  async function saveSettings(subscriptionId: string) {
    setBusyId(subscriptionId); setError("");
    try {
      await api(`/api/v1/subscriptions/${subscriptionId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ quantityMultiplier: Number(quantityMultiplier), ...(maxOrderValue ? { maxOrderValue: Number(maxOrderValue) } : {}), ...(destinationConnectionId ? { destinationConnectionId } : {}) })
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save risk settings."); }
    finally { setBusyId(""); }
  }

  async function unsubscribe(subscriptionId: string) {
    setBusyId(subscriptionId); setError("");
    try { await api(`/api/v1/subscriptions/${subscriptionId}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to unsubscribe."); }
    finally { setBusyId(""); }
  }

  const activeByListing = new Map(subscriptions.filter(s => s.status === "ACTIVE").map(s => [s.listing.id, s]));
  return <main className="admin-wrap">
    <header className="admin-header"><div><div className="brand">SALTS <span>●</span> COPY DESK</div><p className="eyebrow">SUBSCRIBER WORKSPACE · PAPER ONLY</p><h1>Host marketplace</h1><p className="sub">Discover published hosts and manage your own subscriptions.</p></div><div className="header-actions"><a className="text-link" href="/">← Overview</a><LogoutButton /></div></header>
    <div className="market-switch"><button className={`market ${market === "INDIA" ? "selected" : ""}`} onClick={() => setMarket("INDIA")}>India</button><button className={`market ${market === "CRYPTO" ? "selected" : ""}`} onClick={() => setMarket("CRYPTO")}>Crypto</button></div>
    <section className="card">
      <div><h2>Destination broker account</h2><p className="sub">Choose your own connected broker account for the selected market. Host and subscriber brokers can be different. Credentials are never shown here.</p></div>
      <label className="admin-label">Connected {market} account
        <select value={destinationConnectionId} onChange={e => setDestinationConnectionId(e.target.value)}>
          <option value="">Not selected</option>
          {connections.filter(c => c.market === market && c.status === "CONNECTED").map(c => <option key={c.id} value={c.id}>{c.provider} · {c.label}</option>)}
        </select>
      </label>
      {connections.filter(c => c.market === market && c.status === "CONNECTED").length === 0 && <p className="sub">No connected broker account is available for {market}. Broker connection setup is the next required step before paper-copy processing.</p>}
    </section>
    <section className="card risk-settings">
      <div><h2>My copy risk settings</h2><p className="sub">These settings apply to new subscriptions and can be saved to an existing subscription. Risk limits are enforced by the paper-routing gate.</p></div>
      <div className="risk-fields">
        <label>Quantity multiplier<input type="number" min="0.1" max="10" step="0.1" value={quantityMultiplier} onChange={e => setQuantityMultiplier(e.target.value)} /></label>
        <label>Maximum order value (optional)<input type="number" min="0.01" max="100000000" step="0.01" placeholder="No cap" value={maxOrderValue} onChange={e => setMaxOrderValue(e.target.value)} /></label>
      </div>
    </section>
    <section className="card"><div className="section-head"><div><h2>Published listings</h2><p className="sub">Each subscription is isolated to this user and market.</p></div><span className="pill">{listings.length} available</span></div>
      {loading ? <p className="sub">Loading listings…</p> : listings.length === 0 ? <p className="sub">No published listings for this market yet.</p> : listings.map(item => <article className="listing marketplace-listing" key={item.id}>
        <div><div className="listing-meta"><span className="pill">{item.market}</span><span className="sub">Host: {item.host.displayName}</span></div><strong>{item.title}</strong><p>{item.description}</p><details><summary>Risk disclosure</summary><p>{item.riskDisclosure}</p></details></div>
        <div>{activeByListing.has(item.id) ? <button className="quiet-button" disabled={busyId === activeByListing.get(item.id)!.id} onClick={() => unsubscribe(activeByListing.get(item.id)!.id)}>Unsubscribe</button> : <button className="primary-button" disabled={busyId === item.id} onClick={() => subscribe(item.id)}>{busyId === item.id ? "Working…" : "Subscribe · Paper"}</button>}</div>
      </article>)}
    </section>

    <section className="card">
      <div className="section-head"><div><h2>Copy activity</h2><p className="sub">Per-subscriber routing decisions. QUEUED means accepted for evaluation, not an executed broker order.</p></div><span className="pill">{intents.length} recent intents</span></div>
      {intents.length === 0 ? <p className="sub">No copy intents yet. New host signals will appear here when fan-out is created.</p> : <div className="table-wrap"><table><thead><tr><th>Listing</th><th>Market / Event</th><th>Status</th><th>Decision</th><th>Created</th></tr></thead><tbody>
        {intents.map(intent => <tr key={intent.id}><td>{intent.subscription.listing.title}</td><td>{intent.signal.market} · {intent.signal.event}</td><td>{intent.status}</td><td>{intent.decisionCode ? <><strong>{intent.decisionCode}</strong><small>{intent.decisionReason}</small></> : "Awaiting evaluation"}</td><td>{new Date(intent.createdAt).toLocaleString()}</td></tr>)}
      </tbody></table></div>}
    </section>
    <section className="card"><h2>My subscriptions</h2>{subscriptions.length === 0 ? <p className="sub">You have no subscriptions.</p> : subscriptions.map(s => <div className="listing" key={s.id}><div><strong>{s.listing.title}</strong><p>{s.market} · {s.status} · Host {s.listing.host.displayName} · Size ×{s.settings?.quantityMultiplier ?? 1} · Destination {s.destinationConnection ? `${s.destinationConnection.provider} / ${s.destinationConnection.label}` : "Not selected"}{s.settings?.maxOrderValue ? ` · Max value ${s.settings.maxOrderValue}` : ""}</p></div><div className="listing-actions">{s.status === "ACTIVE" && <button className="quiet-button" disabled={busyId === s.id} onClick={() => saveSettings(s.id)}>Save risk settings</button>}{s.status === "ACTIVE" && <button className="quiet-button" disabled={busyId === s.id} onClick={() => unsubscribe(s.id)}>Unsubscribe</button>}<span className="listing-state">{s.status}</span></div></div>)}</section>
    {error && <div className="form-error">{error}</div>}
  </main>;
}
