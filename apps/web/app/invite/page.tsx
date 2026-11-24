"use client";

import { FormEvent, useEffect, useState } from "react";

export default function InvitePage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const inviteToken = fragment.get("token") ?? "";
    setToken(inviteToken);
    if (inviteToken) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/redeem-invite", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email, displayName, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Invite redemption failed.");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to redeem invite.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="brand">SALTS <span>●</span> COPY DESK</div>
      <p className="eyebrow">SECURE ACCOUNT SETUP</p>
      <h1>Accept your invitation</h1>
      <p className="sub">Your account is private and separate. Broker credentials are connected later from your own profile.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Invitation token<input required value={token} onChange={e => setToken(e.target.value)} /></label>
        <label>Display name<input required minLength={2} maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>
        <label>Email address<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Create password <span className="muted-inline">(minimum 16 characters)</span><input type="password" required minLength={16} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={busy || token.length < 40}>{busy ? "Creating account…" : "Create secure account"}</button>
      </form>
      <a className="text-link" href="/login">Already registered? Sign in</a>
    </section>
  </main>;
}
