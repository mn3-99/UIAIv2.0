import { useEffect, useRef, useState } from 'react';
import type { AppSettings, ChatMessage, ChatSession, FileAttachment, UserAccount } from '../types';
import { generateTitleFromMessage } from '../utils/storage';
import { getGemPrompt } from '../utils/gems';
import { generateFollowUps } from '../utils/followUps';
import { createStreamBatcher } from '../utils/streamSmoothing';
import { stopSpeaking } from '../utils/tts';
import { getActivePromptPacks } from '../utils/skillsRegistry';
import { triggerHaptic } from '../utils/nativeAdapter';
import { tierToModelId } from '../models/tiers';
import { toast } from '../components/Toast';

type LocalModel = { id: string; name: string };

export interface ChatEngineDeps {
  chats: ChatSession[];
  setChats: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  input: string;
  setInput: (v: string) => void;
  settings: AppSettings;
  selectedTier: string;
  webSearchEnabled: boolean;
  knowledgeEnabled: boolean;
  currentUser: UserAccount | null;
  activeGemId: string | null;
  localModels: LocalModel[];
  arenaMode: boolean;
  arenaModelA: string;
  arenaModelB: string;
  /** auto-open the live Canvas when the model emits an html/svg/mermaid artifact */
  onArtifact: (code: string, language: string) => void;
  /** open the Canvas with a generated image (markdown content) */
  onImageGenerated: (markdown: string) => void;
  /** smart auto-scroll during streaming */
  scrollToBottom: (smooth?: boolean) => void;
  /** ref to the scroll container (for non-intrusive auto-scroll) */
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Owns the entire send/generate lifecycle: the smart message queue, deep-search
 * + RAG context, SSE streaming with frame-locked batching, stop/regenerate/edit,
 * arena (two-model side-by-side) and file/image attachment sending.
 *
 * This is a verbatim extraction of the logic that lived in App.tsx — same
 * ordering, same timings, same public handler names (handleSendMessage,
 * handleStopGeneration, handleRegenerate, handleEditUserMessage,
 * handleArenaSend). Behavior is intentionally unchanged.
 */
export function useChatEngine(deps: ChatEngineDeps) {
  const {
    chats, setChats, activeChatId, setActiveChatId, input, setInput,
    settings, selectedTier, webSearchEnabled, knowledgeEnabled, currentUser,
    activeGemId, localModels, arenaMode, arenaModelA, arenaModelB,
    onArtifact, onImageGenerated, scrollToBottom, chatContainerRef,
  } = deps;

  const [isGenerating, setIsGenerating] = useState(false);
  const [messageQueue, setMessageQueue] = useState<Array<{
    id: string; text: string; chatId: string; userMsgId: string; assistantMsgId: string;
  }>>([]);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const arenaStreamsRef = useRef<EventSource[]>([]);
  const activeJobRef = useRef<string | null>(null);
  const activeStreamRef = useRef<{ eventSource: EventSource; finalize: (status: 'complete' | 'error', errorDetails?: string) => void } | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  // Build conversation history for multi-turn context. Only meaningful,
  // completed turns are included (empty/error/image placeholders excluded).
  const buildHistory = (messages: ChatMessage[]) =>
    messages
      .filter(m => m.content.trim() !== '' && m.status !== 'error' && !m.isImage)
      .slice(-24)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const createNewChat = (title: string, modelId: string, providerId: string): string => {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      modelId,
      providerId,
    };
    setChats(prev => [newSession, ...prev]);
    setActiveChatId(newSession.id);
    return newSession.id;
  };

