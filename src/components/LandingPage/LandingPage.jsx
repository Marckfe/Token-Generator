import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Wand2, ShieldCheck, Zap, Layers, ChevronRight } from 'lucide-react';
import './LandingPage.css';

const LandingPage = () => {
  const { login } = useAuth();
  const [error, setError] = React.useState(null);

  const handleLogin = async () => {
    try {
      setError(null);
      await login();
    } catch (err) {
      console.error("Login Error:", err);
      if (err.code === 'auth/popup-blocked') {
        alert("Il pop-up di Google è stato bloccato dal browser. Abilitalo per continuare.");
      } else if (err.code === 'auth/unauthorized-domain') {
        alert("Questo dominio non è autorizzato su Firebase. Aggiungilo nelle impostazioni di Authentication -> Settings -> Authorized domains.");
      } else {
        alert("Errore durante il login: " + err.message);
      }
      setError(err.message);
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-glow"></div>
      
      <main className="landing-content">
        <div className="hero-section">
          <div className="badge">AI-Powered MTG Tools</div>
          <h1>Token Generator <span className="text-gradient">& Studio</span></h1>
          <p className="hero-subtitle">
            La piattaforma definitiva per creare proxy, scansionare mazzi con l'IA e gestire la tua collezione Magic: The Gathering.
          </p>
          
          <button className="login-cta" onClick={handleLogin}>
            Entra con Google <ChevronRight size={20} />
          </button>
          {error && <p style={{ color: '#ff5252', marginTop: '16px', fontSize: '0.8rem' }}>{error}</p>}
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Wand2 /></div>
            <h3>Deck Scanner IA</h3>
            <p>Trasforma le foto delle tue carte in liste digitali istantanee grazie alla visione artificiale.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Layers /></div>
            <h3>Proxy Studio</h3>
            <p>Crea proxy di altissima qualità con layout personalizzati, frame alternativi e stampa professionale.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><ShieldCheck /></div>
            <h3>Cloud Sync</h3>
            <p>Salva i tuoi mazzi e le tue code di stampa sul cloud e ritrovali su ogni dispositivo.</p>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p>© 2026 MTG Token Generator & Studio • Made for Planeswalkers</p>
      </footer>
    </div>
  );
};

export default LandingPage;
