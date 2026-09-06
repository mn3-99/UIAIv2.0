import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, MessageSquare, Trash2, Database, Brain, Trash } from 'lucide-react';
import { toast } from '../Toast';

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface Dossier {
  user: any;
  chat_count: number;
  message_count: number;
  last_activity: string | null;
  chats: any[];
  facts: any[];
  rag_documents: any[];
  summaries: any[];
}

const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-slate-50/70 rounded-2xl border border-slate-200 p-3 space-y-2">
    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">{icon}{title}</div>
    {children}
  </div>
);

export const UserDossier: React.FC<{ userId: string; authFetch: AuthFetch; onClose: () => void }> =
  ({ userId, authFetch, onClose }) => {
    const [data, setData] = useState<Dossier | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'chats' | 'memory' | 'rag'>('chats');
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const load = useCallback(async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/admin/user/${encodeURIComponent(userId)}/dossier`);
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        toast.error('تعذر تحميل دوسيير المستخدم');
      } finally {
        setLoading(false);
      }
    }, [userId, authFetch]);

    useEffect(() => { void load(); }, [load]);

    const del = async (path: string) => {
      try {
        const res = await authFetch(path, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) throw new Error();
        toast.success('تم الحذف');
        void load();
      } catch {
        toast.error('فشل الحذف');
      } finally {
        setConfirmId(null);
      }
    };

    const u = data?.user;

    return (
      <div className="absolute inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="bg-white w-full max-w-3xl h-[88vh] sm:h-auto sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-l from-indigo-600 to-violet-600 text-white flex items-center justify-between shrink-0">
            <div>
              <div className="font-black">دوسيير المستخدم الكامل</div>
              <div className="text-[11px] opacity-80">{u ? `${u.username || ''} · ${u.email || ''}` : userId}</div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading && <div className="p-8 text-center text-slate-400">جاري تحميل الدوسيير…</div>}
          {!loading && data && (
            <>
              {/* Summary chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-200 text-center">
                {[
                  { l: 'محادثات', v: data.chat_count },
                  { l: 'رسائل', v: data.message_count },
                  { l: 'ذكريات', v: data.facts.length },
                  { l: 'مستندات RAG', v: data.rag_documents.length },
                ].map((s) => (
                  <div key={s.l} className="bg-white rounded-xl border border-slate-200 py-2">
                    <div className="text-lg font-black text-indigo-600">{s.v}</div>
                    <div className="text-[10px] text-slate-500 font-semibold">{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Sub-tabs */}
              <div className="flex items-center gap-1.5 px-5 pt-3">
                {([
                  { id: 'chats', label: 'المحادثات', icon: <MessageSquare className="w-3.5 h-3.5" /> },
                  { id: 'memory', label: 'الذاكرة (Facts)', icon: <Brain className="w-3.5 h-3.5" /> },
                  { id: 'rag', label: 'RAG', icon: <Database className="w-3.5 h-3.5" /> },
                ] as const).map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {tab === 'chats' && (
                  <Section title={`محادثات (${data.chats.length})`} icon={<MessageSquare className="w-3.5 h-3.5 text-indigo-500" />}>
                    {data.chats.length === 0 && <p className="text-xs text-slate-400">لا توجد محادثات.</p>}
                    {data.chats.map((c: any) => (
                      <div key={c.chat_id} className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-700 truncate">{c.title || c.chat_id}</div>
                          <div className="text-[10px] text-slate-400">{c.message_count} رسالة · {c.updated_at || ''} {c.deleted ? '· (محذوف)' : ''}</div>
                        </div>
                        <button
                          onClick={() => confirmId === c.chat_id ? del(`/api/admin/user/${userId}/chat/${encodeURIComponent(c.chat_id)}`) : setConfirmId(c.chat_id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${confirmId === c.chat_id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                        >
                          {confirmId === c.chat_id ? 'تأكيد' : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </Section>
                )}

                {tab === 'memory' && (
                  <Section title={`ذكريات طويلة الأمد (${data.facts.length})`} icon={<Brain className="w-3.5 h-3.5 text-violet-500" />}>
                    {data.facts.length === 0 && <p className="text-xs text-slate-400">لا توجد ذكريات.</p>}
                    {data.facts.map((f: any) => (
                      <div key={f.id} className="flex items-start justify-between gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
                        <p className="text-xs text-slate-700 flex-1">{f.fact}</p>
                        <button
                          onClick={() => confirmId === `f${f.id}` ? del(`/api/admin/user/${userId}/fact/${f.id}`) : setConfirmId(`f${f.id}`)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors shrink-0 ${confirmId === `f${f.id}` ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                        >
                          {confirmId === `f${f.id}` ? 'تأكيد' : <Trash className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </Section>
                )}

                {tab === 'rag' && (
                  <Section title={`مستندات RAG (${data.rag_documents.length})`} icon={<Database className="w-3.5 h-3.5 text-emerald-500" />}>
                    {data.rag_documents.length === 0 && <p className="text-xs text-slate-400">لا توجد مستندات مفهرسة.</p>}
                    {data.rag_documents.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-700 truncate">{d.name}</div>
                          <div className="text-[10px] text-slate-400">{d.chunk_count || 0} مقطع</div>
                        </div>
                        <button
                          onClick={() => confirmId === `r${d.id}` ? del(`/api/admin/user/${userId}/rag/${d.id}`) : setConfirmId(`r${d.id}`)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${confirmId === `r${d.id}` ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                        >
                          {confirmId === `r${d.id}` ? 'تأكيد' : <Trash2 className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </Section>
                )}

                {data.summaries.length > 0 && (
                  <Section title="ملخصات المحادثة الدوّارة" icon={<RefreshCw className="w-3.5 h-3.5 text-cyan-500" />}>
                    {data.summaries.map((s: any) => (
                      <details key={s.chat_id} className="bg-white rounded-xl border border-slate-200 px-3 py-2">
                        <summary className="text-[11px] font-bold text-slate-600 cursor-pointer">{s.chat_id}</summary>
                        <p className="text-[11px] text-slate-500 mt-1 whitespace-pre-wrap">{s.summary}</p>
                      </details>
                    ))}
                  </Section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };
