// Speech-to-Text utility using Web Speech API
// Works in Chrome, Edge, Safari (with permissions)

interface SpeechRecognitionCallbacks {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

interface SpeechRecognitionCallbacks {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: any) => void) | null;
  onerror: ((this: SpeechRecognition, ev: any) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

class SpeechRecognitionManager {
  private recognition: any = null;
  private callbacks: {
    onResult?: (transcript: string, isFinal: boolean) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
    onStart?: () => void;
  } = {};
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.setupRecognition();
      }
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'ar-SA';
    
    this.recognition.onstart = () => {
      this.isListening = true;
      this.callbacks.onStart?.();
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        this.callbacks.onResult?.(finalTranscript, true);
      } else if (interimTranscript) {
        this.callbacks.onResult?.(interimTranscript, false);
      }
    };

    this.recognition.onerror = (event: any) => {
      const errorMessages: Record<string, string> = {
        'no-speech': 'لم يتم اكتشاف أي صوت',
        'audio-capture': 'فشل في الوصول للميكروفون',
        'not-allowed': 'تم رفض إذن الميكروفون',
        'network': 'خطأ في الشبكة',
        'service-not-allowed': 'خدمة التعرف غير مسموحة',
        'bad-grammar': 'خطأ في القواعد',
        'language-not-supported': 'اللغة غير مدعومة',
      };
      const errorMsg = errorMessages[event.error] || `خطأ في التعرف: ${event.error}`;
      this.callbacks.onError?.(errorMsg);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.callbacks.onEnd?.();
    };
  }

  start(callbacks: {
    onResult?: (transcript: string, isFinal: boolean) => void;
    onError?: (error: string) => void;
    onEnd?: () => void;
    onStart?: () => void;
  }): boolean {
    if (!this.recognition) {
      this.callbacks.onError?.('التعرف على الصوت غير مدعوم في هذا المتصفح');
      return false;
    }
    
    if (this.isListening) return false;
    
    this.callbacks = {
      onResult: arguments[0]?.onResult,
      onError: arguments[0]?.onError,
      onEnd: arguments[0]?.onEnd,
      onStart: arguments[0]?.onStart,
    };
    
    try {
      this.recognition.start();
      return true;
    } catch (err) {
      this.callbacks.onError?.('فشل بدء التعرف على الصوت');
      return false;
    }
  }

  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  abort(): void {
    if (this.recognition && this.isListening) {
      this.recognition.abort();
    }
  }

  getIsListening(): boolean {
    return this.isListening;
  }
}

// Singleton instance
const speechManager = new SpeechRecognitionManager();

// React hook for speech recognition
import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  language?: string;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  const { onResult, onError, onStart, onEnd, language = 'ar-SA' } = options;

  // Initialize recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = language;

        recognitionRef.current.onstart = () => {
          setIsListening(true);
          isListeningRef.current = true;
          options.onStart?.();
        };

        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }
          
          setInterimTranscript(interimTranscript);
          if (finalTranscript) {
            setTranscript(prev => prev + finalTranscript);
            options.onResult?.(finalTranscript, true);
          } else {
            options.onResult?.(interimTranscript, false);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          const errorMessages: Record<string, string> = {
            'no-speech': 'لم يتم اكتشاف أي صوت',
            'audio-capture': 'فشل في الوصول للميكروفون',
            'not-allowed': 'تم رفض إذن الميكروفون',
            'network': 'خطأ في الشبكة',
            'service-not-allowed': 'خدمة التعرف غير مسموحة',
            'bad-grammar': 'خطأ في القواعد',
            'language-not-supported': 'اللغة غير مدعومة',
          };
          const errorMsg = errorMessages[event.error] || `خطأ في التعرف: ${event.error}`;
          setError(errorMsg);
          options.onError?.(errorMsg);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
          options.onEnd?.();
        };
      }
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError('التعرف على الصوت غير مدعوم في هذا المتصفح');
      return;
    }
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    try {
      recognitionRef.current!.start();
    } catch (err) {
      setError('فشل بدء التعرف على الصوت');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const abortListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
    fullTranscript: transcript + interimTranscript,
  };
}

export { speechManager };

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}