  // Send Prompt with Decoupled Zero-Latency Engine
  const handleSendMessage = async (customPrompt?: string, opts?: { history?: Array<{ role: string; content: string }>; reuseIds?: { chatId: string; userMsgId: string; assistantMsgId: string } }) => {
    // Arena mode intercepts fresh composer sends (edit/regenerate bypass it).
    if (arenaMode && !customPrompt && !opts?.history) {
      return handleArenaSend();
    }
    const textToSend = customPrompt || input;
    if (!textToSend.trim()) return;

    // ── نظام الطابور الذكي: أثناء التوليد تُحفظ الرسالة في طابور بدل رفضها ──
    if (isGenerating && !opts?.reuseIds) {
      const queueChatId = activeChatId;
      if (!queueChatId) return; // لا محادثة نشطة لاستقبال الطابور
      const qUserMsgId = `msg-${Date.now()}`;
      const qAssistantMsgId = `msg-${Date.now() + 1}`;
      const queuedUserMsg: ChatMessage = {
        id: qUserMsgId,
        role: 'user',
        content: textToSend.trim(),
        timestamp: Date.now(),
        attachments: attachments.length ? attachments : undefined
      };
      const queuedAssistantMsg: ChatMessage = {
        id: qAssistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        modelId: tierToModelId(selectedTier),
        providerId: 'g4f',
        status: 'queued'
      };
      setChats(prev => prev.map(c => c.id === queueChatId
        ? { ...c, messages: [...c.messages, queuedUserMsg, queuedAssistantMsg], updatedAt: Date.now() }
        : c));
      setMessageQueue(prev => [...prev, {
        id: `q-${Date.now()}`,
        text: textToSend.trim(),
        chatId: queueChatId,
        userMsgId: qUserMsgId,
        assistantMsgId: qAssistantMsgId
      }]);
      setInput('');
      setAttachments([]);
      triggerHaptic('light');
      toast.info('أُضيفت رسالتك للطابور — ستُرسل تلقائياً فور اكتمال الرد الحالي');
      return;
    }
    stopSpeaking();

    let targetChatId = opts?.reuseIds ? opts.reuseIds.chatId : activeChatId;

    if (!targetChatId) {
      targetChatId = createNewChat(generateTitleFromMessage(textToSend), tierToModelId(selectedTier), 'g4f');
    }

    // Multi-turn context: prior messages + the new prompt as the final user turn.
    const history = opts?.history ?? buildHistory(activeChat?.messages || []);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: Date.now(),
      attachments: attachments.length ? attachments : undefined
    };

    const assistantMsgId = opts?.reuseIds?.assistantMsgId ?? `msg-${Date.now() + 1}`;

