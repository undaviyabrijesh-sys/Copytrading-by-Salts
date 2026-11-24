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
        <a className="nav-item" href="/marketplace">Host marketplace</a>
        <a className="nav-item" href="/host">My host listings</a>
        <div className="nav-title">ACCOUNT</div>
        <a className="nav-item" href="/marketplace">Subscriptions</a>
        <a className="nav-item" href="/connections">Broker connections</a>
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
          <div className="card"><div className="card-label">Account role</div><div className="card-value">Host / Client</div><div className="card-note">Subscriber by default; HOST access requires owner approval.</div></div>
          <div className="card"><div className="card-label">Execution mode</div><div className="card-value">PAPER</div><div className="card-note">Live trading is disabled until approval and safety gates pass.</div></div>
          <div className="card"><div className="card-label">Broker connections</div><div className="card-value">Not connected</div><div className="card-note">Each user connects their own broker account.</div></div>
        </div>

        <section id="hosts" className="section card">
          <div className="section-head"><h2>Host desk</h2><a className="text-link" href="/marketplace">Open marketplace →</a></div>
          <div className="listing"><div><strong>Explore host listings</strong><p>Browse the marketplace, review risk disclosures and subscribe to approved host listings from your own account.</p><a className="text-link" href="/marketplace">Open marketplace →</a></div><span className="status">NOT CONNECTED</span></div>
          <div className="listing"><div><strong>Cross-broker copy engine</strong><p>Host and subscriber may use different providers. Instrument and order capability must be verified before a copy is eligible.</p></div><span className="status">FOUNDATION</span></div>
        </section>

        <section id="connections" className="section card">
          <div className="section-head"><h2>Broker connection centre</h2><a className="text-link" href="/connections">Open provider catalogue →</a></div>
          <div className="listing"><div><strong>Provider-specific setup guides</strong><p>Review each broker's authentication method, required API fields, official documentation, token expiry and static-IP restrictions before connecting.</p><a className="text-link" href="/connections">Choose a broker →</a></div><span className="status">RESEARCH CATALOGUE</span></div>
        </section>

        <div id="safety" className="notice">Safety notice: this is an early development shell, not a live trading product. No broker is connected and no order can be placed. Never enter API credentials into this preview.</div>
      </main>
    </div>
  );
}
