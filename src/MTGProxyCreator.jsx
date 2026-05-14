import React, { useState, useEffect } from "react";
import ProxyCreatorMain from "./components/ProxyCreator/ProxyCreatorMain";
import TokenPreviewSinglePtFrame from "./TokenPreviewSinglePtFrame";
import StudioEditor from "./StudioEditor";
import DeckChecker from "./components/DeckChecker/DeckChecker";
import DeckScanner from "./components/DeckScanner/DeckScanner";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import { LogOut, User as UserIcon, Globe } from "lucide-react";
import { getUserQueue, saveUserQueue } from "./services/dbService";

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
  const { lang, setLang, t } = useLanguage();
  const [globalQueue, setGlobalQueue] = useState(() => {
    const saved = localStorage.getItem("mtg_print_queue");
    return saved ? JSON.parse(saved) : [];
  });
  const { user, logout } = useAuth();
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // Sync Cloud -> Local al login
  useEffect(() => {
    const syncCloud = async () => {
      if (user && !hasLoadedCloud) {
        const cloudQueue = await getUserQueue(user.uid);
        if (cloudQueue && cloudQueue.length > 0) {
          setGlobalQueue(cloudQueue);
        }
        setHasLoadedCloud(true);
      }
    };
    syncCloud();
  }, [user, hasLoadedCloud]);

  // Sync Local -> Cloud al cambiamento
  useEffect(() => {
    localStorage.setItem("mtg_print_queue", JSON.stringify(globalQueue));
    if (user && hasLoadedCloud) {
      saveUserQueue(user.uid, globalQueue);
    }
  }, [globalQueue, user, hasLoadedCloud]);

  const addToGlobalQueue = (newItems) => {
    setGlobalQueue(prev => [...prev, ...newItems]);
    setTab("proxy"); // Switch to proxy tab to show results
  };

  const LanguageToggle = ({ className = "" }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border)' }} className={className}>
      <button 
        style={{ 
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.3s',
          backgroundColor: lang === 'it' ? 'var(--accent)' : 'transparent',
          color: lang === 'it' ? '#000' : 'var(--muted)',
          border: 'none'
        }}
        onClick={() => setLang('it')}
      >
        <span style={{ fontSize: '14px' }}>🇮🇹</span> IT
      </button>
      <button 
        style={{ 
          display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.3s',
          backgroundColor: lang === 'en' ? 'var(--accent)' : 'transparent',
          color: lang === 'en' ? '#000' : 'var(--muted)',
          border: 'none'
        }}
        onClick={() => setLang('en')}
      >
        <span style={{ fontSize: '14px' }}>🇺🇸</span> EN
      </button>
    </div>
  );

  return (
    <div className="shell">
      {/* SIDEBAR desktop */}
      {!isMobile && (
        <div className="desktop-layout">
          <aside className="sidebar">
            <div className="sidebar-logo">
              🃏 MTG Tools
            </div>
            <div className="nav-group">
              {[
                { id: "proxy", icon: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", label: t('nav.proxy') },
                { id: "ocr", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", label: t('nav.ocr') },
                { id: "token", icon: "M12 5v14M5 12h14", label: t('nav.token') },
                { id: "studio", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", label: t('nav.studio') },
                { id: "checker", icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z", label: t('nav.checker') },
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
            </div>

            <div className="user-profile-section" style={{ paddingBottom: '10px' }}>
              <div className="user-info">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="User" className="user-avatar" />
                ) : (
                  <div className="user-avatar-placeholder"><UserIcon size={20} /></div>
                )}
                <div className="user-details">
                  <span className="user-name">{user?.displayName || t('common.user')}</span>
                  <span className="user-email">{user?.email}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', width: '100%', gap: '10px' }}>
                <LanguageToggle />
                <button className="logout-btn" onClick={logout} title={t('common.logout')} style={{ marginLeft: 'auto' }}>
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            <div className="sidebar-credits">
              {t('nav.credits')} <span className="text-accent">Marco Feoli</span>
            </div>
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
          <div className="mobile-header">
             <div className="mobile-logo">🃏 MTG Tools</div>
             <div className="mobile-user-actions">
               <LanguageToggle className="mr-2" />
               {user?.photoURL && <img src={user.photoURL} alt="User" className="user-avatar-sm" />}
               <button className="logout-btn-sm" onClick={logout}>
                 <LogOut size={18} />
               </button>
             </div>
          </div>
          <div className="mobile-tabs">
            {[
              { id: "proxy", label: "🖨 " + t('nav.proxy') }, 
              { id: "ocr", label: "👁️ " + t('nav.ocr') },
              { id: "token", label: "🃏 " + t('nav.token') },
              { id: "studio", label: "🎨 " + t('nav.studio') },
              { id: "checker", label: "🔍 " + t('nav.checker') }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`mobile-tab-btn ${tab === item.id ? "active" : ""}`}
              >
                {item.label}
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