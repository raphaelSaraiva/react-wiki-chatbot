import React, { createContext, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "wikiMetricsLanguage";
const SUPPORTED_LANGUAGES = ["pt", "en"];

const LanguageContext = createContext({
  language: "pt",
  setLanguage: () => {},
  toggleLanguage: () => {},
});

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(saved) ? saved : "pt";
  } catch {
    return "pt";
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  const setLanguage = (nextLanguage) => {
    const normalized = SUPPORTED_LANGUAGES.includes(nextLanguage)
      ? nextLanguage
      : "pt";

    setLanguageState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => setLanguage(language === "pt" ? "en" : "pt"),
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
