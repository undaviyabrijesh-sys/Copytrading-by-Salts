"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sign-in failed.");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="brand">SALTS <span>●</span> COPY DESK</div>
      <p className="eyebrow">PRIVATE · INVITE ONLY</p>
      <h1>Sign in</h1>
      <p className="sub">Access your own trading workspace and broker connections.</p>
      <form onSubmit={submit} className="auth-form">
        <label>Email address<input autoComplete="username" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input autoComplete="current-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>Authenticator code <span className="muted-inline">(if MFA is enabled)</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={totpCode} onChange={e => setTotpCode(e.target.value)} /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
      </form>
      <a className="text-link" href="/">Back to workspace</a>
    </section>
  </main>;
}
