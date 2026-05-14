import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Wand2, ShieldCheck, Zap, Layers, ChevronRight } from 'lucide-react';
import './LandingPage.css';

const LandingPage = () => {
  const { login } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [error, setError] = React.useState(null);

  const handleLogin = async () => {
    try {
      setError(null);
      await login();
    } catch (err) {
      console.error("Login Error:", err);
      if (err.code === 'auth/popup-blocked') {
        alert(t('landing.popup_blocked'));
      } else if (err.code === 'auth/unauthorized-domain') {
        alert(t('landing.unauthorized_domain'));
      } else {
        alert(t('landing.login_error') + err.message);
      }
      setError(err.message);
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-glow"></div>
      
      <div className="landing-lang-toggle">
        <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>IT</button>
        <span className="sep">|</span>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
      </div>

      <main className="landing-content">
        <div className="hero-section">
          <div className="badge">{t('landing.hero_badge')}</div>
          <h1>{t('landing.hero_title')} <span className="text-gradient">& Studio</span></h1>
          <p className="hero-subtitle">
            {t('landing.hero_subtitle')}
          </p>
          
          <div className="cta-wrapper">
            <button className="login-cta" onClick={handleLogin}>
              <svg className="google-icon" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t('landing.login_btn')}
            </button>
          </div>
          {error && <p className="login-error-msg">{error}</p>}
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Wand2 /></div>
            <h3>{t('landing.scanner_title')}</h3>
            <p>{t('landing.scanner_desc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Layers /></div>
            <h3>{t('landing.studio_title')}</h3>
            <p>{t('landing.studio_desc')}</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><ShieldCheck /></div>
            <h3>{t('landing.cloud_title')}</h3>
            <p>{t('landing.cloud_desc')}</p>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p>© 2026 MTG Token Generator & Studio • {t('landing.footer')}</p>
      </footer>
    </div>
  );
};

export default LandingPage;
