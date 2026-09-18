import React from 'react';

interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ children, className = '' }) => (
  <kbd className={`
    inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-medium
    bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300
    rounded border border-slate-200 dark:border-slate-700
    shadow-sm select-none ${className}
  `}>
    {children}
  </kbd>
);
