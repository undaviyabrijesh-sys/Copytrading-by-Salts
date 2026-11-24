"use client";

import { useEffect, useState } from "react";

type Listing = { id: string; market: "INDIA" | "CRYPTO"; title: string; description: string; riskDisclosure: string; publishedAt: string | null; host: { id: string; displayName: string } };
type Subscription = { id: string; status: string; market: string; settings: unknown; listing: { id: string; title: string; market: string; status: string; host: { id: string; displayName: string } } };
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [listingData, subscriptionData] = await Promise.all([
        api<{ listings: Listing[] }>(`/api/v1/listings?market=${market}`),
        api<{ subscriptions: Subscription[] }>("/api/v1/subscriptions")
      ]);
      setListings(listingData.listings);
      setSubscriptions(subscriptionData.subscriptions);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load marketplace."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [market]);

  async function subscribe(listingId: string) {
    setBusyId(listingId); setError("");
    try {
      await api(`/api/v1/listings/${listingId}/subscribe`, { method: "POST", body: JSON.stringify({ quantityMultiplier: 1 }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to subscribe."); }
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
    <header className="admin-header"><div><div className="brand">SALTS <span>●</span> COPY DESK</div><p className="eyebrow">SUBSCRIBER WORKSPACE · PAPER ONLY</p><h1>Host marketplace</h1><p className="sub">Discover published hosts and manage your own subscriptions.</p></div><a className="text-link" href="/">← Overview</a></header>
    <div className="market-switch"><button className={`market ${market === "INDIA" ? "selected" : ""}`} onClick={() => setMarket("INDIA")}>India</button><button className={`market ${market === "CRYPTO" ? "selected" : ""}`} onClick={() => setMarket("CRYPTO")}>Crypto</button></div>
    <section className="card"><div className="section-head"><div><h2>Published listings</h2><p className="sub">Each subscription is isolated to this user and market.</p></div><span className="pill">{listings.length} available</span></div>
      {loading ? <p className="sub">Loading listings…</p> : listings.length === 0 ? <p className="sub">No published listings for this market yet.</p> : listings.map(item => <article className="listing marketplace-listing" key={item.id}>
        <div><div className="listing-meta"><span className="pill">{item.market}</span><span className="sub">Host: {item.host.displayName}</span></div><strong>{item.title}</strong><p>{item.description}</p><details><summary>Risk disclosure</summary><p>{item.riskDisclosure}</p></details></div>
        <div>{activeByListing.has(item.id) ? <button className="quiet-button" disabled={busyId === activeByListing.get(item.id)!.id} onClick={() => unsubscribe(activeByListing.get(item.id)!.id)}>Unsubscribe</button> : <button className="primary-button" disabled={busyId === item.id} onClick={() => subscribe(item.id)}>{busyId === item.id ? "Working…" : "Subscribe · Paper"}</button>}</div>
      </article>)}
    </section>
    <section className="card"><h2>My subscriptions</h2>{subscriptions.length === 0 ? <p className="sub">You have no subscriptions.</p> : subscriptions.map(s => <div className="listing" key={s.id}><div><strong>{s.listing.title}</strong><p>{s.market} · {s.status} · Host {s.listing.host.displayName}</p></div><span className="listing-state">{s.status}</span></div>)}</section>
    {error && <div className="form-error">{error}</div>}
  </main>;
}
