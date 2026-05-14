import React from "react";
import MTGProxyCreator from "./MTGProxyCreator";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LandingPage from "./components/LandingPage/LandingPage";

import { LanguageProvider } from "./context/LanguageContext";

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LandingPage />;

  return <MTGProxyCreator />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
