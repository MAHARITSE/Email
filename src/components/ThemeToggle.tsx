import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div
      id="theme-toggle-floating-container"
      className="fixed bottom-5 right-5 z-50 flex items-center select-none"
    >
      <button
        id="theme-toggle-btn"
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        className={`group relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 shadow-xl backdrop-blur-md border ${
          isDark
            ? 'bg-[#0c1017]/90 border-slate-700/80 text-amber-400 hover:border-amber-400/80 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]'
            : 'bg-white/95 border-slate-300/80 text-cyan-600 hover:border-cyan-500/80 hover:bg-slate-50 hover:shadow-[0_0_20px_rgba(34,211,238,0.35)]'
        }`}
      >
        {isDark ? (
          /* Nuit -> Soleil */
          <Sun className="h-5 w-5 transition-transform duration-300 group-hover:rotate-45" />
        ) : (
          /* Claire -> Lune */
          <Moon className="h-5 w-5 transition-transform duration-300 group-hover:-rotate-12" />
        )}
      </button>
    </div>
  );
};
