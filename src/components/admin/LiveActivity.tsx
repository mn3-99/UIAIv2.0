import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Radio, Pause, Play } from 'lucide-react';
import { toast } from '../Toast';

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface Activity {
  chat_id?: string;
  user_id?: string;
  user_email?: string | null;
  sender_role?: string;
  content?: string;
  model_id?: string;
  timestamp?: string;
}

export const LiveActivity: React.FC<{ authFetch: AuthFetch }> = ({ authFetch }) => {
  const [items, setItems] = useState<Activity[]>([]);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState(false);
  const timer = useRef<any>(null);

  const load = useCallback(async (highlight = false) => {
    try {
      const res = await authFetch('/api/admin/activity/recent?limit=40');
      if (!res.ok) throw new Error();
      const j = await res.json();
      const list: Activity[] = Array.isArray(j.activity) ? j.activity : [];
      setItems((prev) => {
        const next = highlight && prev.length
          ? [...list.filter((n) => n.timestamp && n.timestamp !== prev[0].timestamp), ...prev].slice(0, 60)
          : list;
        return next;
      });
      if (highlight) setLive(true);
      setTimeout(() => setLive(false), 1200);
    } catch { /* silent on polling */ }
  }, [authFetch]);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => { if (!paused) void load(true); }, 6000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load, paused]);

  const modelName = (m?: string) => (m || '').replace(/^direct:/, '').replace(/_/g, ' ').slice(0, 22);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${paused ? 'bg-slate-300' : 'bg-emerald-400 animate-ping opacity-75'}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${paused ? 'bg-slate-400' : 'bg-emerald-500'}`} />
          </span>
          نشاط مباشر — أحدث طلبات المستخدمين (تحديث كل 6 ثوانٍ)
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all flex items-center gap-1.5 text-xs font-semibold"
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? 'استئناف' : 'إيقاف'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
        <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100">
          {items.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">لا نشاط بعد…</div>}
          {items.map((a, i) => (
            <div key={i} className={`px-4 py-2.5 flex items-start gap-3 ${i === 0 && live ? 'bg-emerald-50/60' : ''} hover:bg-slate-50/70 transition-colors`}>
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${a.sender_role === 'user' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-bold text-slate-700">{a.user_email || a.user_id || '—'}</span>
                  <span className="text-slate-400">{a.sender_role === 'user' ? 'مستخدم' : 'MijlAi'}</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold" dir="ltr">{modelName(a.model_id)}</span>
                  {a.timestamp && <span className="ms-auto text-slate-400">{new Date(String(a.timestamp).replace(' ', 'T')).toLocaleTimeString('ar-EG')}</span>}
                </div>
                <p className="text-xs text-slate-600 mt-0.5 break-words line-clamp-2">{String(a.content || '').slice(0, 300)}</p>
              </div>
              {a.chat_id && <code className="text-[9px] bg-slate-100 px-1 rounded text-slate-400 shrink-0 mt-1" dir="ltr">{String(a.chat_id).slice(0, 20)}</code>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 flex items-center gap-1.5"><Radio className="w-3 h-3" /> تُسجَّل الرسائل عند الإرسال عبر المحرك (message_records).</p>
    </div>
  );
};
