import React, { useCallback, useEffect, useState } from 'react';
import { Bot, X, RefreshCw, Send, Sparkles } from 'lucide-react';
import { toast } from '../Toast';

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface AdminAssistantProps { authFetch: AuthFetch; onClose: () => void; }

export const AdminAssistant: React.FC<AdminAssistantProps> = ({ authFetch, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [logs, setLogs] = useState<Array<{ role: 'user' | 'bot'; text: string }>>([
    { role: 'bot', text: 'أهلاً بالأدمن 👋 — أستطيع تلخيص مستخدميك وحصصهم ونشاطهم. جرّب: «من أكثر مستخدم نشاطاً؟» أو اضغط اقتراحاً.' },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, qq, a] = await Promise.all([
        authFetch('/api/admin/users').then((r) => r.json()),
        authFetch('/api/admin/quotas').then((r) => r.json()),
        authFetch('/api/admin/activity/recent?limit=200').then((r) => r.json()),
      ]);
      const users = Array.isArray(u) ? u : (u.users || []);
      const quotas = Array.isArray(qq.quotas) ? qq.quotas : [];
      const activity = Array.isArray(a.activity) ? a.activity : [];
      setData({ users, quotas, activity, defaultLimit: qq.default_limit || 400 });
    } catch {
      toast.error('تعذر تحميل بيانات المساعد');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { void load(); }, [load]);

  const summarize = (text: string): string => {
    const t = (text || '').trim();
    const { users, quotas, activity, defaultLimit } = data || { users: [], quotas: [], activity: [], defaultLimit: 400 };
    const lc = t.toLowerCase();

    if (!lc) return '';
    if (/محظور|blocked/.test(lc)) {
      const blocked = users.filter((u: any) => u.status === 'blocked');
      return blocked.length ? `المحظورون (${blocked.length}): ${blocked.map((u: any) => u.email || u.username || u.id).join('، ')}` : 'لا يوجد مستخدمون محظورون حالياً. ✅';
    }
    if (/أدمن|admin/.test(lc)) {
      const admins = users.filter((u: any) => u.role === 'admin');
      return `عدد الأدمن: ${admins.length} — ${admins.map((u: any) => u.email || u.username).join('، ') || '—'}`;
    }
    if (/حصص|quota|حد/.test(lc)) {
      if (!quotas.length) return `لا توجد حصص مخصصة — الجميع يحصل على الافتراضية ${defaultLimit} رسالة/يوم.`;
      const parts = quotas.map((x: any) => `${x.email || x.user_id}: ${x.used}/${x.daily_limit}`).slice(0, 12);
      return `الحصص المخصصة:\n${parts.join('\n')}`;
    }
    if (/نشاط|نشط|active|أحدث/.test(lc)) {
      if (!activity.length) return 'لا نشاط حديث بعد.';
      const byUser = new Map<string, number>();
      activity.forEach((x: any) => { const k = x.user_email || x.user_id || '—'; byUser.set(k, (byUser.get(k) || 0) + 1); });
      const top = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return `آخر النشاط (${activity.length} حدثاً):\n${top.map(([u, c]) => `${u}: ${c}`).join('\n')}`;
    }
    if (/مستخدم|users|عدد/.test(lc)) {
      const active = users.filter((u: any) => u.status !== 'blocked').length;
      const admins = users.filter((u: any) => u.role === 'admin').length;
      return `إجمالي الحسابات: ${users.length} (نشط ${active} · أدمن ${admins}) · الحصة الافتراضية ${defaultLimit}/يوم.`;
    }
    return [
      `👥 المستخدمون: ${users.length}`,
      `🪙 حصص مخصصة: ${quotas.length}`,
      `⚡ آخر النشاط: ${activity.length} حدثاً`,
    ].join('\n');
  };

  const ask = (raw?: string) => {
    const text = (raw ?? q).trim();
    if (!text) return;
    setLogs((p) => [...p, { role: 'user', text }, { role: 'bot', text: summarize(text) || 'لا أفهم — جرّب: الحصص، المستخدمون، المحظورون، النشاط، الأدمن.' }]);
    setQ('');
  };

  const suggestions = ['عدد المستخدمين', 'المحظورون', 'من أكثر مستخدم نشاطاً؟', 'الحصص المخصصة'];

  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-white w-full max-w-xl h-[80vh] sm:h-auto sm:max-h-[80vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 bg-gradient-to-l from-emerald-600 to-teal-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-black"><Bot className="w-5 h-5" /> مساعد الأدمن الذكي</div>
          <div className="flex items-center gap-1">
            <button onClick={() => void load()} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="تحديث"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50">
          {logs.map((l, i) => (
            <div key={i} className={`max-w-[90%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${l.role === 'user' ? 'ms-auto bg-emerald-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm'}`}>
              {l.text}
            </div>
          ))}
          {loading && <div className="text-[11px] text-slate-400 px-1">…</div>}
        </div>

        <div className="px-3 pt-1 flex flex-wrap gap-1.5 bg-slate-50">
          {suggestions.map((s) => (
            <button key={s} onClick={() => ask(s)} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold hover:bg-emerald-100 transition-colors">
              {s}
            </button>
          ))}
        </div>

        <div className="px-3 py-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
            placeholder="اسأل عن مستخدميك، حصصهم، نشاطهم…"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button onClick={() => ask()} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-xs font-bold">
            <Send className="w-3.5 h-3.5" /> إرسال
          </button>
        </div>
      </div>
    </div>
  );
};
