// agent/state/AppState.ts
// Objet d'etat central (doc 07).

import type { Message } from '../types/messages';
import type { ToolEvent } from '../components/ToolProgress';
import type { VimMode } from '../vim';

export type InputMode = 'normal' | 'vim' | 'plan';
export type EffortLevel = 'low' | 'medium' | 'high';

export interface CostState {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export interface AppState {
  // Conversation
  messages: Message[];
  isStreaming: boolean;
  streamBuffer: string;

  // Modele
  currentModel: string;
  thinkingEnabled: boolean;
  effortLevel: EffortLevel;

  // Outils
  activeToolEvents: ToolEvent[];

  // Session
  sessionId: string;
  startTime: number;
  offline: boolean;

  // Couts
  costState: CostState;

  // UI
  inputMode: InputMode;
  vimEnabled: boolean;
  vimSubMode: VimMode;
  scrollPosition: number;
  busy: boolean;
}

export function initialAppState(init: {
  sessionId: string;
  model: string;
  offline: boolean;
}): AppState {
  return {
    messages: [],
    isStreaming: false,
    streamBuffer: '',
    currentModel: init.model,
    thinkingEnabled: false,
    effortLevel: 'medium',
    activeToolEvents: [],
    sessionId: init.sessionId,
    startTime: Date.now(),
    offline: init.offline,
    costState: { inputTokens: 0, outputTokens: 0, requests: 0 },
    inputMode: 'normal',
    vimEnabled: false,
    vimSubMode: 'insert',
    scrollPosition: 0,
    busy: false,
  };
}
