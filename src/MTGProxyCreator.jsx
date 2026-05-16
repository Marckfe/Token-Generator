import React, { useState, useEffect, useCallback, useMemo, useRef, memo, lazy, Suspense } from "react";
import ProxyCreatorMain from "./components/ProxyCreator/ProxyCreatorMain";
import DeckChecker from "./components/DeckChecker/DeckChecker";
import TabSpinner from "./components/common/TabSpinner";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import {
  LogOut,
  User as UserIcon,
  Printer,
  Eye,
  Plus,
  PenLine,
  CheckCircle,
  Layers,
} from "lucide-react";
import { getUserQueue, saveUserQueue } from "./services/dbService";

const TokenPreviewSinglePtFrame = lazy(() => import("./TokenPreviewSinglePtFrame"));
const StudioEditor = lazy(() => import("./StudioEditor"));
const DeckScanner = lazy(() => import("./components/DeckScanner/DeckScanner"));

const NAV_ICON_MAP = {
  proxy: Printer,
  ocr: Eye,
  token: Plus,
  studio: PenLine,
  checker: CheckCircle,
};

const LanguageToggle = memo(function LanguageToggle({ lang, setLang }) {
  const selectIt = useCallback(() => setLang("it"), [setLang]);
  const selectEn = useCallback(() => setLang("en"), [setLang]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "2px",
      background: "rgba(255, 255, 255, 0.05)",
      padding: "4px 10px",
      borderRadius: "20px",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      fontSize: "0.72rem",
      fontWeight: "700",
      backdropFilter: "blur(10px)",
      flexShrink: 0,
    }}>
      <button
        type="button"
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "2px 5px", borderRadius: "4px",
          color: lang === "it" ? "#00bcd4" : "rgba(255,255,255,0.3)",
          fontWeight: "700", fontSize: "0.72rem",
          transition: "color 0.2s",
        }}
        onClick={selectIt}
      >IT</button>
      <span style={{ color: "rgba(255,255,255,0.1)", userSelect: "none" }}>|</span>
      <button
        type="button"
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "2px 5px", borderRadius: "4px",
          color: lang === "en" ? "#00bcd4" : "rgba(255,255,255,0.3)",
          fontWeight: "700", fontSize: "0.72rem",
          transition: "color 0.2s",
        }}
        onClick={selectEn}
      >EN</button>
    </div>
  );
});

function StudioLogo({ size = 20 }) {
  return <Layers size={size} strokeWidth={2.5} color="white" />;
}

const CLOUD_SAVE_DEBOUNCE_MS = 2000;

