import React, { useState, useEffect, useCallback } from "react";
import ProxyCreatorMain from "./components/ProxyCreator/ProxyCreatorMain";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import StudioEditor from "./StudioEditor";
import DeckChecker from "./components/DeckChecker/DeckChecker";
import DeckScanner from "./components/DeckScanner/DeckScanner";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import { LogOut, User as UserIcon, Save, Cloud, Loader2 } from "lucide-react";
import { getUserQueue, saveUserQueue, saveUserDeck } from "./services/dbService";

// ── Icon helper ────────────────────────────────────────────────────────
function Icon({ d, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// ── Language Toggle — defined OUTSIDE the main component ───────────────
// This prevents React from re-creating it on every render.
function LanguageToggle({ lang, setLang }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '2px',
      background: 'rgba(255, 255, 255, 0.05)',
      padding: '4px 10px',
      borderRadius: '20px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      fontSize: '0.72rem',
      fontWeight: '700',
      backdropFilter: 'blur(10px)',
      flexShrink: 0,
    }}>
      <button
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 5px', borderRadius: '4px',
          color: lang === 'it' ? '#00bcd4' : 'rgba(255,255,255,0.3)',
          fontWeight: '700', fontSize: '0.72rem',
          transition: 'color 0.2s',
        }}
        onClick={() => setLang('it')}
      >IT</button>
      <span style={{ color: 'rgba(255,255,255,0.1)', userSelect: 'none' }}>|</span>
      <button
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 5px', borderRadius: '4px',
          color: lang === 'en' ? '#00bcd4' : 'rgba(255,255,255,0.3)',
          fontWeight: '700', fontSize: '0.72rem',
          transition: 'color 0.2s',
        }}
        onClick={() => setLang('en')}
      >EN</button>
    </div>
  );
}

