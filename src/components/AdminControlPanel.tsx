import React, { useState, useEffect } from 'react';
import {
  Users, Activity, MessageSquare, Shield, RefreshCw, BarChart2,
  Globe, Smartphone, Monitor, Search, Eye, Trash2, UserCheck, UserX,
  Layers, Database, Sparkles, Filter, ChevronDown
} from 'lucide-react';

export interface UserMetric {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'blocked';
  ip_address?: string;
  country?: string;
  device_info?: string;
  os?: string;
  browser?: string;
  created_at?: string;
  message_count?: number;
}

export interface TelemetryLog {
  user_id?: string;
  email?: string;
  action: string;
  ip_address?: string;
  country?: string;
  device_info?: string;
  os?: string;
  timestamp: string;
}

export const AdminControlPanel: React.FC = () => {
  const [users, setUsers] = useState<UserMetric[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'metrics' | 'telemetry' | 'chats'>('metrics');
  
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);

  // All admin API calls carry the JWT — the FastAPI admin routes reject
  // unauthenticated requests with 401/403.
  const authFetch = (input: string, init: RequestInit = {}) => {
    const token = localStorage.getItem('mijlai_auth_token');
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(input, { ...init, headers });
  };

  const fetchAdminMetrics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [analyticsRes, usersRes] = await Promise.all([
        authFetch('/api/admin/analytics'),
        authFetch('/api/admin/users')
      ]);

      if (!analyticsRes.ok || !usersRes.ok) {
        throw new Error('فشل جلب بيانات الإدارة من خادم Backend');
      }

      const analyticsText = await analyticsRes.text();
      const usersText = await usersRes.text();

      try {
        const parsedAnalytics = JSON.parse(analyticsText);
        setAnalytics(parsedAnalytics || {});
      } catch (e) {}

      try {
        const parsedUsers = JSON.parse(usersText);
        if (Array.isArray(parsedUsers)) {
          setUsers(parsedUsers);
        } else if (parsedUsers && Array.isArray(parsedUsers.users)) {
          setUsers(parsedUsers.users);
        } else {
          setUsers([]);
        }
      } catch (e) {}

    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تحميل سجلات المستخدمين');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminMetrics();
  }, []);

  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const res = await authFetch('/api/admin/user/role_or_status', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, role: newRole })
      });
      if (res.ok) fetchAdminMetrics();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
    try {
      const res = await authFetch('/api/admin/user/role_or_status', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, status: newStatus })
      });
      if (res.ok) fetchAdminMetrics();
    } catch (err) {
      console.error(err);
    }
  };

  // Two-step inline confirm: first click arms for 3s, second click executes.
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
      if (res.ok) fetchAdminMetrics();
    } catch (err) {
      console.error(err);
    }
  };

  const handleInspectChat = async (chat: any) => {
    setSelectedChat(chat);
    try {
      const res = await authFetch(`/api/admin/chat_messages/${chat.chat_id}`);
      if (res.ok) {
        const text = await res.text();
        try {
          const parsedMsgs = JSON.parse(text);
          setChatMessages(Array.isArray(parsedMsgs) ? parsedMsgs : []);
        } catch (e) {}
      }
    } catch (err) {
      console.error(err);
    }
  };

  const safeUsers = Array.isArray(users) ? users : [];
  const filteredUsers = safeUsers.filter(u =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.ip_address?.includes(searchQuery) ||
    u.device_info?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.country?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800 rounded-3xl overflow-hidden border border-slate-200/90 shadow-xl font-sans">
      
      {/* Control Panel Header */}
      <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">لوحة تحكم ومراقبة المستخدمين (Admin Metrics)</h2>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-400/30">
                Live Open WebUI Telemetry
              </span>
            </div>
            <p className="text-xs text-slate-400">مراقبة مقاييس الأجهزة، الموقع الجغرافي، وسجلات الرسائل المباشرة</p>
          </div>
        </div>

        <button
          onClick={fetchAdminMetrics}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition-all border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>تحديث البيانات</span>
        </button>
      </div>

      {/* Top Metric Cards Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-white border-b border-slate-200/80">
        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>المستخدمين المسجلين</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{analytics?.total_users || users.length || 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">حسابات نشطة ببيانات موثوقة</div>
        </div>

        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>إجمالي المحادثات</span>
            <MessageSquare className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{analytics?.total_chats || 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">سلسلة استعلامات نشطة</div>
        </div>

        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>الرسائل والاستعلامات</span>
            <BarChart2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{analytics?.total_messages || 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">معالجات الذكاء الاصطناعي</div>
        </div>

        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/60">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>سجلات Telemetry</span>
            <Activity className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{analytics?.total_logs || 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">أحداث الجلسات والأجهزة</div>
        </div>
      </div>

      {/* Sub-Tabs Selector */}
      <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('metrics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'metrics'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>جدول مقاييس المستخدمين والأجهزة</span>
          </button>

          <button
            onClick={() => setActiveSubTab('telemetry')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'telemetry'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>سجلات الأجهزة والتوزيع الجغرافي</span>
          </button>

          <button
            onClick={() => setActiveSubTab('chats')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeSubTab === 'chats'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>رصد المحادثات والرسائل الحية</span>
          </button>
        </div>

        {/* Live Search Input */}
        <div className="relative w-64">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="تصفية بالحساب، الجهاز، IP أو الدولة..."
            className="w-full pr-9 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs font-bold text-center">
            {error}
          </div>
        )}

        {/* 1. Main User Metrics Table */}
        {activeSubTab === 'metrics' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold border-b border-slate-800">
                    <th className="p-3.5">المستخدم والبريد</th>
                    <th className="p-3.5">الصلاحية (Role)</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5">عنوان IP والدولة</th>
                    <th className="p-3.5">نوع الجهاز والمكشوف</th>
                    <th className="p-3.5">تاريخ التسجيل</th>
                    <th className="p-3.5 text-center">التحكم والإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{u.username}</div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          u.role === 'admin'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {u.role === 'admin' ? '🛡️ أدمن مسئول' : 'مستخدم عادي'}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {u.status === 'blocked' ? 'محظور' : 'نشط'}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-700">
                        <div className="font-semibold">{u.ip_address || '127.0.0.1'}</div>
                        <div className="text-[10px] text-blue-600 font-bold">{u.country || 'Palestine'}</div>
                      </td>
                      <td className="p-3.5 text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{u.device_info || u.os || 'Web Browser'}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-400">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : 'اليوم'}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleToggleUserRole(u.id, u.role)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="تغيير الصلاحية"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleUserStatus(u.id, u.status)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.status === 'blocked' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}
                            title={u.status === 'blocked' ? 'إلغاء الحظر' : 'حظر الحساب'}
                          >
                            {u.status === 'blocked' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className={`p-1.5 rounded-lg transition-colors font-bold text-[10px] ${
                              pendingDeleteId === u.id
                                ? 'bg-red-600 text-white hover:bg-red-700 px-2'
                                : 'bg-red-50 hover:bg-red-100 text-red-600'
                            }`}
                            title={pendingDeleteId === u.id ? 'اضغط مجدداً للتأكيد' : 'حذف الحساب'}
                          >
                            {pendingDeleteId === u.id ? 'تأكيد؟' : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center p-6 text-slate-400 text-xs">
                        لا توجد سجلات مستخدمين طابقة لمعايير البحث
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Device Types & Geographic Locations Breakdown */}
        {activeSubTab === 'telemetry' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Geographic Locations */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
                <h3 className="font-bold text-xs text-slate-800 mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>مواقع المستخدمين الجغرافية (Geographic Locations)</span>
                </h3>
                <div className="space-y-2">
                  {Array.isArray(analytics?.countries) && analytics.countries.map((c: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs font-semibold">
                      <span className="text-slate-800">{c.country}</span>
                      <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-bold">{c.count} زيارات</span>
                    </div>
                  ))}
                  {(!Array.isArray(analytics?.countries) || analytics.countries.length === 0) && (
                    <div className="text-xs text-slate-400">لا توجد سجلات جغرافية حالياً</div>
                  )}
                </div>
              </div>

              {/* Connected Device Types */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
                <h3 className="font-bold text-xs text-slate-800 mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>أنواع الأجهزة والمتصفحات (Device Types & OS)</span>
                </h3>
                <div className="space-y-2">
                  {Array.isArray(analytics?.os_stats) && analytics.os_stats.map((os: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs font-semibold">
                      <span className="text-slate-800">{os.os}</span>
                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">{os.count} أجهزة</span>
                    </div>
                  ))}
                  {(!Array.isArray(analytics?.os_stats) || analytics.os_stats.length === 0) && (
                    <div className="text-xs text-slate-400">لا توجد سجلات أجهزة حالياً</div>
                  )}
                </div>
              </div>
            </div>

            {/* Live Telemetry Stream */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h3 className="font-bold text-xs text-slate-800 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                <span>سجل الأحداث والاستعلامات الحية (Live Message Logs Stream)</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b">
                      <th className="p-2.5">المستخدم</th>
                      <th className="p-2.5">الحدث</th>
                      <th className="p-2.5">IP والجغرافيا</th>
                      <th className="p-2.5">الجهاز والنظام</th>
                      <th className="p-2.5">الوقت والتاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Array.isArray(analytics?.recent_logs) && analytics.recent_logs.map((log: TelemetryLog, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 font-bold text-slate-900">{log.email || 'guest@mijlai.com'}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                            {log.action}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{log.ip_address} ({log.country})</td>
                        <td className="p-2.5 text-slate-500">{log.os} / {log.device_info}</td>
                        <td className="p-2.5 text-slate-400">{new Date(log.timestamp).toLocaleString('ar-EG')}</td>
                      </tr>
                    ))}
                    {(!Array.isArray(analytics?.recent_logs) || analytics.recent_logs.length === 0) && (
                      <tr>
                        <td colSpan={5} className="text-center p-4 text-slate-400">لا توجد سجلات نشاط حية حالياً</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. Live Chat Messages Inspection */}
        {activeSubTab === 'chats' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>سجل المحادثات النشطة</span>
              </h3>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {Array.isArray(analytics?.recent_chats) && analytics.recent_chats.map((chat: any) => (
                  <div
                    key={chat.chat_id}
                    onClick={() => handleInspectChat(chat)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedChat?.chat_id === chat.chat_id
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 line-clamp-1">{chat.title || 'محادثة'}</div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span>{chat.email}</span>
                      <span className="font-bold text-blue-600">{chat.message_count} رسائل</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs h-[60vh] flex flex-col">
              {selectedChat ? (
                <>
                  <div className="pb-3 border-b mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{selectedChat.title}</h4>
                      <p className="text-[11px] text-slate-500">{selectedChat.email} | ID: {selectedChat.chat_id}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                      {selectedChat.model_used}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-50 rounded-xl border">
                    {Array.isArray(chatMessages) && chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                          msg.sender_role === 'user'
                            ? 'bg-blue-600 text-white mr-auto'
                            : 'bg-white border text-slate-800 ml-auto'
                        }`}
                      >
                        <div className="font-bold text-[10px] mb-1 opacity-80">
                          {msg.sender_role === 'user' ? 'سؤال المستخدم:' : 'رد MijlAI:'}
                        </div>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                  اختر أي محادثة لعرض تفاصيل رسائلها
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