export default function MTGProxyCreator() {
  const [tab, setTab] = useState("proxy");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);
  const { lang, setLang, t } = useLanguage();
  const { user, logout } = useAuth();

  const [pendingDeck, setPendingDeck] = useState(null);
  const [tokenState, setTokenState] = useState(null);

  const [globalQueue, setGlobalQueue] = useState(() => {
    try {
      const saved = localStorage.getItem("mtg_print_queue");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [hasLoadedCloud, setHasLoadedCloud] = useState(false);
  const skipCloudSaveRef = useRef(true);
  const cloudSaveTimerRef = useRef(null);
  const queueForSaveRef = useRef(globalQueue);

  useEffect(() => {
    queueForSaveRef.current = globalQueue;
  }, [globalQueue]);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => {
    if (user && !hasLoadedCloud) {
      const timer = setTimeout(() => {
        getUserQueue(user.uid).then(cloudQueue => {
          if (cloudQueue?.length > 0) setGlobalQueue(cloudQueue);
          setHasLoadedCloud(true);
        }).catch(err => {
          if (import.meta.env.DEV) {
            console.error(">>> [Firestore] Fallback fetch error:", err);
          }
          setHasLoadedCloud(true);
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, hasLoadedCloud]);

  useEffect(() => {
    try { localStorage.setItem("mtg_print_queue", JSON.stringify(globalQueue)); } catch { /* ignore */ }
    if (!user || !hasLoadedCloud) return;

    if (skipCloudSaveRef.current) {
      skipCloudSaveRef.current = false;
      return;
    }

    clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = setTimeout(() => {
      saveUserQueue(user.uid, queueForSaveRef.current);
    }, CLOUD_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(cloudSaveTimerRef.current);
  }, [globalQueue, user, hasLoadedCloud]);

  const addToGlobalQueue = useCallback((newItems) => {
    setGlobalQueue(prev => [...prev, ...newItems]);
    setTab("proxy");
  }, []);

  const handleValidateDeck = useCallback((deckData) => {
    setPendingDeck(deckData);
    setTab("checker");
  }, []);

  const handleSelectTab = useCallback((id) => {
    setTab(id);
  }, []);

  const navItems = useMemo(() => [
    { id: "proxy", label: t("nav.proxy") },
    { id: "ocr", label: t("nav.ocr") },
    { id: "token", label: t("nav.token") },
    { id: "studio", label: t("nav.studio") },
    { id: "checker", label: t("nav.checker") },
  ], [t, lang]);

  const mobileTabItems = useMemo(() => [
    { id: "proxy", label: "🖨 " + t("nav.proxy") },
    { id: "ocr", label: "👁 " + t("nav.ocr") },
    { id: "token", label: "🃏 " + t("nav.token") },
    { id: "studio", label: "🎨 " + t("nav.studio") },
    { id: "checker", label: "🔍 " + t("nav.checker") },
  ], [t, lang]);

  const content = useMemo(() => {
    switch (tab) {
      case "proxy":
        return (
          <ProxyCreatorMain
            isMobile={isMobile}
            externalQueue={globalQueue}
            setExternalQueue={setGlobalQueue}
          />
        );
      case "ocr":
        return (
          <Suspense fallback={<TabSpinner />}>
            <DeckScanner
              onAddToQueue={addToGlobalQueue}
              onValidateDeck={handleValidateDeck}
            />
          </Suspense>
        );
      case "token":
        return (
          <Suspense fallback={<TabSpinner />}>
            <TokenPreviewSinglePtFrame
              state={tokenState}
              onStateChange={setTokenState}
            />
          </Suspense>
        );
      case "studio":
        return (
          <Suspense fallback={<TabSpinner />}>
            <StudioEditor />
          </Suspense>
        );
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
  }, [
    tab,
    isMobile,
    globalQueue,
    addToGlobalQueue,
    handleValidateDeck,
    tokenState,
    pendingDeck,
  ]);

  return (
    <div className="shell">
      {!isMobile && (
        <div style={{ position: "fixed", top: "24px", right: "32px", zIndex: 1000 }}>
          <LanguageToggle lang={lang} setLang={setLang} />
        </div>
      )}

      {!isMobile && (
        <div className="desktop-layout">
          <aside className="sidebar">
            <div className="sidebar-header" style={{ padding: "32px 20px 0 20px", textAlign: "center" }}>
              <div className="sidebar-logo" style={{ padding: 0, justifyContent: "center", fontSize: "1.6rem", fontWeight: "900", letterSpacing: "-0.04em" }}>
                <div style={{
                  width: "32px", height: "32px",
                  background: "linear-gradient(135deg, #00bcd4 0%, #3f51b5 100%)",
                  borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
                  marginRight: "12px", boxShadow: "0 4px 12px rgba(0, 188, 212, 0.3)",
                }}>
                  <StudioLogo size={20} />
                </div>
                <span style={{
                  background: "linear-gradient(135deg, #fff 0%, #00bcd4 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>Mythic Studio</span>
              </div>
            </div>

            <nav className="nav-group">
              {navItems.map(n => {
                const NavIcon = NAV_ICON_MAP[n.id];
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`nav-btn ${tab === n.id ? "active" : ""}`}
                    onClick={() => handleSelectTab(n.id)}
                  >
                    <NavIcon size={16} strokeWidth={2} />
                    {n.label}
                    {n.id === "checker" && pendingDeck && (
                      <span style={{
                        marginLeft: "auto", width: "8px", height: "8px",
                        background: "var(--success)", borderRadius: "50%",
                        boxShadow: "0 0 6px rgba(0,230,118,0.6)",
                      }} />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="user-profile-section" style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <div className="user-info" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {user?.photoURL
                  ? <img src={user.photoURL} alt="avatar" className="user-avatar" style={{ width: "36px", height: "36px" }} />
                  : <div className="user-avatar-placeholder" style={{ width: "36px", height: "36px" }}><UserIcon size={18} /></div>}
                <div className="user-details" style={{ overflow: "hidden", flex: 1 }}>
                  <div className="user-name" style={{ fontWeight: "700", color: "var(--text-light)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user?.displayName || t("common.user")}
                  </div>
                  <div className="user-email" style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user?.email}
                  </div>
                </div>
                <button
                  type="button"
                  className="logout-btn"
                  onClick={logout}
                  title={t("common.logout")}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "4px" }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            <div className="sidebar-credits">
              {t("nav.credits")} <span className="text-accent">Marco Feoli</span>
            </div>
          </aside>

          <main className="main-content">
            {content}
          </main>
        </div>
      )}

      {isMobile && (
        <div className="mobile-layout">
          <div className="mobile-header">
            <div className="mobile-logo" style={{ fontSize: "1.2rem", fontWeight: "900", display: "flex", alignItems: "center" }}>
              <div style={{
                width: "24px", height: "24px",
                background: "linear-gradient(135deg, #00bcd4 0%, #3f51b5 100%)",
                borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
                marginRight: "8px",
              }}>
                <StudioLogo size={14} />
              </div>
              <span style={{ color: "white" }}>Mythic Studio</span>
            </div>
            <div className="mobile-user-actions">
              <LanguageToggle lang={lang} setLang={setLang} />
              {user?.photoURL && <img src={user.photoURL} alt="avatar" className="user-avatar-sm" />}
              <button type="button" className="logout-btn-sm" onClick={logout}><LogOut size={16} /></button>
            </div>
          </div>

          <div className="mobile-tabs">
            {mobileTabItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`mobile-tab-btn ${tab === item.id ? "active" : ""}`}
              >
                {item.label}
                {item.id === "checker" && pendingDeck && (
                  <span style={{
                    display: "inline-block", width: "6px", height: "6px",
                    background: "var(--success)", borderRadius: "50%",
                    marginLeft: "4px", verticalAlign: "middle",
                  }} />
                )}
              </button>
            ))}
          </div>

          <div
            className="mobile-content"
            style={tab === "studio" ? { padding: 0, overflow: "hidden", gap: 0 } : {}}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
}