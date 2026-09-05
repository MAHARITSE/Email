import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();

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
        className={`group relative flex items-center gap-1.5 rounded-full p-1.5 transition-all duration-300 shadow-xl backdrop-blur-md border ${
          isDark
            ? 'bg-[#0c1017]/90 border-slate-700/80 text-slate-300 hover:border-cyan-500/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]'
            : 'bg-white/95 border-slate-300/80 text-slate-700 hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]'
        }`}
      >
        {/* Sun Icon */}
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${
            !isDark
              ? 'bg-amber-400 text-slate-900 shadow-[0_0_12px_rgba(245,158,11,0.5)] scale-105'
              : 'text-slate-400 hover:text-amber-300'
          }`}
        >
          <Sun className={`h-4 w-4 transition-transform duration-300 ${!isDark ? 'rotate-45' : ''}`} />
        </div>

        {/* Moon Icon */}
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${
            isDark
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.5)] scale-105'
              : 'text-slate-400 hover:text-cyan-600'
          }`}
        >
          <Moon className="h-4 w-4" />
        </div>

        {/* Status label tooltip / badge */}
        <span
          className={`hidden sm:inline-block pr-2 text-[11px] font-mono font-medium tracking-wide uppercase transition-colors ${
            isDark ? 'text-slate-400 group-hover:text-cyan-300' : 'text-slate-500 group-hover:text-slate-900'
          }`}
        >
          {isDark ? 'Sombre' : 'Clair'}
        </span>
      </button>
    </div>
  );
};
