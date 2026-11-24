"use client";

import { useEffect, useState } from "react";

type UserRow = { id: string; email: string; displayName: string; status: string; roles: string[]; totpEnabled: boolean; createdAt: string };
type InviteRow = { id: string; expiresAt: string; usedAt: string | null; revokedAt: string | null; createdAt: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Request failed."), { status: response.status });
  return data as T;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const me = await api<{ user: { roles: string[]; totpEnabled: boolean } }>("/api/v1/auth/me");
      if (!me.user.roles.includes("ADMIN")) throw new Error("This account does not have administrator access.");
      setAuthorized(true);
      setMfaEnabled(me.user.totpEnabled);
      if (!me.user.totpEnabled) return;
      const [userData, inviteData] = await Promise.all([
        api<{ users: UserRow[] }>("/api/v1/admin/users"),
        api<{ invites: InviteRow[] }>("/api/v1/admin/invites")
      ]);
      setUsers(userData.users);
      setInvites(inviteData.invites);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 403 && e.message.includes("Recent MFA")) {
        setAuthorized(true);
        setError("Verify your authenticator code to continue with administrator controls.");
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function beginMfa() {
    setError("");
    try {
      const data = await api<{ secret: string }>("/api/v1/auth/mfa/enroll", { method: "POST", body: "{}" });
      setMfaSecret(data.secret);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to start MFA setup."); }
  }

  async function verifyMfa(enrollment: boolean) {
    setError("");
    try {
      await api(enrollment ? "/api/v1/auth/mfa/verify-enrollment" : "/api/v1/auth/mfa/verify-session", {
        method: "POST", body: JSON.stringify({ code: mfaCode })
      });
      setMfaCode("");
      setMfaSecret("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "MFA verification failed."); }
  }

  async function createInvite() {
    setError("");
    try {
      const data = await api<{ invite: { token: string } }>("/api/v1/admin/invites", { method: "POST", body: "{}" });
      setInviteLink(`${window.location.origin}/invite?token=${encodeURIComponent(data.invite.token)}`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create invite."); }
  }

  async function updateRole(user: UserRow) {
    setBusyId(user.id);
    try {
      const roles = user.roles.includes("HOST") ? user.roles.filter(role => role !== "HOST") : Array.from(new Set([...user.roles, "SUBSCRIBER", "HOST"]));
      await api(`/api/v1/admin/users/${user.id}/roles`, { method: "PATCH", body: JSON.stringify({ roles }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update role."); }
    finally { setBusyId(""); }
  }

  async function updateStatus(user: UserRow) {
    setBusyId(user.id);
    try {
      const status = user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
      await api(`/api/v1/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update account."); }
    finally { setBusyId(""); }
  }

  async function revokeInvite(invite: InviteRow) {
    setBusyId(invite.id);
    try {
      await api(`/api/v1/admin/invites/${invite.id}/revoke`, { method: "POST", body: "{}" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to revoke invite."); }
    finally { setBusyId(""); }
  }

  return <main className="admin-wrap">
    <header className="admin-header">
      <div><div className="brand">SALTS <span>●</span> COPY DESK</div><p className="eyebrow">OWNER CONTROL CENTRE</p><h1>Administration</h1><p className="sub">Invite-only access · tenant-isolated accounts · all privileged actions audited</p></div>
      <a className="text-link" href="/">← Trading workspace</a>
    </header>
    {loading && <div className="card">Loading secure administrator workspace…</div>}
    {!loading && !authorized && <section className="card"><h2>Administrator sign-in required</h2><p className="sub">{error || "Sign in with your owner account."}</p><a className="primary-button inline-button" href="/login">Go to sign in</a></section>}
    {!loading && authorized && !mfaEnabled && <section className="card">
      <h2>Secure your administrator account</h2><p className="sub">Authenticator-based MFA is mandatory before any administrator action is available.</p>
      {!mfaSecret ? <button className="primary-button" onClick={beginMfa}>Set up authenticator</button> : <>
        <p className="sub">Add this secret to your authenticator app. Keep it private.</p>
        <div className="secret-box">{mfaSecret}</div>
        <label className="admin-label">Six-digit code<input inputMode="numeric" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value)} /></label>
        <button className="primary-button" onClick={() => verifyMfa(true)} disabled={mfaCode.length !== 6}>Confirm and enable MFA</button>
      </>}
    </section>}
    {!loading && authorized && mfaEnabled && error.includes("Verify your authenticator") && <section className="card">
      <h2>Administrator re-verification</h2><p className="sub">Enter a current authenticator code. Privileged access expires after 10 minutes.</p>
      <label className="admin-label">Six-digit code<input inputMode="numeric" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value)} /></label>
      <button className="primary-button" onClick={() => verifyMfa(false)} disabled={mfaCode.length !== 6}>Verify MFA</button>
    </section>}
    {!loading && authorized && mfaEnabled && !error.includes("Verify your authenticator") && <>
      <section className="card">
        <div className="section-head"><div><h2>Invite management</h2><p className="sub">Create one-time invitations for new subscribers.</p></div><button className="primary-button" onClick={createInvite}>Create invitation</button></div>
        {inviteLink && <div className="invite-output"><span>{inviteLink}</span><button onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy link</button></div>}
        <div className="table-wrap"><table><thead><tr><th>Created</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {invites.map(invite => <tr key={invite.id}><td>{new Date(invite.createdAt).toLocaleString()}</td><td>{new Date(invite.expiresAt).toLocaleString()}</td><td>{invite.usedAt ? "Used" : invite.revokedAt ? "Revoked" : new Date(invite.expiresAt) < new Date() ? "Expired" : "Active"}</td><td>{!invite.usedAt && !invite.revokedAt && new Date(invite.expiresAt) > new Date() && <button className="quiet-button" disabled={busyId === invite.id} onClick={() => revokeInvite(invite)}>Revoke</button>}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="card">
        <div className="section-head"><div><h2>User management</h2><p className="sub">Approve host access, suspend accounts and review MFA status.</p></div><span className="pill">{users.length} accounts</span></div>
        <div className="table-wrap"><table><thead><tr><th>User</th><th>Roles</th><th>Status</th><th>MFA</th><th>Actions</th></tr></thead><tbody>
          {users.map(user => <tr key={user.id}><td><strong>{user.displayName}</strong><small>{user.email}</small></td><td>{user.roles.join(" · ")}</td><td>{user.status}</td><td>{user.totpEnabled ? "Enabled" : "Required"}</td><td className="action-cell"><button className="quiet-button" disabled={busyId === user.id} onClick={() => updateRole(user)}>{user.roles.includes("HOST") ? "Remove host" : "Approve host"}</button>{user.status !== "DELETED" && <button className="quiet-button" disabled={busyId === user.id} onClick={() => updateStatus(user)}>{user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}</button>}</td></tr>)}
        </tbody></table></div>
      </section>
    </>}
    {error && !error.includes("Verify your authenticator") && <div className="form-error">{error}</div>}
  </main>;
}
