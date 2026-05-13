import React from "react";
import MTGProxyCreator from "./MTGProxyCreator";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LandingPage from "./components/LandingPage/LandingPage";

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LandingPage />;

  return <MTGProxyCreator />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
