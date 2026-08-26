// Arabic-first text-to-speech built on the Web Speech API (zero backend cost).
// Reads prose only — markdown syntax, code fences and links are stripped so
// the voice never spells out backticks or URLs.

let activeChunk: SpeechSynthesisUtterance | null = null;

function pickArabicVoice(): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find((v) => v.lang?.toLowerCase().startsWith('ar')) || null;
  } catch {
    return null;
  }
}

// Clean markdown noise down to readable spoken text.
function toSpokenText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' فقرة كود برمجي. ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#*_>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speakText(text: string, onEnd?: () => void): boolean {
  if (!('speechSynthesis' in window)) return false;
  stopSpeaking();

  const clean = toSpokenText(text);
  if (!clean) return false;

  // Split into sentence chunks — long single utterances get truncated
  // mid-way by several mobile speech engines.
  const sentences = clean.match(/[^.!?؟\n]+[.!?؟]?/g) || [clean];
  const chunks: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if ((buf + s).length > 180) {
      if (buf) chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  const voice = pickArabicVoice();

  const speakChunk = (i: number) => {
    if (i >= chunks.length) {
      activeChunk = null;
      onEnd?.();
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[i]);
    u.lang = voice?.lang || 'ar-SA';
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = () => speakChunk(i + 1);
    u.onerror = () => {
      activeChunk = null;
      onEnd?.();
    };
    activeChunk = u;
    window.speechSynthesis.speak(u);
  };

  speakChunk(0);
  return true;
}

export function stopSpeaking(): void {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* engine unavailable */
  }
  activeChunk = null;
}

export function isSpeechActive(): boolean {
  return activeChunk !== null;
}
