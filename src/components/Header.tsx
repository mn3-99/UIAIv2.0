import React from 'react';
import { Menu, Plus, Settings, Sparkles, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { AppSettings, ProviderConfig } from '../types';
import { ConnectionStatus } from '../utils/connectionManager';

interface HeaderProps {
  settings: AppSettings;
  providers: ProviderConfig[];
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onSelectModel: (providerId: string, modelId: string) => void;
  isOnline: boolean;
  connectionStatus?: ConnectionStatus;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  providers,
  onToggleSidebar,
  onNewChat,
  onOpenSettings,
  onSelectModel,
  isOnline,
  connectionStatus = 'connected'
}) => {
  // Find current active provider & model
  const activeProvider = providers.find(p => p.id === settings.activeProviderId) || providers[0];
  const activeModel = activeProvider?.models.find(m => m.id === settings.activeModelId) || activeProvider?.models[0];

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-30 transition-colors">
      {/* Right side (RTL Start): Menu toggle + Brand Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          aria-label="فتح القائمة الجانبية"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 cursor-pointer select-none" onClick={onNewChat}>
          {/* MijlAi Inline SVG Icon */}
          <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-700/60 p-1.5 flex items-center justify-center shadow-md shadow-emerald-950/20 group hover:border-emerald-500/50 transition-colors">
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
              <rect width="100" height="100" rx="20" fill="#0f172a" />
              <path d="M25 65V35L45 50L65 35V65" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="75" cy="40" r="6" fill="#38bdf8" />
              <circle cx="75" cy="60" r="4" fill="#10b981" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-white font-sans">
                {APP_CONFIG.name}
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v{APP_CONFIG.version}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center / Model Picker (G4F Exclusive & Prominent) */}
      <div className="flex items-center gap-2 bg-slate-950/80 border border-emerald-500/30 hover:border-emerald-500/50 rounded-full px-3.5 py-1.5 shadow-md shadow-emerald-950/20 transition-all">
        <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
        <select
          value={`${settings.activeProviderId}:${settings.activeModelId}`}
          onChange={(e) => {
            const [pId, ...rest] = e.target.value.split(':');
            const mId = rest.join(':');
            onSelectModel(pId, mId);
          }}
          className="bg-transparent text-xs sm:text-sm font-bold text-emerald-300 outline-none cursor-pointer max-w-[200px] sm:max-w-[300px] truncate"
        >
          {providers.map(p => {
            // Group models by category if g4f provider
            if (p.id === 'g4f') {
              const categories: Record<string, typeof p.models> = {
                "🤖 نماذج كلاود (Claude)": [],
                "🌙 نماذج كيمي ومونشوت (Kimi)": [],
                "🧠 نماذج أوبن إيه آي (OpenAI & Reasoning)": [],
                "🔮 نماذج ديب سيك (DeepSeek)": [],
                "✨ نماذج جيميني (Gemini g4f)": [],
                "🌐 نماذج مفتوحة المصدر (Qwen / Llama / Grok)": []
              };

              p.models.forEach(m => {
                const id = m.id.toLowerCase();
                const name = m.name.toLowerCase();
                if (id.includes('claude') || name.includes('claude')) {
                  categories["🤖 نماذج كلاود (Claude)"].push(m);
                } else if (id.includes('kimi') || id.includes('moonshot') || name.includes('kimi') || name.includes('moonshot')) {
                  categories["🌙 نماذج كيمي ومونشوت (Kimi)"].push(m);
                } else if (id.includes('gpt') || id.includes('o1') || id.includes('o3') || name.includes('gpt') || name.includes('o1') || name.includes('o3')) {
                  categories["🧠 نماذج أوبن إيه آي (OpenAI & Reasoning)"].push(m);
                } else if (id.includes('deepseek') || name.includes('deepseek')) {
                  categories["🔮 نماذج ديب سيك (DeepSeek)"].push(m);
                } else if (id.includes('gemini') || name.includes('gemini')) {
                  categories["✨ نماذج جيميني (Gemini g4f)"].push(m);
                } else {
                  categories["🌐 نماذج مفتوحة المصدر (Qwen / Llama / Grok)"].push(m);
                }
              });

              return (
                <React.Fragment key={p.id}>
                  {Object.entries(categories).map(([catName, catModels]) => {
                    if (catModels.length === 0) return null;
                    return (
                      <optgroup key={catName} label={catName} className="bg-slate-900 text-emerald-400 font-bold">
                        {catModels.map(m => {
                          const baseName = m.name.replace(/\s*\(g4f Free\)$/i, '');
                          return (
                            <option key={`${p.id}:${m.id}`} value={`${p.id}:${m.id}`} className="bg-slate-900 text-slate-100 font-medium py-1">
                              {baseName} [FREE / G4F]
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </React.Fragment>
              );
            }

            return (
              <optgroup key={p.id} label={p.name} className="bg-slate-900 text-slate-300 font-bold">
                {p.models.map(m => (
                  <option key={`${p.id}:${m.id}`} value={`${p.id}:${m.id}`} className="bg-slate-900 text-slate-100 font-medium">
                    {m.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* Left Side (RTL End): Actions & Connection Badge */}
      <div className="flex items-center gap-2">
        {/* Visual Connection Badge (Subtle UX Indicator) */}
        {connectionStatus === 'connected' && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium" title="الاتصال بالخادم ممتاز وعامل بنجاح">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px]">متصل</span>
          </div>
        )}

        {connectionStatus === 'reconnecting' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium" title="جاري استعادة الاتصال تلقائياً...">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span className="text-[11px]">جاري الاتصال...</span>
          </div>
        )}

        {connectionStatus === 'offline' && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium" title="انقطع الاتصال بالشبكة">
            <WifiOff className="w-3 h-3 text-rose-400" />
            <span className="text-[11px]">أوفلاين</span>
          </div>
        )}

        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
          title="محادثة جديدة (Ctrl+Shift+O)"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">محادثة جديدة</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors relative"
          title="الإعدادات"
        >
          <Settings className="w-5 h-5" />
          {settings.passwordProtected && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>
      </div>
    </header>
  );
};
