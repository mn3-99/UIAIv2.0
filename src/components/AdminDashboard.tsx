import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, Activity, MessageSquare, Settings, Eye, Trash2, UserCheck, UserX,
  Smartphone, Monitor, Globe, Search, Database, RefreshCw, BarChart2, Cpu, CheckCircle2,
  Sparkles, Layers, Download, AlertTriangle, Clock, TrendingUp, Zap, Server,
  Lock, Unlock, FileText, PieChart, ArrowUpRight, ArrowDownRight, Wifi, WifiOff,
  Terminal, HardDrive, MemoryStick, Thermometer, BarChart, LineChart, AreaChart
} from 'lucide-react';
import { UserAccount } from '../types';
import { useModalA11y } from '../utils/useModalA11y';
import { toast } from './Toast';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
}

type DashboardTab = 'overview' | 'users' | 'analytics' | 'security' | 'system' | 'logs' | 'settings';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  active_connections: number;
  requests_per_minute: number;
  avg_response_time: number;
  error_rate: number;
}

interface ModelAnalytics {
  model_id: string;
  model_name: string;
  total_requests: number;
  total_tokens: number;
  avg_latency: number;
  error_count: number;
  success_rate: number;
  cost_estimate: number;
}

interface UserActivity {
  date: string;
  active_users: number;
  new_registrations: number;
  total_messages: number;
}

interface SecurityEvent {
  id: string;
  type: 'failed_login' | 'suspicious_activity' | 'rate_limit' | 'unauthorized_access';
  user_id?: string;
  email?: string;
  ip_address: string;
  country: string;
  timestamp: string;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface SystemLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data states
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [modelAnalytics, setModelAnalytics] = useState<ModelAnalytics[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [securityFilter, setSecurityFilter] = useState<'all' | 'failed_login' | 'suspicious_activity' | 'rate_limit'>('all');

  // Settings states
  const [siteTitle, setSiteTitle] = useState('');
  const [defaultPrompt, setDefaultPrompt] = useState('');
  const [registrationsOpen, setRegistrationsOpen] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);

  // Authenticated fetch
  const authFetch = useCallback((input: string, init: RequestInit = {}) => {
    const token = localStorage.getItem('mijlai_auth_token');
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(input, { ...init, headers });
  }, []);

  // Fetch all dashboard data
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const [healthRes, analyticsRes, usersRes, modelsRes, activityRes, securityRes, logsRes] = await Promise.all([
        authFetch('/api/admin/system/health'),
        authFetch('/api/admin/analytics'),
        authFetch('/api/admin/users'),
        authFetch('/api/admin/models/analytics'),
        authFetch('/api/admin/user/activity'),
        authFetch('/api/admin/security/events'),
        authFetch('/api/admin/system/logs')
      ]);