    if (opts?.reuseIds) {
      // عنصر مسترد من الطابور: الفقاعات موجودة مسبقاً — نفعّل حالة التفكير فقط
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            updatedAt: Date.now(),
            messages: c.messages.map(m =>
              m.id === assistantMsgId ? { ...m, status: 'thinking' as const } : m)
          };
        }
        return c;
      }));
    } else {
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        modelId: tierToModelId(selectedTier),
        providerId: 'g4f',
        status: 'thinking'
      };

      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          const updatedMsgs = [...c.messages, userMsg, assistantMsg];
          const newTitle = c.messages.length === 0 ? generateTitleFromMessage(textToSend) : c.title;
          return {
            ...c,
            title: newTitle,
            messages: updatedMsgs,
            updatedAt: Date.now()
          };
        }
        return c;
      }));
    }

    triggerHaptic('light');
    setInput('');
    setAttachments([]);
    setIsGenerating(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      // Agentic Deep Search (Area 2): enrich the prompt with live results before sending
      let finalPrompt = textToSend.trim();
      let searchSources: { title: string; url: string; snippet?: string }[] | undefined;
      let deepSearchMeta: any = undefined;

      if (webSearchEnabled) {
        try {
          const chatMsgs = chats.find((c) => c.id === targetChatId)?.messages || [];
          const history = chatMsgs.slice(-10).map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
          }));
          const searchRes = await fetch('/api/search/deep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: textToSend.trim(), max_results: 8, history }),
          });
          if (searchRes.ok) {
            const sd: any = await searchRes.json();
            if (sd?.needs_search && sd?.references?.length) {
              const refs: { num: number; title: string; url: string; snippet?: string; content?: string }[] =
                (sd.references || []).slice(0, 8);
              searchSources = refs.map((r) => ({
                title: r.title || '', url: r.url || '', snippet: r.snippet || ''
              }));
              // Feed the model the search CONTENT (not just site names) so it can
              // actually answer, with numbered citations, instead of echoing links.
              const refBlock = refs
                .map((r) => `[${r.num}] ${r.title}\n${r.url}\n${(r.snippet || '')}\n${(r.content || '').slice(0, 1000)}`.replace(/\n{3,}/g, '\n').trim())
                .join('\n\n');
              finalPrompt =
                'أجب عن سؤال المستخدم اعتماداً على مصادر الويب أدناه بإجابة كاملة ومفصلة بلغة السؤال. ' +
                'استشهد بالمصادر بين قوسين مربعين مثل [1] [2] عند نقل معلومة. إن لم تجد الإجابة في المصادر فقل ذلك بوضوح ولا تختلق.\n\n' +
                '## مصادر الويب\n\n' + refBlock + '\n\n---\n\nسؤال المستخدم: ' + textToSend.trim();
              deepSearchMeta = { needs_search: true, reasoning_steps: sd.reasoning_steps || [], references: refs };
            } else if (sd?.results?.length) {
              searchSources = sd.results.map((r: any) => ({ title: r.title || '', url: r.url || '', snippet: r.snippet || '' }));
              const refBlock = (sd.results as any[])
                .slice(0, 8)
                .map((r: any, i: number) => `[${i + 1}] ${r.title}\n${r.url}\n${(r.snippet || '')}`)
                .join('\n\n');
              finalPrompt =
                'أجب عن سؤال المستخدم اعتماداً على مصادر الويب أدناه بإجابة كاملة، واستشهد [1] [2] عند الحاجة. إن لم تجد إجابة فقل ذلك.\n\n' +
                '## مصادر الويب\n\n' + refBlock + '\n\n---\n\nسؤال المستخدم: ' + textToSend.trim();
              if (sd?.reasoning_steps) deepSearchMeta = { needs_search: !!sd.results.length, reasoning_steps: sd.reasoning_steps, references: sd.references || [] };
            }
          }
        } catch (searchErr) {
          console.warn('Deep search failed, continuing without context:', searchErr);
        }
      }

      // Attach search sources + deep-search metadata to the assistant bubble when they exist
      if (searchSources?.length || deepSearchMeta) {
        setChats(prev => prev.map(c => {
          if (c.id !== targetChatId) return c;
          return {
            ...c,
            messages: c.messages.map(m => m.id === assistantMsgId
              ? { ...m, searchSources: searchSources || m.searchSources, deepSearch: deepSearchMeta || m.deepSearch }
              : m)
          };
        }));
      }

      // Personal Knowledge (local RAG): retrieve top chunks from the user's docs
      if (knowledgeEnabled && localStorage.getItem('mijlai_auth_token')) {
        try {
          const ragRes = await fetch('/api/rag/query', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('mijlai_auth_token')}`
            },
            body: JSON.stringify({ query: textToSend.trim(), top_k: 5 })
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json();
            const hits: Array<{ text: string; doc: string }> = ragData?.results || [];
            if (hits.length > 0) {
              const kbBlock = hits
                .map((h, i) => `[مستند ${i + 1} — ${h.doc}]\n${h.text}`)
                .join('\n---\n');
              finalPrompt = `استعن بمقتطفات مستنداتي التالية عند الإجابة وعند الاقتباس أشر إليها [م1] [م2]:\n\n${kbBlock}\n\n---\n\nسؤالي: ${finalPrompt}`;
            }
          }
        } catch (ragErr) {
          console.warn('RAG retrieval failed, continuing without:', ragErr);
        }
      }

      // Decoupled Send request to FastAPI / Proxy (<10ms TTFB)
      const imageAttachments = attachments.filter(a => a.mime.startsWith('image/'));

      const docAttachments = attachments.filter(a => !a.mime.startsWith('image/') && a.textContent);
      if (docAttachments.length > 0) {
        const docsBlock = docAttachments
          .map(a => `### محتوى الملف المرفق: ${a.name}\n\`\`\`\n${a.textContent}\n\`\`\``)
          .join('\n\n');
        finalPrompt = `الملفات التالية مرفقة من المستخدم — اقرأها وأجب بناءً عليها:\n\n${docsBlock}\n\n---\n\n${finalPrompt}`;
      }

      const finalUserContent = imageAttachments.length
        ? [
            { type: 'text', text: finalPrompt },
            ...imageAttachments.map(a => ({ type: 'image_url', image_url: { url: a.url } }))
          ]
        : finalPrompt;
      // Compose the customization layer: global user system prompt (Settings)
      // + active Gem persona + ACTIVE SKILL PROMPT PACKS (الشريط السفلي).
      const styleInstructions = [settings.systemPrompt?.trim(), getGemPrompt(activeGemId), ...getActivePromptPacks()]
        .filter(Boolean)
        .join('\n\n');

      const sendRes = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          messages: [...history, { role: 'user', content: finalUserContent }],
          chat_id: targetChatId,
          model: tierToModelId(selectedTier),
          user_id: currentUser?.id || 'guest',
          email: currentUser?.email || 'guest@mijlai.com',
          ...(styleInstructions ? { system_prompt: styleInstructions } : {})
        })
      });

      if (!sendRes.ok) {
        throw new Error(`فشل الاتصال بالخادم (${sendRes.status})`);
      }

      const sendText = await sendRes.text();
      let sendData: any = {};
      try {
        sendData = JSON.parse(sendText);
      } catch (e) {
        throw new Error('استجابة غير صالحة من الخادم');
      }
      const taskId = sendData.task_id;
      if (!taskId) {
        throw new Error('لم يحصل الخادم على مهمة توليد (task_id). تأكد من توفر النموذج المحدد.');
      }
      activeJobRef.current = taskId;

      // Open SSE stream with offset resumption
      const eventSource = new EventSource(`/api/chat/stream/${encodeURIComponent(taskId)}?offset=0`);

      let fullText = '';
      let streamDone = false;
      const thinkStartRef = { current: 0 };
      let thinkText = '';

      // Frame-locked stream commit: tokens accumulate in plain strings and paint
      // at most once per animation frame instead of once per token.
      const commitStream = () => {
        setChats(prev => prev.map(c => {
          if (c.id !== targetChatId) return c;
          return {
            ...c,
            messages: c.messages.map(m => {
              if (m.id !== assistantMsgId) return m;
              const patch: Partial<ChatMessage> = { content: fullText };
              if (fullText && m.status === 'thinking') patch.status = 'streaming';
              if (thinkText && thinkText !== m.thinking) patch.thinking = thinkText;
              if (thinkText && fullText && !m.thinkingDurationMs) {
                patch.thinkingDurationMs = Date.now() - (thinkStartRef.current || Date.now());
              }
              return { ...m, ...patch } as ChatMessage;
            })
          };
        }));

        // Smart non-intrusive auto-scroll: only stick when already near the bottom.
        // Deferred one animation frame so the scrollHeight reflects the just-painted
        // thinking indicator / panel expansion before we follow it.
        if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          if (scrollHeight - scrollTop - clientHeight < 150) {
            requestAnimationFrame(() => scrollToBottom(false));
          }
        }
      };
      const streamBatcher = createStreamBatcher(commitStream);

      // Shared finalizer: marks the assistant message complete or failed exactly once.
      const finalizeStream = (status: 'complete' | 'error', errorDetails?: string) => {
        if (streamDone) return;
        streamDone = true;
        streamBatcher.flushNow();
        eventSource.close();
        if (activeStreamRef.current?.eventSource === eventSource) activeStreamRef.current = null;
        activeJobRef.current = null;
        setIsGenerating(false);
        if (status === 'complete') {
          triggerHaptic('medium');
          // Auto-open the live Canvas when the model produced a renderable artifact.
          const artifactMatch = fullText.match(/```(html|svg|mermaid)\s*\n([\s\S]*?)```/i);
          if (artifactMatch) {
            const lang = artifactMatch[1].toLowerCase();
            onArtifact(artifactMatch[2].trim(), lang);
          }
        }
        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      status: status === 'error' ? 'error' : 'complete',
                      errorDetails,
                      ...(status === 'complete' && fullText.trim()
                        ? { followUps: generateFollowUps(textToSend.trim(), fullText) }
                        : {})
                    }
                  : m
              )
            };
          }
          return c;
        }));
      };

      // Handles a single SSE payload (token or done).
      const handleStreamPayload = (data: any) => {
        if (data?.t === 'think') {
          const incoming = typeof data.d === 'string' ? data.d : '';
          if (!thinkStartRef.current) thinkStartRef.current = Date.now();
          thinkText = data.full ? incoming : thinkText + incoming;
          streamBatcher.schedule();
        } else if (data?.t === 'token' && data.d) {
          fullText += data.d;
          streamBatcher.schedule();
        } else if (data?.t === 'done') {
          if (data.status === 'failed' || data.status === 'aborted') {
            finalizeStream('error', data.error || 'تم إيقاف التوليد أو فشل الاتصال بالنموذج');
          } else {
            finalizeStream('complete');
          }
        }
      };

      eventSource.onmessage = (e) => {
        try {
          handleStreamPayload(JSON.parse(e.data));
        } catch (err) {
          console.warn('SSE parse error:', err);
        }
      };

      eventSource.addEventListener('done', (e: any) => {
        try {
          handleStreamPayload(JSON.parse(e.data));
        } catch (err) {
          console.warn('SSE done event parse error:', err);
          finalizeStream('error', 'استجابة تدفق غير صالحة من الخادم');
        }
      });

      eventSource.onerror = () => {
        if (streamDone) return;
        console.warn('SSE connection error for task:', taskId);
        finalizeStream('complete');
      };

      // Expose the live stream so handleStopGeneration can sever it instantly.
      activeStreamRef.current = { eventSource, finalize: finalizeStream };

    } catch (err: any) {
      console.error('Send error:', err);
      activeJobRef.current = null;
      setIsGenerating(false);
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m =>
              m.id === assistantMsgId
                ? { ...m, status: 'error', errorDetails: err.message || 'حدث خطأ أثناء الاتصال' }
                : m
            )
          };
        }
        return c;
      }));
    }
  };

  // ==========================================
  // Arena Mode: same prompt → two models → side-by-side with TTFT/speed stats
  // ==========================================
  const arenaTierLabel = (tier: string) => {
    const map: Record<string, string> = { mini: 'MijlAi Mini', flash: 'MijlAi Flash', pro: 'MijlAi Pro', coder: 'MijlAi Coder' };
    if (map[tier]) return map[tier];
    if (tier.startsWith('local:')) return localModels.find(m => m.id === tier)?.name || 'نموذج محلي';
    return tier;
  };

  const handleArenaSend = async () => {
    const textToSend = input.trim();
    if (!textToSend || isGenerating) return;
    if (arenaModelA === arenaModelB) {
      toast.info('اختر نموذجين مختلفين للمقارنة العادلة');
      return;
    }

    let targetChatId = activeChatId;
    if (!targetChatId) {
      targetChatId = createNewChat(generateTitleFromMessage(textToSend), 'arena', 'arena');
    }

    const history = buildHistory(activeChat?.messages || []);
    const groupId = `arena-${Date.now()}`;
    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: textToSend, timestamp: Date.now() };
    const leftId = `msg-${Date.now() + 1}`;
    const rightId = `msg-${Date.now() + 2}`;
    const leftMsg: ChatMessage = {
      id: leftId, role: 'assistant', content: '', timestamp: Date.now() + 1,
      modelId: tierToModelId(arenaModelA), providerId: 'arena', status: 'streaming',
      arenaGroup: groupId, arenaLabel: arenaTierLabel(arenaModelA), arenaStats: {}, arenaVote: null
    };
    const rightMsg: ChatMessage = {
      id: rightId, role: 'assistant', content: '', timestamp: Date.now() + 2,
      modelId: tierToModelId(arenaModelB), providerId: 'arena', status: 'streaming',
      arenaGroup: groupId, arenaLabel: arenaTierLabel(arenaModelB), arenaStats: {}, arenaVote: null
    };

    setChats(prev => prev.map(c => c.id === targetChatId ? {
      ...c,
      title: c.messages.length === 0 ? generateTitleFromMessage(textToSend) : c.title,
      messages: [...c.messages, userMsg, leftMsg, rightMsg],
      updatedAt: Date.now()
    } : c));

    triggerHaptic('light');
    setInput('');
    setAttachments([]);
    setIsGenerating(true);
    setTimeout(() => scrollToBottom(true), 50);

    const styleInstructions = [settings.systemPrompt?.trim(), getGemPrompt(activeGemId)].filter(Boolean).join('\n\n');

    const streamSide = async (tier: string, msgId: string) => {
      const startedAt = performance.now();
      let firstTokenAt = 0;
      let fullText = '';
      let done = false;

      const patchMsg = (patch: Partial<ChatMessage>) => {
        setChats(prev => prev.map(c => c.id !== targetChatId ? c : {
          ...c,
          messages: c.messages.map(m => m.id === msgId ? { ...m, ...patch } : m)
        }));
      };

      const sideBatcher = createStreamBatcher(() => patchMsg({ content: fullText }));

      const finalize = (status: 'complete' | 'error', errorDetails?: string) => {
        if (done) return;
        done = true;
        sideBatcher.flushNow();
        const totalMs = performance.now() - startedAt;
        patchMsg({
          status: status === 'error' ? 'error' : 'complete',
          errorDetails,
          arenaStats: {
            ttftMs: firstTokenAt ? Math.round(firstTokenAt - startedAt) : undefined,
            totalMs: Math.round(totalMs),
            charsPerSec: totalMs > 0 && fullText.length > 0 ? Math.round((fullText.length / totalMs) * 1000) : 0
          }
        });
      };

      try {
        const sendRes = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: textToSend,
            messages: [...history, { role: 'user', content: textToSend }],
            chat_id: targetChatId,
            model: tierToModelId(tier),
            user_id: currentUser?.id || 'guest',
            email: currentUser?.email || 'guest@mijlai.com',
            ...(styleInstructions ? { system_prompt: styleInstructions } : {})
          })
        });
        if (!sendRes.ok) throw new Error(`HTTP ${sendRes.status}`);
        const sendData = JSON.parse(await sendRes.text());
        const taskId = sendData.task_id;
        if (!taskId) throw new Error('no task_id');

        const es = new EventSource(`/api/chat/stream/${encodeURIComponent(taskId)}?offset=0`);
        arenaStreamsRef.current.push(es);

        const onPayload = (data: any) => {
          if (data?.t === 'token' && data.d) {
            if (!firstTokenAt) firstTokenAt = performance.now();
            fullText += data.d;
            sideBatcher.schedule();
          } else if (data?.t === 'done') {
            es.close();
            finalize(data.status === 'failed' ? 'error' : 'complete', data.error || undefined);
          }
        };
        es.onmessage = (e) => { try { onPayload(JSON.parse(e.data)); } catch { /* ignore */ } };
        es.addEventListener('done', (e: any) => {
          try { onPayload(JSON.parse(e.data)); } catch { es.close(); finalize('complete'); }
        });
        es.onerror = () => { es.close(); finalize(fullText ? 'complete' : 'error', fullText ? undefined : 'انقطع الاتصال بالنموذج'); };
      } catch (err: any) {
        finalize('error', err?.message || 'فشل الاتصال');
      }
    };

    await Promise.allSettled([streamSide(arenaModelA, leftId), streamSide(arenaModelB, rightId)]);
    arenaStreamsRef.current = [];
    setIsGenerating(false);
    triggerHaptic('medium');
  };

  const handleArenaVote = (groupId: string, vote: 'left' | 'right' | 'tie') => {
    setChats(prev => prev.map(c => ({
      ...c,
      messages: c.messages.map(m => m.arenaGroup === groupId ? { ...m, arenaVote: vote } : m)
    })));
    toast.success('تم تسجيل تقييمك للجولة ⚖️');
  };

  const handleStopGeneration = () => {
    const jobId = activeJobRef.current;
    const chatId = activeChatId;
    // 1) Sever the SSE stream immediately and keep the partial answer.
    activeStreamRef.current?.finalize('complete');
    activeStreamRef.current = null;
    // Arena mode: sever every live side-stream.
    arenaStreamsRef.current.forEach((es) => { try { es.close(); } catch { /* noop */ } });
    arenaStreamsRef.current = [];
    setChats(prev => prev.map(c => ({
      ...c,
      messages: c.messages.map(m =>
        m.status === 'streaming' || m.status === 'thinking'
          ? { ...m, status: 'complete' }
          : m)
    })));
    setIsGenerating(false);
    if (jobId) {
      fetch('/api/chat/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, chatId })
      }).catch(() => {});
    }
    activeJobRef.current = null;
    // الإيقاف اليدوي يلغي الطابور أيضاً.
    setMessageQueue(prev => {
      if (prev.length > 0) {
        const queuedAssistantIds = new Set(prev.map(q => q.assistantMsgId));
        setChats(prevChats => prevChats.map(c => ({
          ...c,
          messages: c.messages.map(m =>
            queuedAssistantIds.has(m.id) && m.status === 'queued'
              ? { ...m, status: 'error' as const, errorDetails: 'أُلغيت من الطابور' }
              : m)
        })));
        toast.info('تم مسح طابور الرسائل المنتظرة');
      }
      return [];
    });
  };

  // ── معالج الطابور: عند انتهاء التوليد ووجود رسائل منتظرة، أرسل التالية تلقائياً ──
  useEffect(() => {
    if (isGenerating || messageQueue.length === 0) return;
    const [next, ...rest] = messageQueue;
    setMessageQueue(rest);
    const timer = setTimeout(() => {
      void handleSendMessage(next.text, {
        reuseIds: { chatId: next.chatId, userMsgId: next.userMsgId, assistantMsgId: next.assistantMsgId }
      });
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, messageQueue]);

  // Regenerate: remove the previous answer (and anything after it) and re-ask.
  const handleRegenerate = () => {
    if (!activeChat || isGenerating) return;
    const msgs = activeChat.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const lastUserMsg = msgs[lastUserIdx];
    const history = buildHistory(msgs.slice(0, lastUserIdx));

    setChats(prev => prev.map(c => (c.id === activeChat.id ? { ...c, messages: msgs.slice(0, lastUserIdx) } : c)));
    handleSendMessage(lastUserMsg.content, { history });
  };

  // Edit a previous user message: truncate and resend the edited text.
  const handleEditUserMessage = (messageId: string, newText: string) => {
    if (!activeChat || isGenerating || !newText.trim()) return;
    const idx = activeChat.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const history = buildHistory(activeChat.messages.slice(0, idx));

    setChats(prev => prev.map(c => (c.id === activeChat.id ? { ...c, messages: activeChat.messages.slice(0, idx) } : c)));
    handleSendMessage(newText, { history });
  };

  // Attachment handler — real upload to /api/files/upload, chip shown in composer
  const TEXTLIKE_RE = /\.(txt|md|json|csv|py|js|ts|html?|css|xml|ya?ml|log)$/i;

  const handleAttachFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 8MB');
      return;
    }
    setIsUploading(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const result = String(fr.result || '');
          resolve(result.slice(result.indexOf(',') + 1));
        };
        fr.onerror = () => reject(new Error('فشل قراءة الملف'));
        fr.readAsDataURL(file);
      });
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream', data: b64 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الرفع');

      let textContent: string | undefined;
      if (!data.mime.startsWith('image/')) {
        try {
          if (TEXTLIKE_RE.test(data.name) || data.mime.startsWith('text/')) {
            textContent = (await file.text()).slice(0, 120000);
          } else if (data.name.toLowerCase().endsWith('.pdf') || data.mime === 'application/pdf') {
            const storedName = String(data.url || '').split('/').pop() || '';
            const extRes = await fetch('/api/files/extract-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId: storedName })
            });
            if (extRes.ok) {
              const extData = await extRes.json();
              textContent = String(extData.text || '').slice(0, 120000);
            }
          }
        } catch (extractErr) {
          console.warn('Text extraction failed (file attached without content):', extractErr);
        }
      }

      setAttachments(prev => [...prev, { id: data.id, name: data.name, url: data.url, mime: data.mime, size: data.size, textContent }]);
      toast.success(
        textContent
          ? `تم رفع «${data.name}» وقراءة محتواه (${Math.round(textContent.length / 1000)} ألف حرف)`
          : `تم رفع «${data.name}»`
      );
    } catch (err: any) {
      toast.error(err.message || 'فشل رفع الملف');
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id));

  // Image Generation with Pollinations.ai
  const handleGenerateImage = async (prompt: string) => {
    if (!prompt.trim()) return;

    let targetChatId = activeChatId;

    if (!targetChatId) {
      targetChatId = createNewChat(`توليد صورة: ${prompt.slice(0, 30)}...`, 'pollinations-flux', 'pollinations');
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `🎨 توليد صورة: ${prompt.trim()}`,
      timestamp: Date.now()
    };

    const assistantMsgId = `msg-${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
      modelId: 'pollinations-flux',
      providerId: 'pollinations',
      status: 'streaming',
      isImage: true
    };

    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        const updatedMsgs = [...c.messages, userMsg, assistantMsg];
        return { ...c, messages: updatedMsgs, updatedAt: Date.now() };
      }
      return c;
    }));

    triggerHaptic('light');
    setIsGenerating(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      if (!res.ok) {
        throw new Error(`فشل توليد الصورة (${res.status})`);
      }

      const data = await res.json();

      if (data.success && data.url) {
        const imageMarkdown = `![Generated Image](${data.url})\n\n**المُحفِّز:** ${data.prompt}\n**النموذج:** ${data.model} • **الأبعاد:** ${data.width}x${data.height}\n**البذرة:** ${data.seed}`;

        setChats(prev => prev.map(c => {
          if (c.id === targetChatId) {
            return {
              ...c,
              messages: c.messages.map(m =>
                m.id === assistantMsgId ? { ...m, content: imageMarkdown, status: 'complete', isImage: true } : m
              )
            };
          }
          return c;
        }));

        onImageGenerated(imageMarkdown);
        triggerHaptic('medium');
        toast.success('تم توليد الصورة بنجاح');
      } else {
        throw new Error('استجابة غير صالحة من خدمة توليد الصور');
      }
      setIsGenerating(false);
    } catch (err: any) {
      console.error('Image generation error:', err);
      setIsGenerating(false);
      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return {
            ...c,
            messages: c.messages.map(m =>
              m.id === assistantMsgId
                ? { ...m, status: 'error', errorDetails: err.message || 'حدث خطأ أثناء توليد الصورة' }
                : m
            )
          };
        }
        return c;
      }));
    }
  };

  return {
    isGenerating,
    messageQueue,
    attachments,
    isUploading,
    handleSendMessage,
    handleStopGeneration,
    handleRegenerate,
    handleEditUserMessage,
    handleArenaSend,
    handleArenaVote,
    handleAttachFile,
    removeAttachment,
    handleGenerateImage,
    activeJobRef,
    activeStreamRef,
    arenaStreamsRef,
  };
}
