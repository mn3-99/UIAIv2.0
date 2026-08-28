import React, { useState, useEffect } from 'react';
import {
  X, Users, Activity, MessageSquare, Shield, Settings, Eye, Trash2, UserCheck, UserX,
  Smartphone, Monitor, Globe, Search, Database, RefreshCw, BarChart2, Cpu, CheckCircle2,
  Sparkles, Layers, Download
} from 'lucide-react';
import { UserAccount } from '../types';
import { AdminControlPanel } from './AdminControlPanel';
import { useModalA11y } from '../utils/useModalA11y';
import { toast } from './Toast';

interface AdminControlPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
}

export const AdminControlPanelModal: React.FC<AdminControlPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'chats' | 'benchmark' | 'settings'>('overview');
  const [analytics, setAnalytics] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [selectedChatMessages, setSelectedChatMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // System settings state (persisted server-side in system_settings table)
  const [siteTitle, setSiteTitle] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [registrationsOpen, setRegistrationsOpen] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);

  const loadSystemSettings = async () => {
    try {
      const res = await authFetch('/api/admin/settings');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const s = data.settings || {};
      setSiteTitle(s.site_title ?? 'MijlAi Workspace & Intelligence Engine');
      setDefaultPrompt(s.default_system_prompt ?? '');
      setRegistrationsOpen(String(s.allow_registrations ?? 'true') === 'true');
      setSettingsLoaded(true);
    } catch {
      toast.error('تعذر تحميل إعدادات النظام');
    }
  };

  const saveSystemSettings = async () => {
    setSettingsSaving(true);
    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify({
          settings: {
            site_title: siteTitle,
            default_system_prompt: defaultPrompt,
            allow_registrations: String(registrationsOpen)
          }
        })
      });
      if (!res.ok) throw new Error();
      toast.success('تم حفظ إعدادات النظام في قاعدة البيانات ✓');
    } catch {
      toast.error('فشل حفظ الإعدادات — تحقق من صلاحيات الأدمن');
    } finally {
      setSettingsSaving(false);
    }
  };

  const runDbVacuum = async () => {
    setVacuuming(true);
    try {
      const res = await authFetch('/api/admin/db/vacuum', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'فشل');
      toast.success(`تمت صيانة قاعدة البيانات بنجاح — الحجم الحالي ${data.size_kb}KB`);
    } catch (e: any) {
      toast.error(`فشلت الصيانة: ${e.message || 'خطأ غير معروف'}`);
    } finally {
      setVacuuming(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAdminData();
      loadSystemSettings();
    }
  }, [isOpen]);

  // Authenticated fetch — admin endpoints require the JWT from login
  const authFetch = (input: string, init: RequestInit = {}) => {
    const token = localStorage.getItem('mijlai_auth_token');
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(input, { ...init, headers });
  };

  const fetchAdminData = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const [analyticsRes, usersRes] = await Promise.all([
        authFetch('/api/admin/analytics'),
        authFetch('/api/admin/users')
      ]);

      if (analyticsRes.ok) {
        const text = await analyticsRes.text();
        try { setAnalytics(JSON.parse(text)); } catch (e) {}
      } else if (analyticsRes.status === 401 || analyticsRes.status === 403) {
        setAuthError('صلاحيات الأدمن مطلوبة — سجّل الدخول بحساب أدمن لإدارة اللوحة.');
      }
      if (usersRes.ok) {
        const text = await usersRes.text();
        try { setUsersList(JSON.parse(text)); } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRoleOrStatus = async (userId: string, role?: string, status?: string) => {
    try {
      const res = await authFetch('/api/admin/user/role_or_status', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, role, status })
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (err) {
      console.error('Error updating user:', err);
    }
  };

  // Two-step inline confirm (no blocking window.confirm): first click arms the
  // button for 3s, second click executes the deletion.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const handleDeleteUser = async (userId: string) => {
    if (pendingDeleteId !== userId) {
      setPendingDeleteId(userId);
      setTimeout(() => setPendingDeleteId((cur) => (cur === userId ? null : cur)), 3000);
      return;
    }
    setPendingDeleteId(null);
    try {
      const res = await authFetch(`/api/admin/user/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('تم حذف المستخدم نهائياً');
        fetchAdminData();
      } else {
        toast.error('فشل حذف المستخدم');
      }
    } catch (err) {
      toast.error('خطأ في الاتصال أثناء الحذف');
      console.error('Error deleting user:', err);
    }
  };

  const handleViewChatMessages = async (chat: any) => {
    setSelectedChat(chat);
    try {
      const res = await authFetch(`/api/admin/chat_messages/${chat.chat_id}`);
      if (res.ok) {
        const text = await res.text();
        try {
          const msgs = JSON.parse(text);
          setSelectedChatMessages(msgs);
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching chat msgs:', err);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = usersList.filter(u =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.ip_address?.includes(searchQuery) ||
    u.device_info?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="لوحة تحكم المشرف" tabIndex={-1} className="w-full max-w-6xl h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">لوحة تحكم الأدمن والرقابة (Open WebUI)</h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-400/30">
                  MijlAi Enterprise v2.5
                </span>
              </div>
              <p className="text-xs text-slate-400">مراقبة المستخدمين، الأجهزة، تحليلات النظام والمحادثات الحية</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAdminData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="تحديث البيانات المباشرة"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث البيانات</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
          {authError && (
            <div className="flex-1 min-w-[240px] text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-1">
              {authError}
            </div>
          )}
          {[
            { id: 'overview', label: 'التحليلات والمراقبة', icon: Activity },
            { id: 'users', label: 'إدارة المستخدمين', icon: Users },
            { id: 'chats', label: 'رصد المحادثات والرسائل', icon: MessageSquare },
            { id: 'benchmark', label: 'مقارنة المنافسين', icon: Layers },
            { id: 'settings', label: 'إعدادات النظام', icon: Settings }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Overview & Telemetry Analytics */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {activeTab === 'overview' && (
            <AdminControlPanel />
          )}

          {/* Tab 2: User Management */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              
              {/* Search input */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="البحث باسم المستخدم، البريد، عنوان IP، أو نوع الجهاز..."
                    className="w-full pr-9 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="p-3">اسم المستخدم والبريد</th>
                        <th className="p-3">الصلاحية (Role)</th>
                        <th className="p-3">الحالة</th>
                        <th className="p-3">عنوان IP والدولة</th>
                        <th className="p-3">الجهاز المتصل</th>
                        <th className="p-3">تاريخ الإنشاء</th>
                        <th className="p-3 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{user.username}</div>
                            <div className="text-[11px] text-slate-500">{user.email}</div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              user.role === 'admin'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300/60'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {user.role === 'admin' ? '🛡️ أدمن مسئول' : 'مستخدم عادي'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              user.status === 'blocked'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {user.status === 'blocked' ? 'محظور' : 'نشط'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">
                            <div>{user.ip_address}</div>
                            <div className="text-[10px] text-slate-400">{user.country}</div>
                          </td>
                          <td className="p-3 text-slate-500">{user.device_info}</td>
                          <td className="p-3 text-slate-400">{new Date(user.created_at).toLocaleDateString('ar-EG')}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              {/* Toggle Role */}
                              <button
                                onClick={() => handleUpdateRoleOrStatus(user.id, user.role === 'admin' ? 'user' : 'admin')}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                title={user.role === 'admin' ? 'تحويل لمستخدم عادي' : 'ترقية لأدمن'}
                              >
                                <Shield className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Status Block */}
                              <button
                                onClick={() => handleUpdateRoleOrStatus(user.id, undefined, user.status === 'blocked' ? 'active' : 'blocked')}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  user.status === 'blocked'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                }`}
                                title={user.status === 'blocked' ? 'إلغاء الحظر' : 'حظر المستخدم'}
                              >
                                {user.status === 'blocked' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                              </button>

                              {/* Delete User — two-step confirm (click once to arm, again to execute) */}
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className={`p-1.5 rounded-lg transition-colors font-bold text-[10px] ${
                                  pendingDeleteId === user.id
                                    ? 'bg-red-600 text-white hover:bg-red-700 px-2'
                                    : 'bg-red-50 hover:bg-red-100 text-red-600'
                                }`}
                                title={pendingDeleteId === user.id ? 'اضغط مجدداً للتأكيد' : 'حذف الحساب'}
                              >
                                {pendingDeleteId === user.id ? 'تأكيد؟' : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Chat Monitoring & Messages Inspection */}
          {activeTab === 'chats' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Chat List */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <span>سجل المحادثات النشطة بالمشروع</span>
                </h3>

                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {analytics?.recent_chats?.map((chat: any) => (
                    <div
                      key={chat.chat_id}
                      onClick={() => handleViewChatMessages(chat)}
                      className={`p-3 rounded-xl border text-right cursor-pointer transition-all ${
                        selectedChat?.chat_id === chat.chat_id
                          ? 'bg-blue-50 border-blue-300 shadow-2xs'
                          : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200/60'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-800 line-clamp-1">{chat.title || 'محادثة جديدة'}</div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>{chat.email}</span>
                        <span className="font-semibold text-blue-600">{chat.message_count} رسائل</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        النموذج: {chat.model_used} | {new Date(chat.updated_at).toLocaleTimeString('ar-EG')}
                      </div>
                    </div>
                  )) || <div className="text-xs text-slate-400">لا توجد محادثات مسجلة بعد</div>}
                </div>
              </div>

              {/* Chat Messages Inspector */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col h-[65vh]">
                {selectedChat ? (
                  <>
                    <div className="pb-3 border-b border-slate-100 mb-3 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-xs text-slate-800">{selectedChat.title}</h4>
                        <p className="text-[11px] text-slate-500">المستخدم: {selectedChat.email} | معرّف المحادثة: {selectedChat.chat_id}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px]">
                        {selectedChat.model_used}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 p-2 bg-slate-50/50 rounded-xl border border-slate-100">
                      {selectedChatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                            msg.sender_role === 'user'
                              ? 'bg-blue-600 text-white mr-auto'
                              : 'bg-white border border-slate-200 text-slate-800 ml-auto'
                          }`}
                        >
                          <div className="font-bold text-[10px] mb-1 opacity-80">
                            {msg.sender_role === 'user' ? 'سؤال المستخدم:' : 'رد MijlAI:'}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          <div className="text-[9px] opacity-60 mt-1 text-left">{new Date(msg.timestamp).toLocaleTimeString('ar-EG')}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
                    <Eye className="w-8 h-8 mb-2 opacity-50" />
                    <span>حدد أي محادثة من القائمة لعرض كامل الاستعلامات والردود</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Competitive Benchmark Matrix */}
          {activeTab === 'benchmark' && (
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-blue-900 to-slate-900 text-white rounded-2xl shadow-sm">
                <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>مصفوفة تحليل ومقارنة قمم تطبيقات الذكاء الاصطناعي (Android & Web)</span>
                </h3>
                <p className="text-xs text-slate-300">
                  تحليل متكامل لإضافات ومميزات كل تطبيق مقارنةً بنظام MijlAi المطور
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white font-bold border-b border-slate-800">
                        <th className="p-3">التطبيق / النموذج</th>
                        <th className="p-3">أبرز المميزات في أندرويد</th>
                        <th className="p-3">الإضافات الخاصة</th>
                        <th className="p-3">الاستجابة والسرعة</th>
                        <th className="p-3">الوضع في MijlAi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {[
                        { name: 'Gemini (Google)', feats: 'Live Audio Chat, Camera Vision, Workspace Integration', extras: 'Extensions, Imagen 3, Multi-modal', speed: 'فائقة جداً', mijlai: 'مدعوم بالكامل + Flash 2.5 ⚡' },
                        { name: 'ChatGPT (OpenAI)', feats: 'Advanced Voice Mode, Custom GPTs, Memory', extras: 'o3-mini reasoning, DALL-E 3', speed: 'عالية', mijlai: 'مدعوم GPT-4o & o3-mini 🧠' },
                        { name: 'MijlAI (Anthropic)', feats: 'Artifacts side-panel, Document Analysis', extras: 'MijlAI 3.7 Sonnet reasoning', speed: 'ممتازة', mijlai: 'مدعوم MijlAI 3.7 Sonnet ✨' },
                        { name: 'Grok (xAI)', feats: 'Real-time X data, Fun/Uncensored mode', extras: 'Flux image gen, X search', speed: 'سريعة', mijlai: 'مدعوم عبر النماذج المتشعبة 🚀' },
                        { name: 'Kimi (Moonshot)', feats: 'Long-context document analysis', extras: '2M tokens context, web search', speed: 'متوسطة', mijlai: 'مدعوم Kimi K3 📝' },
                        { name: 'DeepSeek R1', feats: 'Chain-of-thought reasoning logic', extras: 'Open reasoning model', speed: 'عالية', mijlai: 'مدعوم DeepSeek R1 💡' }
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-slate-900">{row.name}</td>
                          <td className="p-3">{row.feats}</td>
                          <td className="p-3 text-slate-500">{row.extras}</td>
                          <td className="p-3 font-semibold text-emerald-600">{row.speed}</td>
                          <td className="p-3">
                            <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold border border-blue-200/60">
                              {row.mijlai}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: System Settings */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-800 border-b pb-3 flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-600" />
                <span>إعدادات النظام والخيارات البرمجية</span>
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم الموقع والتطبيق</label>
                  <input
                    type="text"
                    value={siteTitle}
                    onChange={(e) => setSiteTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">التعليمات الافتراضية للنظام (Default System Prompt)</label>
                  <textarea
                    rows={4}
                    value={defaultPrompt}
                    onChange={(e) => setDefaultPrompt(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border">
                  <div>
                    <div className="font-bold text-slate-800">السماح بتسجيل مستخدمين جدد</div>
                    <div className="text-[11px] text-slate-500">فتح التسجيل للعموم أو إغلاقه بدعوات فقط</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={registrationsOpen}
                    onChange={(e) => setRegistrationsOpen(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                <div className="pt-4 border-t flex justify-between">
                  <button
                    onClick={saveSystemSettings}
                    disabled={settingsSaving || !settingsLoaded}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold shadow-sm transition-all"
                  >
                    {settingsSaving ? 'جاري الحفظ…' : 'حفظ التغييرات'}
                  </button>

                  <button
                    onClick={runDbVacuum}
                    disabled={vacuuming}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold transition-all flex items-center gap-1.5"
                  >
                    <Database className="w-4 h-4 text-slate-500" />
                    <span>{vacuuming ? 'جاري الصيانة…' : 'ضغط وتنظيف DB'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
