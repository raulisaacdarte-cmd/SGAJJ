'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

function subscribeTheme(cb: () => void) {
  window.addEventListener('sgajj-theme-change', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('sgajj-theme-change', cb);
    window.removeEventListener('storage', cb);
  };
}

function getThemeSnapshot(): Theme {
  const stored = localStorage.getItem('sgajj_theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, getThemeSnapshot, (): Theme => 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('sgajj_theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    window.dispatchEvent(new Event('sgajj-theme-change'));
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
