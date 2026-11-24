"use client";

import { useEffect, useState } from "react";
import LogoutButton from "../../components/logout-button.js";

async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const headers=new Headers(init?.headers);headers.set("content-type","application/json");
  const response=await fetch(path,{...init,credentials:"include",headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export default function SecurityPage(){
  const [loading,setLoading]=useState(true);
  const [enabled,setEnabled]=useState(false);
  const [secret,setSecret]=useState("");
  const [code,setCode]=useState("");
  const [message,setMessage]=useState("");
  async function load(){try{const data=await api<{user:{totpEnabled:boolean}}>("/api/v1/auth/me");setEnabled(data.user.totpEnabled);}catch(e){setMessage(e instanceof Error?e.message:"Unable to load account.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function begin(){setMessage("");try{const data=await api<{secret:string}>("/api/v1/auth/mfa/enroll",{method:"POST",body:"{}"});setSecret(data.secret);}catch(e){setMessage(e instanceof Error?e.message:"Unable to begin MFA setup.");}}
  async function verify(enrollment:boolean){setMessage("");try{await api(enrollment?"/api/v1/auth/mfa/verify-enrollment":"/api/v1/auth/mfa/verify-session",{method:"POST",body:JSON.stringify({code})});setCode("");setSecret("");setMessage(enrollment?"Authenticator MFA enabled.":"MFA verified for the next 10 minutes.");await load();}catch(e){setMessage(e instanceof Error?e.message:"MFA verification failed.");}}
  return <main className="admin-wrap">
    <header className="admin-header"><div><div className="brand">SALTS <span>●</span> COPY DESK</div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Security settings</h1><p className="sub">Protect broker credentials and account changes with authenticator MFA.</p></div><div className="header-actions"><a className="text-link" href="/connections">← Broker connections</a><LogoutButton/></div></header>
    {loading?<section className="card">Loading security settings…</section>:<section className="card">
      <div className="section-head"><div><h2>Authenticator MFA</h2><p className="sub">Recent MFA verification is required before saving or disconnecting broker credentials.</p></div><span className="pill">{enabled?"ENABLED":"NOT ENABLED"}</span></div>
      {!enabled&&!secret&&<button className="primary-button" onClick={()=>void begin()}>Set up authenticator</button>}
      {!!secret&&<><p className="sub">Add this secret to your authenticator app. It is displayed once; store it securely.</p><div className="secret-box">{secret}</div><label className="admin-label">Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label><button className="primary-button" disabled={code.length!==6} onClick={()=>void verify(true)}>Confirm and enable MFA</button></>}
      {enabled&&<><p className="sub">MFA is enabled. Enter a current authenticator code when you need to perform a sensitive account action.</p><label className="admin-label">Six-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)}/></label><button className="primary-button" disabled={code.length!==6} onClick={()=>void verify(false)}>Verify for 10 minutes</button></>}
      {message&&<p className="sub" role="status">{message}</p>}
    </section>}
  </main>;
}
