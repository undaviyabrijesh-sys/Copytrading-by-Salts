"use client";

import LogoutButton from "../../components/logout-button.js";
import { FormEvent, useEffect, useState } from "react";

type Listing = { id: string; market: "INDIA" | "CRYPTO"; title: string; description: string; riskDisclosure: string; status: string; updatedAt: string };
type HostSignal = { id: string; market: string; event: string; instrument: unknown; occurredAt: string; receivedAt: string; _count: { copyIntents: number } };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, credentials: "include", headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Request failed."), { status: response.status });
  return data as T;
}

export default function HostDeskPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [signals, setSignals] = useState<HostSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [market, setMarket] = useState<"INDIA" | "CRYPTO">("INDIA");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [riskDisclosure, setRiskDisclosure] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const [data, signalData] = await Promise.all([
        api<{ listings: Listing[] }>("/api/v1/host/listings"),
        api<{ signals: HostSignal[] }>("/api/v1/host/signals")
      ]);
      setListings(data.listings);
      setSignals(signalData.signals);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load host listings."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/v1/host/listings", { method: "POST", body: JSON.stringify({ market, title, description, riskDisclosure }) });
      setTitle(""); setDescription(""); setRiskDisclosure(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create listing."); }
    finally { setBusy(false); }
  }

  function startEdit(listing: Listing) {
    setEditingId(listing.id); setMarket(listing.market); setTitle(listing.title); setDescription(listing.description); setRiskDisclosure(listing.riskDisclosure);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingId) return; setBusy(true); setError("");
    try {
      await api(`/api/v1/host/listings/${editingId}`, { method: "PATCH", body: JSON.stringify({ title, description, riskDisclosure }) });
      setEditingId(null); setTitle(""); setDescription(""); setRiskDisclosure(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save listing changes."); }
    finally { setBusy(false); }
  }

  async function changeStatus(listing: Listing, status: "PUBLISHED" | "PAUSED" | "DRAFT") {
    setBusy(true); setError("");
    try { await api(`/api/v1/host/listings/${listing.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update listing."); }
    finally { setBusy(false); }
  }
  async function remove(listing: Listing) {
    if (!window.confirm("Remove this listing? Existing subscribers will no longer receive new copies.")) return;
    setBusy(true); setError("");
    try { await api(`/api/v1/host/listings/${listing.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to remove listing."); }
    finally { setBusy(false); }
  }

  return <main className="admin-wrap">
    <header className="admin-header"><div><div className="brand">SALTS <span>●</span> COPY DESK</div><p className="eyebrow">HOST WORKSPACE · PAPER ONLY</p><h1>My listings</h1><p className="sub">Create and manage strategy listings. Publishing does not enable live execution.</p></div><div className="header-actions"><a className="text-link" href="/">← Overview</a><LogoutButton /></div></header>
    <section className="card"><h2>{editingId ? "Edit listing" : "Create a host listing"}</h2><p className="sub">Your listing is scoped to your account. Subscribers choose their own broker and risk settings.</p>
      <form className="auth-form" onSubmit={editingId ? saveEdit : create}>
        <label>Market<select disabled={!!editingId} value={market} onChange={e => setMarket(e.target.value as "INDIA" | "CRYPTO")}><option value="INDIA">India</option><option value="CRYPTO">Crypto</option></select></label>
        <label>Listing title<input required minLength={3} maxLength={80} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>Strategy description<textarea required minLength={10} maxLength={2000} rows={4} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label>Risk disclosure<textarea required minLength={20} maxLength={3000} rows={3} value={riskDisclosure} onChange={e => setRiskDisclosure(e.target.value)} /></label>
        <div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Save as draft"}</button>{editingId && <button type="button" className="quiet-button" onClick={() => { setEditingId(null); setTitle(""); setDescription(""); setRiskDisclosure(""); }}>Cancel edit</button>}</div>
      </form>
    </section>

    <section className="card">
      <div className="section-head"><div><h2>Signal activity</h2><p className="sub">Signals received from your connected source account and subscriber fan-out counts. This does not confirm broker execution.</p></div><span className="pill">{signals.length} recent signals</span></div>
      {signals.length === 0 ? <p className="sub">No signals received yet. Signal intake API is available for a verified host integration.</p> : <div className="table-wrap"><table><thead><tr><th>Market / Event</th><th>Occurred</th><th>Received</th><th>Subscriber intents</th></tr></thead><tbody>
        {signals.map(signal => <tr key={signal.id}><td>{signal.market} · {signal.event}</td><td>{new Date(signal.occurredAt).toLocaleString()}</td><td>{new Date(signal.receivedAt).toLocaleString()}</td><td>{signal._count.copyIntents}</td></tr>)}
      </tbody></table></div>}
    </section>
    <section className="card"><div className="section-head"><div><h2>Your listings</h2><p className="sub">Drafts remain private. Publish only after reviewing disclosures.</p></div><span className="pill">{listings.length} listings</span></div>
      {loading ? <p className="sub">Loading listings…</p> : listings.length === 0 ? <p className="sub">No listings created yet.</p> : listings.map(item => <article className="listing host-listing" key={item.id}>
        <div><div className="listing-meta"><span className="pill">{item.market}</span><span className={`listing-state state-${item.status.toLowerCase()}`}>{item.status}</span></div><strong>{item.title}</strong><p>{item.description}</p><small>Updated {new Date(item.updatedAt).toLocaleString()}</small></div>
        <div className="listing-actions">
          <button className="quiet-button" disabled={busy} onClick={() => startEdit(item)}>Edit</button>
          {item.status !== "PUBLISHED" && item.status !== "REMOVED" && <button className="quiet-button" disabled={busy} onClick={() => changeStatus(item,"PUBLISHED")}>Publish</button>}
          {item.status === "PUBLISHED" && <button className="quiet-button" disabled={busy} onClick={() => changeStatus(item,"PAUSED")}>Pause</button>}
          {item.status === "PAUSED" && <button className="quiet-button" disabled={busy} onClick={() => changeStatus(item,"PUBLISHED")}>Resume</button>}
          {item.status !== "REMOVED" && <button className="quiet-button danger-button" disabled={busy} onClick={() => remove(item)}>Remove</button>}
        </div>
      </article>)}
    </section>
    {error && <div className="form-error">{error}</div>}
  </main>;
}
