import React, { useState, useEffect } from "react";
import ProxyCreatorMain from "./components/ProxyCreator/ProxyCreatorMain";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";

function Icon({ d, size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export default function MTGProxyCreator() {
  const [tab, setTab] = useState("proxy");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  return (
    <div className="shell">
      {/* SIDEBAR desktop */}
      {!isMobile && (
        <div className="desktop-layout">
          <aside className="sidebar">
            <div className="sidebar-logo">
              🃏 MTG Tools
            </div>
            {[
              { id: "proxy", icon: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", label: "Proxy Stampa" },
              { id: "token", icon: "M12 5v14M5 12h14", label: "Token Creator" },
            ].map(n => (
              <button
                key={n.id}
                className={`nav-btn ${tab === n.id ? "active" : ""}`}
                onClick={() => setTab(n.id)}
              >
                <Icon d={n.icon} size={16} />
                {n.label}
              </button>
            ))}
          </aside>
          <main className="main-content">
            {tab === "proxy" && <ProxyCreatorMain isMobile={false} />}
            {tab === "token" && <TokenPreviewSinglePtFrame />}
          </main>
        </div>
      )}

      {/* MOBILE */}
      {isMobile && (
        <div className="mobile-layout">
          <div className="mobile-tabs">
            {[{ id: "proxy", label: "🖨 Stampa" }, { id: "token", label: "🃏 Token" }].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`mobile-tab-btn ${tab === t.id ? "active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mobile-content">
            {tab === "proxy" && <ProxyCreatorMain isMobile={true} />}
            {tab === "token" && <TokenPreviewSinglePtFrame />}
          </div>
        </div>
      )}
    </div>
  );
}