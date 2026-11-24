"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      window.location.href = "/login";
    }
  }
  return <button className="quiet-button" type="button" disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out"}</button>;
}
