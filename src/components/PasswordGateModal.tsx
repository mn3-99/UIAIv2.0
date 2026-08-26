import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldAlert } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface PasswordGateModalProps {
  onUnlock: (password: string) => boolean | Promise<boolean>;
}

export const PasswordGateModal: React.FC<PasswordGateModalProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onUnlock(password);
    if (!success) {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-50 flex items-center justify-center p-4">
      <div className="modal-themed bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md text-center space-y-6 shadow-2xl animate-scale-up">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-extrabold text-white">{APP_CONFIG.name} محمي بكلمة مرور</h2>
          <p className="text-xs text-slate-400">يرجى إدخال كلمة المرور المعتمدة لفتح الواجهة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              placeholder="أدخل كلمة المرور..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              autoFocus
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors text-center font-mono"
            />
          </div>

          {error && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-red-400">
              <ShieldAlert className="w-4 h-4" />
              <span>كلمة المرور غير صحيحة، حاول مجدداً</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-950/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>فتح التطبيق</span>
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
        </form>

        <div className="text-[11px] text-slate-500 font-sans">
          {APP_CONFIG.copyright} — {APP_CONFIG.officialDomain}
        </div>
      </div>
    </div>
  );
};
