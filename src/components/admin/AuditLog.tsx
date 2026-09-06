import React, { useEffect, useState, useCallback } from 'react';
import { FileText, RefreshCw, Search } from 'lucide-react';
import { toast } from '../Toast';

interface AuditEvent {
  id: number;
  admin_user_id?: string;
  admin_email?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  detail?: string;
  ip_address?: string;
  created_at: string;
}

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

export const AuditLog: React.FC<{ authFetch: AuthFetch }> = ({ authFetch }) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/audit?limit=300');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      toast.error('تعذر تحميل سجل التدقيق');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { void load(); }, [load]);

  const filtered = events.filter((e) =>
    !query || `${e.action} ${e.admin_email} ${e.target_type} ${e.target_id} ${e.detail}`
      .toLowerCase().includes(query.toLowerCase())
  );

  const actionLabel = (a: string) =>
    ({ 'user.role_or_status': 'تغيير صلاحية/حالة', 'user.delete': 'حذف مستخدم',
       'chat.delete': 'حذف محادثة', 'system.settings': 'تعديل إعدادات',
       'system.db.vacuum': 'صيانة قاعدة البيانات', 'system.backup': 'نسخة احتياطية',
       'memory.fact.delete': 'حذف ذكرى', 'rag.document.delete': 'حذف مستند RAG' } as Record<string, string>)[a] || a;

  const doSearch = async () => {
    if (!searchQ.trim() || searchQ.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await authFetch(`/api/admin/search?q=${encodeURIComponent(searchQ.trim())}&limit=60`);
      if (!res.ok) throw new Error();
      const j = await res.json();
      setSearchResults(Array.isArray(j.results) ? j.results : []);
    } catch {
      toast.error('فشل البحث');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <FileText className="w-4 h-4 text-indigo-600" />
          سجلّ إجراءات الأدمن (Audit Trail)
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-2.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="تصفية حسب الإجراء/المستهدف..."
              className="w-full ps-8 pe-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-l from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setSearchResults(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void doSearch(); }}
            placeholder="بحث شامل في كل محادثات كل المستخدمين (طبّق Enter)…"
            className="flex-1 min-w-[200px] px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={() => void doSearch()}
            disabled={searching || searchQ.trim().length < 2}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" /> {searching ? 'جارٍ البحث…' : 'بحث شامل'}
          </button>
        </div>
        {searchResults !== null && (
          <div className="bg-white/80 rounded-xl border border-indigo-100 max-h-60 overflow-y-auto">
            {searchResults.length === 0 && <p className="p-3 text-[11px] text-slate-400">لا نتائج.</p>}
            {searchResults.map((r: any, i: number) => (
              <div key={i} className="px-3 py-2 border-b border-slate-100 last:border-0 text-[11px]">
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="font-bold text-indigo-600">{r.user_email || r.user_id || '—'}</span>
                  <span className="text-slate-400">{r.sender_role === 'user' ? 'مستخدم' : 'MijlAi'}</span>
                  <code className="text-[9px] bg-slate-100 px-1 rounded">{String(r.chat_id || '').slice(0, 24)}</code>
                </div>
                <p className="text-slate-700 mt-0.5 break-words">{String(r.content || '').slice(0, 400)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[62vh] overflow-y-auto">
          <table className="w-full text-start text-xs">
            <thead className="sticky top-0">
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                <th className="p-3">الوقت</th>
                <th className="p-3">الإجراء</th>
                <th className="p-3">المستهدف</th>
                <th className="p-3">الأدمن</th>
                <th className="p-3">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={5} className="p-6 text-center text-slate-400">جاري التحميل…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">لا توجد إجراءات مسجلة</td></tr>}
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/80">
                  <td className="p-3 text-slate-400 whitespace-nowrap">
                    {e.created_at ? new Date(String(e.created_at).replace(' ', 'T')).toLocaleString('ar-EG') : '--'}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold">{actionLabel(e.action)}</span>
                  </td>
                  <td className="p-3 text-slate-600">{e.target_type || '—'} {e.target_id ? <code className="text-[10px] bg-slate-100 px-1 rounded">{e.target_id}</code> : ''}</td>
                  <td className="p-3 text-slate-500">{e.admin_email || e.admin_user_id || '—'}</td>
                  <td className="p-3 text-slate-600 max-w-[280px] truncate" title={e.detail}>{e.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