// ── Main application ───────────────────────────────────────────────────
export default function MTGProxyCreator() {
  const [tab, setTab] = useState("proxy");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);
  const { lang, setLang, t } = useLanguage();
  const { user, logout } = useAuth();

  // Scanner → Checker cross-tab state
  const [pendingDeck, setPendingDeck] = useState(null);
  const [tokenState, setTokenState] = useState(null);

  const [globalQueue, setGlobalQueue] = useState(() => {
    try {
      const saved = localStorage.getItem("mtg_print_queue");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);

  // Responsive
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Cloud sync — load
  useEffect(() => {
    if (user && !hasLoadedCloud) {
      const timer = setTimeout(() => {
        getUserQueue(user.uid).then(cloudQueue => {
          if (cloudQueue?.length > 0) setGlobalQueue(cloudQueue);
          setHasLoadedCloud(true);
        }).catch(err => {
          console.error(">>> [Firestore] Fallback fetch error:", err);
          setHasLoadedCloud(true); // Don't block UI
        });
      }, 1000); // 1s delay to let firestore warm up
      return () => clearTimeout(timer);
    }
  }, [user, hasLoadedCloud]);

  // Cloud sync — save
  useEffect(() => {
    try { localStorage.setItem("mtg_print_queue", JSON.stringify(globalQueue)); } catch { /* ignore */ }
    if (user && hasLoadedCloud) saveUserQueue(user.uid, globalQueue);
  }, [globalQueue, user, hasLoadedCloud]);

  // Queue actions
  const addToGlobalQueue = useCallback((newItems) => {
    setGlobalQueue(prev => [...prev, ...newItems]);
    setTab("proxy");
  }, []);

  // Scanner → DeckChecker handoff
  const handleValidateDeck = useCallback((deckData) => {
    setPendingDeck(deckData);
    setTab("checker");
  }, []);

  // Clear pending deck once consumed
  const handleCheckerDeckReceived = useCallback(() => {
    // pendingDeck is passed as prop; reset after a tick so DeckChecker can read it
    setTimeout(() => setPendingDeck(null), 100);
  }, []);

  const NAV_ITEMS = [
    { id: "proxy",   icon: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", label: t('nav.proxy') },
    { id: "ocr",     icon: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", label: t('nav.ocr') },
    { id: "token",   icon: "M12 5v14M5 12h14", label: t('nav.token') },
    { id: "studio",  icon: "M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z", label: t('nav.studio') },
    { id: "checker", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", label: t('nav.checker') },
  ];

  const renderContent = (tab) => {
    switch (tab) {
      case "proxy":
        return <ProxyCreatorMain isMobile={isMobile} externalQueue={globalQueue} setExternalQueue={setGlobalQueue} />;
      case "ocr":
        return <DeckScanner onAddToQueue={addToGlobalQueue} onValidateDeck={handleValidateDeck} />;
      case "token":
        return <TokenPreviewSinglePtFrame state={tokenState} onStateChange={setTokenState} />;
      case "studio":
        return <StudioEditor />;
      case "checker":
        return (
          <DeckChecker
            onAddToQueue={addToGlobalQueue}
            initialDeck={pendingDeck}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="shell">
      {/* GLOBAL LANGUAGE TOGGLE - Fixed Top Right */}
      {!isMobile && (
        <div style={{ position: 'fixed', top: '24px', right: '32px', zIndex: 1000 }}>
          <LanguageToggle lang={lang} setLang={setLang} />
        </div>
      )}
      {/* ── DESKTOP ─────────────────────────────────────────────── */}
      {!isMobile && (
        <div className="desktop-layout">
          <aside className="sidebar">
            <div className="sidebar-header" style={{ padding: '32px 20px 0 20px', textAlign: 'center' }}>
              <div className="sidebar-logo" style={{ padding: 0, justifyContent: 'center', fontSize: '1.6rem', fontWeight: '900', letterSpacing: '-0.04em' }}>
                <div style={{
                  width: '32px', height: '32px', 
                  background: 'linear-gradient(135deg, #00bcd4 0%, #3f51b5 100%)',
                  borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: '12px', boxShadow: '0 4px 12px rgba(0, 188, 212, 0.3)'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <span style={{
                  background: 'linear-gradient(135deg, #fff 0%, #00bcd4 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>Mythic Studio</span>
              </div>
            </div>

            <nav className="nav-group">
              {NAV_ITEMS.map(n => (
                <button
                  key={n.id}
                  className={`nav-btn ${tab === n.id ? "active" : ""}`}
                  onClick={() => setTab(n.id)}
                >
                  <Icon d={n.icon} size={16} />
                  {n.label}
                  {n.id === "checker" && pendingDeck && (
                    <span style={{
                      marginLeft: 'auto', width: '8px', height: '8px',
                      background: 'var(--success)', borderRadius: '50%',
                      boxShadow: '0 0 6px rgba(0,230,118,0.6)'
                    }} />
                  )}
                </button>
              ))}
            </nav>

            <div className="user-profile-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {user?.photoURL
                  ? <img src={user.photoURL} alt="avatar" className="user-avatar" style={{ width: '36px', height: '36px' }} />
                  : <div className="user-avatar-placeholder" style={{ width: '36px', height: '36px' }}><UserIcon size={18} /></div>}
                <div className="user-details" style={{ overflow: 'hidden', flex: 1 }}>
                  <div className="user-name" style={{ fontWeight: '700', color: 'var(--text-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.displayName || t('common.user')}
                  </div>
                  <div className="user-email" style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email}
                  </div>
                </div>
                <button
                  className="logout-btn"
                  onClick={logout}
                  title={t('common.logout')}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            <div className="sidebar-credits">
              {t('nav.credits')} <span className="text-accent">Marco Feoli</span>
            </div>
          </aside>

          <main className="main-content">
            {renderContent(tab)}
          </main>
        </div>
      )}

      {/* ── MOBILE ──────────────────────────────────────────────── */}
      {isMobile && (
        <div className="mobile-layout">
          <div className="mobile-header">
            <div className="mobile-logo" style={{ fontSize: '1.2rem', fontWeight: '900', display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: '24px', height: '24px', 
                background: 'linear-gradient(135deg, #00bcd4 0%, #3f51b5 100%)',
                borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: '8px'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span style={{ color: 'white' }}>Mythic Studio</span>
            </div>
            <div className="mobile-user-actions">
              <LanguageToggle lang={lang} setLang={setLang} />
              {user?.photoURL && <img src={user.photoURL} alt="avatar" className="user-avatar-sm" />}
              <button className="logout-btn-sm" onClick={logout}><LogOut size={16} /></button>
            </div>
          </div>

          <div className="mobile-tabs">
            {[
              { id: "proxy",   label: "🖨 " + t('nav.proxy')   },
              { id: "ocr",     label: "👁 " + t('nav.ocr')     },
              { id: "token",   label: "🃏 " + t('nav.token')   },
              { id: "studio",  label: "🎨 " + t('nav.studio')  },
              { id: "checker", label: "🔍 " + t('nav.checker') },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`mobile-tab-btn ${tab === item.id ? "active" : ""}`}
              >
                {item.label}
                {item.id === "checker" && pendingDeck && (
                  <span style={{
                    display: 'inline-block', width: '6px', height: '6px',
                    background: 'var(--success)', borderRadius: '50%',
                    marginLeft: '4px', verticalAlign: 'middle'
                  }} />
                )}
              </button>
            ))}
          </div>

          <div
            className="mobile-content"
            style={tab === 'studio' ? { padding: 0, overflow: 'hidden', gap: 0 } : {}}
          >
            {renderContent(tab)}
          </div>
        </div>
      )}
    </div>
  );
}