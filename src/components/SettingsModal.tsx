import React, { useState, useEffect } from 'react';
import {
  X, Settings, Key, Palette, Shield, Database, Sparkles, Check,
  AlertCircle, RefreshCw, Plus, Trash2, HelpCircle, Cpu, Bot, Code, Zap, Globe
} from 'lucide-react';
import { AppSettings, ProviderConfig, TestConnectionResult, ThemeOption } from '../types';
import { APP_CONFIG } from '../config';
import { hashPassword } from '../utils/storage';
import { applyTheme } from '../utils/theme';
import { useModalA11y } from '../utils/useModalA11y';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  providers: ProviderConfig[];
  onAddCustomProvider: (provider: ProviderConfig) => void;
  onDeleteCustomProvider: (id: string) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onClearData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  providers,
  onAddCustomProvider,
  onDeleteCustomProvider,
  onExportBackup,
  onImportBackup,
  onClearData
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'appearance' | 'security' | 'data' | 'shortcuts'>('providers');

  // Custom Provider Form state
  const [newProvName, setNewProvName] = useState('');
  const [newProvBaseURL, setNewProvBaseURL] = useState('');
  const [newProvKey, setNewProvKey] = useState('');
  const [newProvModelId, setNewProvModelId] = useState('');

  // Password setup state
  const [passwordInput, setPasswordInput] = useState('');

  // Connection testing state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestConnectionResult>>({});

  // Models state
  const [availableModels, setAvailableModels] = useState<Array<{id: string; name: string; provider: string; icon?: string; is_free?: boolean}>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Accessibility: focus trap + Escape-to-close + focus restoration
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);

  // Load models from API on mount
  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      setModelsError(null);
      try {
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) {
            setAvailableModels(data.models);
          }
        } else {
          setModelsError('فشل تحميل النماذج من الخادم');
        }
      } catch (err: any) {
        setModelsError(`خطأ في الاتصال: ${err.message}`);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

  if (!isOpen) return null;

  // Test provider connection
  const handleTestConnection = async (provider: ProviderConfig) => {
    setTestingId(provider.id);
    const apiKey = settings.apiKeys[provider.id] || provider.apiKey;

    try {
      if (provider.isBuiltIn) {
        // Test built-in endpoint
        const res = await fetch('/api/models');
        if (res.ok) {
          setTestResult(prev => ({
            ...prev,
            [provider.id]: { success: true, message: 'الاتصال بالمزود المدمج يعمل بنجاح!' }
          }));
        } else {
          setTestResult(prev => ({
            ...prev,
            [provider.id]: { success: false, message: `فشل الاتصال بالمزود المدمج (${res.status})` }
          }));
        }
      } else {
        // Test external OpenAI-compatible models endpoint
        const targetUrl = `${provider.baseURL.replace(/\/$/, '')}/models`;
        const headers: Record<string, string> = {};
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await fetch(targetUrl, { headers });
        if (res.ok) {
          const data = await res.json();
          const count = data?.data?.length || 0;
          setTestResult(prev => ({
            ...prev,
            [provider.id]: {
              success: true,
              message: `تم الاتصال بنجاح! تم العثور على ${count} نموذج متاح.`,
              modelsFound: count
            }
          }));
        } else {
          const errText = await res.text();
          setTestResult(prev => ({
            ...prev,
            [provider.id]: {
              success: false,
              message: `خطأ اتصال (${res.status}): ${errText.substring(0, 100)}`
            }
          }));
        }
      }
    } catch (err: any) {
      setTestResult(prev => ({
        ...prev,
        [provider.id]: {
          success: false,
          message: `عطل في الشبكة أو CORS: ${err.message}`
        }
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveCustomProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProvName || !newProvBaseURL || !newProvModelId) return;

    const newProv: ProviderConfig = {
      id: `custom-${Date.now()}`,
      name: newProvName,
      baseURL: newProvBaseURL,
      apiKey: newProvKey || undefined,
      isBuiltIn: false,
      requiresApiKey: !!newProvKey,
      models: [
        { id: newProvModelId, name: newProvModelId, provider: newProvName }
      ]
    };

    onAddCustomProvider(newProv);
    setNewProvName('');
    setNewProvBaseURL('');
    setNewProvKey('');
    setNewProvModelId('');
  };

  const handleUpdateApiKey = (providerId: string, key: string) => {
    onUpdateSettings({
      ...settings,
      apiKeys: {
        ...settings.apiKeys,
        [providerId]: key
      }
    });
  };

  const handleThemeChange = (theme: ThemeOption) => {
    applyTheme(theme);
    onUpdateSettings({ ...settings, theme });
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const pass = passwordInput.trim();
    if (pass) {
      const passwordHash = await hashPassword(pass);
      onUpdateSettings({
        ...settings,
        passwordProtected: true,
        passwordHash
      });
      setPasswordInput('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="الإعدادات" tabIndex={-1} className="modal-themed bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-slate-100 text-base">إعدادات {APP_CONFIG.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/30 px-4 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('providers')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'providers'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>المزودات والمفاتيح</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'appearance'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>الهوية والمظهر</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'security'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>الأمان والقفل</span>
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'data'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>إدارة البيانات</span>
          </button>

          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'shortcuts'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>الاختصارات</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs text-slate-300">
          {/* TAB 1: Providers & API Keys */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  المزودات المفعلة ومفاتيح API
                </h3>

                {providers.map(prov => (
                  <div
                    key={prov.id}
                    className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-200 flex items-center gap-2">
                          <span>{prov.name}</span>
                          {prov.isBuiltIn && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              مدمج مجاني
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">{prov.baseURL}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestConnection(prov)}
                          disabled={testingId === prov.id}
                          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg transition-colors text-[11px]"
                        >
                          {testingId === prov.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>اختبار الاتصال</span>
                        </button>

                        {!prov.isBuiltIn && (
                          <button
                            onClick={() => onDeleteCustomProvider(prov.id)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800"
                            title="حذف المزود"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* API Key Input */}
                    {prov.requiresApiKey && (
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-400">مفتاح API الخاص بـ {prov.name}:</label>
                        <input
                          type="password"
                          placeholder="sk-..."
                          value={settings.apiKeys[prov.id] || ''}
                          onChange={(e) => handleUpdateApiKey(prov.id, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    )}

                    {/* Test result banner */}
                    {testResult[prov.id] && (
                      <div
                        className={`p-2.5 rounded-lg text-[11px] flex items-start gap-2 ${
                          testResult[prov.id].success
                            ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                            : 'bg-red-950/40 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {testResult[prov.id].success ? (
                          <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                        )}
                        <div>{testResult[prov.id].message}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Custom Provider Form */}
              <form onSubmit={handleSaveCustomProvider} className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-slate-200 flex items-center gap-1">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  إضافة مزود خارجي جديد (OpenAI Compatible / Ollama)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">اسم المزود:</label>
                    <input
                      type="text"
                      placeholder="مثال: Groq أو Local Ollama"
                      value={newProvName}
                      onChange={(e) => setNewProvName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Base URL:</label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434/v1"
                      value={newProvBaseURL}
                      onChange={(e) => setNewProvBaseURL(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">معرف النموذج (Model ID):</label>
                    <input
                      type="text"
                      placeholder="llama3.1"
                      value={newProvModelId}
                      onChange={(e) => setNewProvModelId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">مفتاح API (اختياري):</label>
                    <input
                      type="password"
                      placeholder="اختياري"
                      value={newProvKey}
                      onChange={(e) => setNewProvKey(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-lg text-xs transition-colors"
                >
                  إضافة المزود
                </button>
              </form>

              {/* Available Models from API */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  النماذج المتاحة من الخادم
                </h4>
                
                {loadingModels ? (
                  <div className="flex items-center justify-center py-4 text-slate-400 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 mr-2" />
                    جاري تحميل النماذج...
                  </div>
                ) : modelsError ? (
                  <div className="flex items-center gap-2 text-red-400 text-xs p-2 bg-red-950/30 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modelsError}</span>
                    <button
                      onClick={() => {
                        setLoadingModels(true);
                        setModelsError(null);
                        fetch('/api/models').then(res => res.json()).then(data => {
                          if (data.models) setAvailableModels(data.models);
                          setLoadingModels(false);
                        }).catch(() => { setModelsError('فشل إعادة التحميل'); setLoadingModels(false); });
                      }}
                      className="text-xs underline hover:text-red-300"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                ) : availableModels.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-400">
                      اختر النموذج الافتراضي للمحادثات الجديدة (يمكن تغييره من شريط الكتابة):
                    </p>
                    <select
                      value={settings.activeModelId}
                      onChange={(e) => onUpdateSettings({ ...settings, activeModelId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} {model.is_free ? '✓ مجاني' : ''} ({model.provider})
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {availableModels.map((model) => (
                        <div
                          key={model.id}
                          className={`p-2 rounded-lg text-[10px] text-center transition-all ${
                            settings.activeModelId === model.id
                              ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-300'
                              : 'bg-slate-900/50 border border-slate-700/50 text-slate-300 hover:border-emerald-500/50'
                          }`}
                          onClick={() => onUpdateSettings({ ...settings, activeModelId: model.id })}
                        >
                          <div className="font-medium truncate">{model.name}</div>
                          <div className="flex items-center justify-center gap-1 text-[9px] text-slate-500">
                            {model.is_free && <span className="text-emerald-400">✓ مجاني</span>}
                            <span>{model.provider}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 text-center py-2">لا توجد نماذج متاحة</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Appearance & Theme Selection */}
          {activeTab === 'appearance' && (
            <div className="space-y-5">
              <h3 className="font-bold text-sm text-slate-100">الهوية البصرية ونمط الألوان</h3>
              <p className="text-slate-400">اختر إحدى الهويات البصرية المجهزة بعناية فائقة وتناسق بصري مبهر:</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* System (follows OS) */}
                <button
                  onClick={() => handleThemeChange('system')}
                  className={`p-4 rounded-xl border text-right transition-all space-y-2 ${
                    settings.theme === 'system'
                      ? 'border-blue-500 bg-blue-500/10 shadow-lg'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">تلقائي (حسب النظام)</span>
                    {settings.theme === 'system' && <Check className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-white border border-slate-300" />
                    <div className="w-4 h-4 rounded-full bg-slate-900" />
                    <div className="w-4 h-4 rounded-full bg-blue-500" />
                  </div>
                  <p className="text-[11px] text-slate-400">يتبع مظهر نظام التشغيل تلقائياً — نهاري فاتح وليلي داكن.</p>
                </button>

                {/* Light */}
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`p-4 rounded-xl border text-right transition-all space-y-2 ${
                    settings.theme === 'light'
                      ? 'border-blue-500 bg-blue-500/10 shadow-lg'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">فاتح (Light)</span>
                    {settings.theme === 'light' && <Check className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-sky-100 border border-sky-200" />
                    <div className="w-4 h-4 rounded-full bg-white border border-slate-200" />
                    <div className="w-4 h-4 rounded-full bg-blue-600" />
                  </div>
                  <p className="text-[11px] text-slate-400">واجهة فاتحة نقية بتدرج سماوي هادئ ولون أزرق ملكي.</p>
                </button>

                {/* Dark */}
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`p-4 rounded-xl border text-right transition-all space-y-2 ${
                    settings.theme === 'dark'
                      ? 'border-blue-500 bg-blue-500/10 shadow-lg'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">داكن (Dark)</span>
                    {settings.theme === 'dark' && <Check className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-slate-950 border border-slate-700" />
                    <div className="w-4 h-4 rounded-full bg-slate-800" />
                    <div className="w-4 h-4 rounded-full bg-blue-500" />
                  </div>
                  <p className="text-[11px] text-slate-400">وضع ليلي عميق مريح للعين بتباين عالٍ وألوان هادئة.</p>
                </button>

                {/* Theme A: Emerald Slate */}
                <button
                  onClick={() => handleThemeChange('emerald-slate')}
                  className={`p-4 rounded-xl border text-right transition-all space-y-2 ${
                    settings.theme === 'emerald-slate'
                      ? 'border-emerald-500 bg-emerald-950/30 shadow-lg shadow-emerald-950/40'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">الهوية الزمردية (Emerald Slate)</span>
                    {settings.theme === 'emerald-slate' && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-slate-950 border border-slate-700" />
                    <div className="w-4 h-4 rounded-full bg-slate-900" />
                    <div className="w-4 h-4 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-[11px] text-slate-400">خلفية كحلية عميقة مع لمسات زمردية مشرقة وتدرجات ناعمة مريحة للعين.</p>
                </button>

                {/* Theme B: Obsidian Amber */}
                <button
                  onClick={() => handleThemeChange('obsidian-amber')}
                  className={`p-4 rounded-xl border text-right transition-all space-y-2 ${
                    settings.theme === 'obsidian-amber'
                      ? 'border-amber-500 bg-amber-950/30 shadow-lg shadow-amber-950/40'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">هوية العقيق والنحاس (Obsidian Amber)</span>
                    {settings.theme === 'obsidian-amber' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-stone-950 border border-stone-700" />
                    <div className="w-4 h-4 rounded-full bg-stone-900" />
                    <div className="w-4 h-4 rounded-full bg-amber-500" />
                  </div>
                  <p className="text-[11px] text-slate-400">ألوان دافئة مستوحاة من العقيق الفاخر والنحاس الدافئ.</p>
                </button>
              </div>

              {/* System System Prompt Config */}
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <label className="block font-bold text-xs text-slate-200">التعليمات العامة للنظام (System Prompt):</label>
                <textarea
                  value={settings.systemPrompt}
                  onChange={(e) => onUpdateSettings({ ...settings, systemPrompt: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Security & Access Gate */}
          {activeTab === 'security' && (
            <div className="space-y-5">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" />
                حماية الواجهة بكلمة مرور (Password Gate)
              </h3>
              <p className="text-slate-400">
                يمكنك تفعيل بوابة كلمة مرور لمنع الوصول غير المصرح به لمحادثاتك الشخصية واستضافتك.
              </p>

              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-200">حالة الحماية:</div>
                    <div className="text-[11px] text-slate-500">
                      {settings.passwordProtected ? 'مفعلة بكلمة مرور' : 'غير مفعلة (مفتوحة)'}
                    </div>
                  </div>

                  {settings.passwordProtected && (
                    <button
                      onClick={() => onUpdateSettings({ ...settings, passwordProtected: false, passwordHash: undefined })}
                      className="bg-red-900/40 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs hover:bg-red-900/60"
                    >
                      تعطيل الحماية
                    </button>
                  )}
                </div>

                {!settings.passwordProtected && (
                  <form onSubmit={handleSetPassword} className="space-y-3 pt-2 border-t border-slate-800">
                    <label className="block text-[11px] text-slate-300">حدد كلمة مرور جديدة:</label>
                    <input
                      type="password"
                      placeholder="كلمة السر..."
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors"
                    >
                      تفعيل الحماية بكلمة المرور
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Data Management */}
          {activeTab === 'data' && (
            <div className="space-y-5">
              <h3 className="font-bold text-sm text-slate-100">إدارة ومسح البيانات</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={onExportBackup}
                  className="p-4 bg-slate-950/60 border border-slate-800 hover:border-emerald-500/50 rounded-xl text-right space-y-1 transition-all"
                >
                  <div className="font-bold text-emerald-400">تصدير النسخة الاحتياطية (JSON)</div>
                  <div className="text-[11px] text-slate-400">تحميل كافة المحادثات والإعدادات في ملف واحد.</div>
                </button>

                <button
                  onClick={onImportBackup}
                  className="p-4 bg-slate-950/60 border border-slate-800 hover:border-emerald-500/50 rounded-xl text-right space-y-1 transition-all"
                >
                  <div className="font-bold text-sky-400">استيراد نسخة احتياطية</div>
                  <div className="text-[11px] text-slate-400">استرجاع محادثات سابقة من ملف JSON.</div>
                </button>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <button
                  onClick={onClearData}
                  className="w-full bg-red-950/60 border border-red-500/40 text-red-400 hover:bg-red-900/60 font-semibold py-3 rounded-xl transition-colors text-xs"
                >
                  مسح كافة المحادثات والبيانات نهائياً
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: Keyboard Shortcuts */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm text-slate-100">اختصارات لوحة المفاتيح</h3>
              <div className="divide-y divide-slate-800 bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                {APP_CONFIG.shortcuts.map((sc, i) => (
                  <div key={i} className="p-3 flex items-center justify-between">
                    <span className="text-slate-300">{sc.label}</span>
                    <kbd className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-emerald-400 font-mono dir-ltr">
                      {sc.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 text-center text-[11px] text-slate-500">
          {APP_CONFIG.name} — {APP_CONFIG.copyright} | {APP_CONFIG.officialDomain}
        </div>
      </div>
    </div>
  );
};
