import React, { createContext, useState, useContext, useEffect } from 'react';
import it from '../locales/it';
import en from '../locales/en';

const LanguageContext = createContext();

const locales = { it, en };

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('mtg_tools_lang') || 'it';
  });

  useEffect(() => {
    localStorage.setItem('mtg_tools_lang', lang);
  }, [lang]);

  const t = (path, params = {}) => {
    const keys = path.split('.');
    let result = locales[lang];
    
    for (const key of keys) {
      if (result[key] === undefined) {
        // Fallback to English if key missing in current lang
        let fallback = locales['en'];
        for (const fkey of keys) {
          if (fallback[fkey] === undefined) return path;
          fallback = fallback[fkey];
        }
        result = fallback;
        break;
      }
      result = result[key];
    }

    if (typeof result !== 'string') return path;

    // Interpolation: replace {count} with params.count
    let finalStr = result;
    Object.keys(params).forEach(p => {
      finalStr = finalStr.replace(`{${p}}`, params[p]);
    });
    
    return finalStr;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
