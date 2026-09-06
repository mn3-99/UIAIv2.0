import React from 'react';
import { MijlaiComposer } from './MijlaiComposer';
import type { useChatEngine } from '../hooks/useChatEngine';

// ─────────────────────────────────────────────────────────────────────────────
// ComposerSlot — the ONE place MijlaiComposer is invoked. Previously App.tsx
// rendered <MijlaiComposer> twice (empty state + active chat) with ~25 verbatim
// props; any change had to be made twice.
//
// NOTE (future direction): the composer should eventually read its own state
// from a ComposerContext instead of a big prop bag. For now ComposerSlot keeps
// a single definition point — the shared engine values (send/stop/attachments/
// queue) come straight from useChatEngine, and the remaining UI wiring is
// bundled once in App and passed as `ui`.
// ─────────────────────────────────────────────────────────────────────────────

export type ChatEngineReturn = ReturnType<typeof useChatEngine>;

export interface ComposerUi {
  input: string;
  setInput: (v: string) => void;
  selectedTier: string;
  onSelectTier: (tier: string) => void;
  webSearchEnabled: boolean;
  setWebSearchEnabled: (v: boolean) => void;
  knowledgeEnabled: boolean;
  setKnowledgeEnabled: (v: boolean) => void;
  localModels: Array<{ id: string; name: string }>;
  arenaMode: boolean;
  onToggleArena: () => void;
  arenaModelA: string;
  arenaModelB: string;
  onSelectArenaModel: (side: 'a' | 'b', tier: string) => void;
  skillsBar: React.ReactNode;
  isGuest: boolean;
}

interface ComposerSlotProps {
  variant: 'hero' | 'docked';
  engine: ChatEngineReturn;
  ui: ComposerUi;
}

export const ComposerSlot: React.FC<ComposerSlotProps> = ({ variant, engine, ui }) => {
  const composer = (
    <MijlaiComposer
      input={ui.input}
      setInput={ui.setInput}
      onSend={() => engine.handleSendMessage()}
      onStop={engine.handleStopGeneration}
      isGenerating={engine.isGenerating}
      selectedTier={ui.selectedTier}
      onSelectTier={ui.onSelectTier}
      onAttachFile={engine.handleAttachFile}
      arenaMode={ui.arenaMode}
      onToggleArena={ui.onToggleArena}
      arenaModelA={ui.arenaModelA}
      arenaModelB={ui.arenaModelB}
      onSelectArenaModel={ui.onSelectArenaModel}
      onGenerateImage={engine.handleGenerateImage}
      webSearchEnabled={ui.webSearchEnabled}
      setWebSearchEnabled={ui.setWebSearchEnabled}
      knowledgeEnabled={ui.knowledgeEnabled}
      setKnowledgeEnabled={ui.setKnowledgeEnabled}
      localModels={ui.localModels}
      attachments={engine.attachments}
      onRemoveAttachment={engine.removeAttachment}
      isUploading={engine.isUploading}
      skillsBar={ui.skillsBar}
      queueCount={engine.messageQueue.length}
      isGuest={ui.isGuest}
    />
  );

  if (variant === 'docked') {
    return <div className="w-full pb-safe pt-2">{composer}</div>;
  }
  return composer;
};