      if (healthRes.status === 401 || healthRes.status === 403) {
        setAuthError('صلاحيات الأدمن مطلوبة — سجّل الدخول بحساب أدمن لإدارة اللوحة.');
        return;
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setSystemHealth(healthData);
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsersList(Array.isArray(usersData) ? usersData : usersData.users || []);
      }

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        setModelAnalytics(Array.isArray(modelsData) ? modelsData : modelsData.models || []);
      }

      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setUserActivity(Array.isArray(activityData) ? activityData : activityData.activity || []);
      }

      if (securityRes.ok) {
        const securityData = await securityRes.json();
        setSecurityEvents(Array.isArray(securityData) ? securityData : securityData.events || []);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setSystemLogs(Array.isArray(logsData) ? logsData : logsData.logs || []);
      }

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      toast.error('خطأ في تحميل بيانات لوحة التحكم');
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  // Load system settings
  const loadSystemSettings = useCallback(async () => {
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
  }, [authFetch]);

  // Save system settings
  const saveSystemSettings = useCallback(async () => {
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
  }, [authFetch, siteTitle, defaultPrompt, registrationsOpen]);

  // Run DB vacuum
  const runDbVacuum = useCallback(async () => {
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
  }, [authFetch]);

  // User management functions
  const handleUpdateRoleOrStatus = useCallback(async (userId: string, role?: string, status?: string) => {
    try {
      const res = await authFetch('/api/admin/user/role_or_status', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, role, status })
      });
      if (res.ok) {
        fetchDashboardData();
        toast.success('تم تحديث المستخدم بنجاح');
      }
    } catch (err) {
      console.error('Error updating user:', err);
      toast.error('فشل تحديث المستخدم');
    }
  }, [authFetch, fetchDashboardData]);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const handleDeleteUser = useCallback(async (userId: string) => {
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
        fetchDashboardData();
      } else {
        toast.error('فشل حذف المستخدم');
      }
    } catch (err) {
      toast.error('خطأ في الاتصال أثناء الحذف');
      console.error('Error deleting user:', err);
    }
  }, [authFetch, fetchDashboardData, pendingDeleteId]);

  // Initial data load
  useEffect(() => {
    if (isOpen) {
      fetchDashboardData();
      loadSystemSettings();
    }
  }, [isOpen, fetchDashboardData, loadSystemSettings]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [isOpen, fetchDashboardData]);

  // Filter functions
  const filteredUsers = usersList.filter(u =>
    u.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.ip_address?.includes(searchQuery) ||
    u.device_info?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredLogs = systemLogs.filter(log =>
    logFilter === 'all' || log.level === logFilter
  );

  const filteredSecurityEvents = securityEvents.filter(event =>
    securityFilter === 'all' || event.type === securityFilter
  );

  // Helper functions
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-emerald-500';
      case 'degraded': return 'text-amber-500';
      case 'down': return 'text-red-500';
      default: return 'text-slate-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-lg animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="لوحة تحكم الأدمن الشاملة"
        tabIndex={-1}
        className="w-full max-w-7xl h-[94vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden relative"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black tracking-tight">لوحة تحكم الأدمن الشاملة</h2>
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 text-[11px] font-bold border border-blue-400/30">
                  MijlAi Enterprise v3.0
                </span>
                {systemHealth && (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    systemHealth.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' :
                    systemHealth.status === 'degraded' ? 'bg-amber-500/20 text-amber-300 border-amber-400/30' :
                    'bg-red-500/20 text-red-300 border-red-400/30'
                  }`}>
                    {systemHealth.status === 'healthy' ? '● نظام saludable' :
                     systemHealth.status === 'degraded' ? '● نظام مُهدَّأ' : '● نظام معطّل'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">مراقبة شاملة للمستخدمين، النظام، الأمان، والأداء</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
              <div className="text-[10px] text-slate-400">آخر تحديث</div>
              <div className="text-xs font-bold text-slate-300">{new Date().toLocaleTimeString('ar-EG')}</div>
            </div>
            <button
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white transition-all flex items-center gap-2 text-xs font-semibold border border-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors border border-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
          {authError && (
            <div className="flex-1 min-w-[240px] text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-1">
              {authError}
            </div>
          )}
          {[
            { id: 'overview', label: 'نظرة عامة', icon: Activity, color: 'from-blue-500 to-indigo-500' },
            { id: 'users', label: 'المستخدمين', icon: Users, color: 'from-emerald-500 to-teal-500' },
            { id: 'analytics', label: 'التحليلات', icon: BarChart2, color: 'from-purple-500 to-pink-500' },
            { id: 'security', label: 'الأمان', icon: Lock, color: 'from-red-500 to-orange-500' },
            { id: 'system', label: 'النظام', icon: Server, color: 'from-cyan-500 to-blue-500' },
            { id: 'logs', label: 'السجلات', icon: Terminal, color: 'from-amber-500 to-yellow-500' },
            { id: 'settings', label: 'الإعدادات', icon: Settings, color: 'from-slate-500 to-gray-600' }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as DashboardTab)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap ${
                  isActive
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-lg shadow-slate-300/30`
                    : 'bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-slate-50 to-slate-100/50">
          {/* Tab 1: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* System Health Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-bold ${getStatusColor(systemHealth?.status || 'healthy')}`}>
                      {systemHealth?.status === 'healthy' ? 'يعمل' : systemHealth?.status === 'degraded' ? 'مُهدَّأ' : 'معطّل'}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mb-1">
                    {systemHealth ? formatUptime(systemHealth.uptime) : '--'}
                  </div>
                  <div className="text-xs text-slate-500">وقت التشغيل</div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                      <Users className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <ArrowUpRight className="w-3 h-3" />
                      +12%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mb-1">
                    {analytics?.total_users || usersList.length || 0}
                  </div>
                  <div className="text-xs text-slate-500">إجمالي المستخدمين</div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <ArrowUpRight className="w-3 h-3" />
                      +8%
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mb-1">
                    {analytics?.total_messages || 0}
                  </div>
                  <div className="text-xs text-slate-500">إجمالي الرسائل</div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                      <Zap className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      {systemHealth?.requests_per_minute || 0}/دقيقة
                    </span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 mb-1">
                    {systemHealth?.avg_response_time || 0}ms
                  </div>
                  <div className="text-xs text-slate-500">متوسط وقت الاستجابة</div>
                </div>
              </div>

              {/* Model Performance Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-600" />
                  أداء النماذج الذكية
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {modelAnalytics.slice(0, 6).map((model) => (
                    <div key={model.model_id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-slate-800 truncate">{model.model_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          model.success_rate >= 95 ? 'bg-emerald-100 text-emerald-700' :
                          model.success_rate >= 80 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {model.success_rate}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="text-slate-500">الطلبات</div>
                          <div className="font-bold text-slate-800">{model.total_requests.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">التوكنز</div>
                          <div className="font-bold text-slate-800">{model.total_tokens.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-slate-500">الزمن</div>
                          <div className="font-bold text-slate-800">{model.avg_latency}ms</div>
                        </div>
                        <div>
                          <div className="text-slate-500">التكلفة</div>
                          <div className="font-bold text-slate-800">${model.cost_estimate.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* User Activity Chart (Simple Bar Representation) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  نشاط المستخدمين (آخر 7 أيام)
                </h3>
                <div className="flex items-end gap-2 h-32">
                  {userActivity.slice(-7).map((day, idx) => {
                    const maxUsers = Math.max(...userActivity.slice(-7).map(d => d.active_users), 1);
                    const height = (day.active_users / maxUsers) * 100;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-[10px] font-bold text-slate-600">{day.active_users}</div>
                        <div
                          className="w-full bg-gradient-to-t from-blue-500 to-indigo-400 rounded-t-lg transition-all duration-500"
                          style={{ height: `${height}%` }}
                        />
                        <div className="text-[10px] text-slate-500">{day.date.split('-')[2]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Users Management */}
          {activeTab === 'users' && (
            <div className="space-y-4">
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
                <div className="text-xs text-slate-500">
                  {filteredUsers.length} من {usersList.length} مستخدم
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="p-3">المستخدم والبريد</th>
                        <th className="p-3">الصلاحية</th>
                        <th className="p-3">الحالة</th>
                        <th className="p-3">IP والدولة</th>
                        <th className="p-3">الجهاز</th>
                        <th className="p-3">التسجيل</th>
                        <th className="p-3">الرسائل</th>
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
                              {user.role === 'admin' ? '🛡️ أدمن' : 'مستخدم'}
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
                            <div className="font-semibold">{user.ip_address || '--'}</div>
                            <div className="text-[10px] text-blue-600 font-bold">{user.country || '--'}</div>
                          </td>
                          <td className="p-3 text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[120px]">{user.device_info || 'Web'}</span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-400">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString('ar-EG') : '--'}
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                              {user.message_count || 0}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleUpdateRoleOrStatus(user.id, user.role === 'admin' ? 'user' : 'admin')}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                                title="تغيير الصلاحية"
                              >
                                <Shield className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleUpdateRoleOrStatus(user.id, undefined, user.status === 'blocked' ? 'active' : 'blocked')}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  user.status === 'blocked'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                }`}
                                title={user.status === 'blocked' ? 'إلغاء الحظر' : 'حظر'}
                              >
                                {user.status === 'blocked' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className={`p-1.5 rounded-lg transition-colors font-bold text-[10px] ${
                                  pendingDeleteId === user.id
                                    ? 'bg-red-600 text-white hover:bg-red-700 px-2'
                                    : 'bg-red-50 hover:bg-red-100 text-red-600'
                                }`}
                                title={pendingDeleteId === user.id ? 'اضغط للتأكيد' : 'حذف'}
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

          {/* Tab 3: Analytics */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Geographic Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="font-bold text-xs text-slate-800 mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    التوزيع الجغرافي
                  </h3>
                  <div className="space-y-3">
                    {Array.isArray(analytics?.countries) && analytics.countries.map((c: any, idx: number) => {
                      const maxCount = Math.max(...analytics.countries.map((x: any) => x.count), 1);
                      const width = (c.count / maxCount) * 100;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-800">{c.country}</span>
                            <span className="text-blue-600 font-bold">{c.count}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="font-bold text-xs text-slate-800 mb-4 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    أنظمة التشغيل
                  </h3>
                  <div className="space-y-3">
                    {Array.isArray(analytics?.os_stats) && analytics.os_stats.map((os: any, idx: number) => {
                      const maxCount = Math.max(...analytics.os_stats.map((x: any) => x.count), 1);
                      const width = (os.count / maxCount) * 100;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-800">{os.os}</span>
                            <span className="text-emerald-600 font-bold">{os.count}</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Model Usage Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-xs text-slate-800 mb-4 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-purple-600" />
                  استخدام النماذج
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {modelAnalytics.slice(0, 8).map((model) => (
                    <div key={model.model_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-500 mb-1 truncate">{model.model_name}</div>
                      <div className="text-lg font-black text-slate-900">{model.total_requests}</div>
                      <div className="text-[10px] text-slate-400">طلب</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Security */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <select
                  value={securityFilter}
                  onChange={(e) => setSecurityFilter(e.target.value as any)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="all">جميع الأحداث</option>
                  <option value="failed_login">فشل تسجيل الدخول</option>
                  <option value="suspicious_activity">نشاط مشبوه</option>
                  <option value="rate_limit">حدود الطلبات</option>
                </select>
                <span className="text-xs text-slate-500">
                  {filteredSecurityEvents.length} حدث
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="p-3">النوع</th>
                        <th className="p-3">المستخدم</th>
                        <th className="p-3">IP والدولة</th>
                        <th className="p-3">التفاصيل</th>
                        <th className="p-3">الخطورة</th>
                        <th className="p-3">الوقت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSecurityEvents.map((event) => (
                        <tr key={event.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-bold text-[10px]">
                              {event.type === 'failed_login' ? 'فشل دخول' :
                               event.type === 'suspicious_activity' ? 'نشاط مشبوه' :
                               event.type === 'rate_limit' ? 'حدود الطلبات' : 'وصول غير مصرح'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-800">{event.email || event.user_id || 'غير معروف'}</td>
                          <td className="p-3 text-slate-600">
                            <div>{event.ip_address}</div>
                            <div className="text-[10px] text-slate-400">{event.country}</div>
                          </td>
                          <td className="p-3 text-slate-500 max-w-[200px] truncate">{event.details}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getSeverityColor(event.severity)}`}>
                              {event.severity === 'critical' ? 'حرج' :
                               event.severity === 'high' ? 'عالي' :
                               event.severity === 'medium' ? 'متوسط' : 'منخفض'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400">
                            {new Date(event.timestamp).toLocaleString('ar-EG')}
                          </td>
                        </tr>
                      ))}
                      {filteredSecurityEvents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center p-6 text-slate-400 text-xs">
                            لا توجد أحداث أمان مسجلة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: System Health */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">المعالج</div>
                      <div className="text-lg font-black text-slate-900">{systemHealth?.cpu_usage || 0}%</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (systemHealth?.cpu_usage || 0) > 80 ? 'bg-red-500' :
                        (systemHealth?.cpu_usage || 0) > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${systemHealth?.cpu_usage || 0}%` }}
                    />
                  </div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white">
                      <MemoryStick className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">الذاكرة</div>
                      <div className="text-lg font-black text-slate-900">{systemHealth?.memory_usage || 0}%</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (systemHealth?.memory_usage || 0) > 80 ? 'bg-red-500' :
                        (systemHealth?.memory_usage || 0) > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${systemHealth?.memory_usage || 0}%` }}
                    />
                  </div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white">
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">القرص</div>
                      <div className="text-lg font-black text-slate-900">{systemHealth?.disk_usage || 0}%</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (systemHealth?.disk_usage || 0) > 90 ? 'bg-red-500' :
                        (systemHealth?.disk_usage || 0) > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${systemHealth?.disk_usage || 0}%` }}
                    />
                  </div>
                </div>

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
                      <Wifi className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">الاتصالات</div>
                      <div className="text-lg font-black text-slate-900">{systemHealth?.active_connections || 0}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400">اتصال نشط</div>
                </div>
              </div>

              {/* Error Rate */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-xs text-slate-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  معدل الأخطاء
                </h3>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-black text-slate-900">
                    {systemHealth?.error_rate || 0}%
                  </div>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        (systemHealth?.error_rate || 0) > 5 ? 'bg-red-500' :
                        (systemHealth?.error_rate || 0) > 2 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min((systemHealth?.error_rate || 0) * 10, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Logs */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value as any)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">جميع السجلات</option>
                  <option value="info">معلومات</option>
                  <option value="warn">تحذيرات</option>
                  <option value="error">أخطاء</option>
                </select>
                <span className="text-xs text-slate-500">
                  {filteredLogs.length} سجل
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-right text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200 text-slate-600 font-bold">
                        <th className="p-3">المستوى</th>
                        <th className="p-3">المصدر</th>
                        <th className="p-3">الرسالة</th>
                        <th className="p-3">الوقت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.level === 'error' ? 'bg-red-100 text-red-700' :
                              log.level === 'warn' ? 'bg-amber-100 text-amber-700' :
                              log.level === 'debug' ? 'bg-slate-100 text-slate-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {log.level.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-800">{log.source}</td>
                          <td className="p-3 text-slate-600 max-w-[400px] truncate">{log.message}</td>
                          <td className="p-3 text-slate-400">
                            {new Date(log.timestamp).toLocaleString('ar-EG')}
                          </td>
                        </tr>
                      ))}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center p-6 text-slate-400 text-xs">
                            لا توجد سجلات
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 7: Settings */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 border-b pb-3 mb-4 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-600" />
                  إعدادات النظام
                </h3>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">اسم الموقع</label>
                    <input
                      type="text"
                      value={siteTitle}
                      onChange={(e) => setSiteTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">التعليمات الافتراضية</label>
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
                      <div className="text-[11px] text-slate-500">فتح أو إغلاق التسجيل</div>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
