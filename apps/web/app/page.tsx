const markets = [
  { name: "India", detail: "NSE · BSE · F&O · Supported commodities", status: "PAPER WORKSPACE" },
  { name: "Crypto", detail: "Spot · Futures · Perpetuals · Exchange-specific controls", status: "PAPER WORKSPACE" }
];

export default function Home() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">SALTS <span>●</span> COPY DESK</div>
        <div className="tag">Private trading network</div>
        <div className="nav-title">WORKSPACE</div>
        <a className="nav-item active" href="/">Overview</a>
        <a className="nav-item" href="#markets">India workspace</a>
        <a className="nav-item" href="#markets">Crypto workspace</a>
        <a className="nav-item" href="#hosts">Host listings</a>
        <div className="nav-title">ACCOUNT</div>
        <a className="nav-item" href="#connections">Broker connections</a>
        <a className="nav-item" href="#settings">Copy settings</a>
        <a className="nav-item" href="#activity">Copy activity</a>
        <div className="nav-title">CONTROL</div>
        <a className="nav-item" href="#safety">Risk & safety</a>
        <a className="nav-item" href="/admin">Admin console</a>
        <a className="nav-item" href="/login">Sign in</a>
      </aside>
      <main className="main">
        <div className="topbar">
          <div><div className="eyebrow">INVITE-ONLY · MULTI-USER PLATFORM</div><h1>Trading workspace</h1><div className="sub">Independent host and subscriber accounts. Separate India and Crypto execution environments.</div></div>
          <div className="pill">● PAPER FIRST · <a href="/login">SIGN IN</a></div>
        </div>

        <div id="markets" className="market-switch">
          <button className="market selected" type="button">India</button>
          <button className="market" type="button">Crypto</button>
          <button className="market" type="button">Combined overview</button>
        </div>

        <div className="grid">
          <div className="card"><div className="card-label">Account role</div><div className="card-value">Host / Client</div><div className="card-note">Role-based access will be assigned after invite approval.</div></div>
          <div className="card"><div className="card-label">Execution mode</div><div className="card-value">PAPER</div><div className="card-note">Live trading is disabled until approval and safety gates pass.</div></div>
          <div className="card"><div className="card-label">Broker connections</div><div className="card-value">Not connected</div><div className="card-note">Each user connects their own broker account.</div></div>
        </div>

        <section id="hosts" className="section card">
          <div className="section-head"><h2>Host desk</h2><span className="pill">Listings preview</span></div>
          <div className="listing"><div><strong>Host listings will appear here</strong><p>Approved hosts can publish, edit, pause and remove their India or Crypto listing. Subscribers can review and follow independently.</p></div><span className="status">NOT CONNECTED</span></div>
          <div className="listing"><div><strong>Cross-broker copy engine</strong><p>Host and subscriber may use different providers. Instrument and order capability must be verified before a copy is eligible.</p></div><span className="status">FOUNDATION</span></div>
        </section>

        <section id="connections" className="section card">
          <div className="section-head"><h2>Broker connection centre</h2><span className="pill">Guided setup planned</span></div>
          <div className="listing"><div><strong>Connect your own account</strong><p>Provider-specific instructions, permission checks, secure credential handling, IP diagnostics and connection tests will be built here.</p></div><span className="status">COMING IN PHASE 1</span></div>
        </section>

        <div id="safety" className="notice">Safety notice: this is an early development shell, not a live trading product. No broker is connected and no order can be placed. Never enter API credentials into this preview.</div>
      </main>
    </div>
  );
}
