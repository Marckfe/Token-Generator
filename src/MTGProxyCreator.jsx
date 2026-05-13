import React, { useState, useEffect } from "react";
import ProxyCreatorMain from "./components/ProxyCreator/ProxyCreatorMain";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import StudioEditor from "./StudioEditor";
import DeckChecker from "./components/DeckChecker/DeckChecker";
import DeckScanner from "./components/DeckScanner/DeckScanner";

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
  const [globalQueue, setGlobalQueue] = useState([]);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const addToGlobalQueue = (newItems) => {
    setGlobalQueue(prev => [...prev, ...newItems]);
    setTab("proxy"); // Switch to proxy tab to show results
  };

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
              { id: "ocr", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", label: "Scanner OCR" },
              { id: "token", icon: "M12 5v14M5 12h14", label: "Token Creator" },
              { id: "studio", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", label: "Studio Design" },
              { id: "checker", icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z", label: "Deck Checker" },
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
            {tab === "proxy" && <ProxyCreatorMain isMobile={false} externalQueue={globalQueue} setExternalQueue={setGlobalQueue} />}
            {tab === "ocr" && <DeckScanner onAddToQueue={addToGlobalQueue} />}
            {tab === "token" && <TokenPreviewSinglePtFrame />}
            {tab === "studio" && <StudioEditor />}
            {tab === "checker" && <DeckChecker />}
          </main>
        </div>
      )}

      {/* MOBILE */}
      {isMobile && (
        <div className="mobile-layout">
          <div className="mobile-tabs">
            {[
              { id: "proxy", label: "🖨 Stampa" }, 
              { id: "ocr", label: "👁️ OCR" },
              { id: "token", label: "🃏 Token" },
              { id: "studio", label: "🎨 Studio" },
              { id: "checker", label: "🔍 Check" }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`mobile-tab-btn ${tab === t.id ? "active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mobile-content" style={tab === 'studio' ? { padding: 0, overflow: 'hidden', gap: 0 } : {}}>
            {tab === "proxy" && <ProxyCreatorMain isMobile={true} externalQueue={globalQueue} setExternalQueue={setGlobalQueue} />}
            {tab === "ocr" && <DeckScanner onAddToQueue={addToGlobalQueue} />}
            {tab === "token" && <TokenPreviewSinglePtFrame />}
            {tab === "studio" && <StudioEditor />}
            {tab === "checker" && <DeckChecker />}
          </div>
        </div>
      )}
    </div>
  );
}