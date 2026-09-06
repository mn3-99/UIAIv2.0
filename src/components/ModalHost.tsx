import React from 'react';
import { SettingsModal } from './SettingsModal';
import {
  FilesModal, GemsModal, UpgradeModal, PromptEditModal, ProfileModal
} from './MijlaiModals';
import { AuthModal } from './AuthModal';
import { AdminDashboard } from './AdminDashboard';
import { SkillsManagerModal } from './SkillsManagerModal';
import { OnboardingModal } from './OnboardingModal';
import { ImageStudio } from './ImageStudio';
import type { AppSettings, ProviderConfig, UserAccount } from '../types';
import type { SkillDefinition } from '../utils/skillsRegistry';

// ─────────────────────────────────────────────────────────────────────────────
// ModalHost — one place that mounts every static modal, declaratively, instead
// of a dozen sequential JSX blocks in App.tsx. Each entry below is a
// { key, node } tuple; add/remove modals here without touching the App shell.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModalHostProps {
  // skills
  isSkillsManagerOpen: boolean;
  onCloseSkillsManager: () => void;
  skillsRegistry: SkillDefinition[];
  onToggleSkill: (id: string) => void;
  onRegistryChanged: () => void;
  // onboarding
  showOnboarding: boolean;
  onCloseOnboarding: () => void;
  // files / gems / studio / upgrade
  isFilesOpen: boolean; onCloseFiles: () => void;
  isGemsOpen: boolean; onCloseGems: () => void;
  activeGemId: string | null; onSelectGem: (id: string) => void;
  isImageStudioOpen: boolean; onCloseImageStudio: () => void;
  imageStudioChatId?: string;
  isUpgradeOpen: boolean; onCloseUpgrade: () => void;
  // prompt edit / profile
  isPromptEditOpen: boolean; onClosePromptEdit: () => void;
  customPrompt: string; onSavePrompt: (p: string) => void;
  isProfileOpen: boolean; onCloseProfile: () => void;
  userName: string; onChangeName: (n: string) => void;
  // settings
  isSettingsOpen: boolean; onCloseSettings: () => void;
  settings: AppSettings; onUpdateSettings: (s: AppSettings) => void;
  providers: ProviderConfig[];
  onAddCustomProvider: (p: ProviderConfig) => void;
  onDeleteCustomProvider: (id: string) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onClearData: () => void;
  // auth / admin
  isAuthModalOpen: boolean; onCloseAuth: () => void;
  onLoginSuccess: (user: UserAccount & { token?: string }) => void;
  isAdminModalOpen: boolean; onCloseAdmin: () => void;
  currentUser: UserAccount | null;
}

export const ModalHost: React.FC<ModalHostProps> = (props) => {
  const {
    isSkillsManagerOpen, onCloseSkillsManager, skillsRegistry, onToggleSkill, onRegistryChanged,
    showOnboarding, onCloseOnboarding,
    isFilesOpen, onCloseFiles, isGemsOpen, onCloseGems, activeGemId, onSelectGem,
    isImageStudioOpen, onCloseImageStudio, imageStudioChatId, isUpgradeOpen, onCloseUpgrade,
    isPromptEditOpen, onClosePromptEdit, customPrompt, onSavePrompt,
    isProfileOpen, onCloseProfile, userName, onChangeName,
    isSettingsOpen, onCloseSettings, settings, onUpdateSettings, providers,
    onAddCustomProvider, onDeleteCustomProvider, onExportBackup, onImportBackup, onClearData,
    isAuthModalOpen, onCloseAuth, onLoginSuccess,
    isAdminModalOpen, onCloseAdmin, currentUser,
  } = props;

  const modals: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: 'skills', node: (
        <SkillsManagerModal
          isOpen={isSkillsManagerOpen}
          onClose={onCloseSkillsManager}
          registry={skillsRegistry}
          onToggleSkill={onToggleSkill}
          onRegistryChanged={onRegistryChanged}
        />
      )
    },
    { key: 'onboarding', node: <OnboardingModal isOpen={showOnboarding} onClose={onCloseOnboarding} /> },
    { key: 'files', node: <FilesModal isOpen={isFilesOpen} onClose={onCloseFiles} /> },
    {
      key: 'gems', node: (
        <GemsModal isOpen={isGemsOpen} onClose={onCloseGems} onSelectGem={onSelectGem} activeGemId={activeGemId} />
      )
    },
    {
      key: 'image-studio', node: (
        <ImageStudio isOpen={isImageStudioOpen} onClose={onCloseImageStudio} chatId={imageStudioChatId} />
      )
    },
    { key: 'upgrade', node: <UpgradeModal isOpen={isUpgradeOpen} onClose={onCloseUpgrade} /> },
    {
      key: 'prompt-edit', node: (
        <PromptEditModal
          isOpen={isPromptEditOpen}
          onClose={onClosePromptEdit}
          customPrompt={customPrompt}
          onSavePrompt={onSavePrompt}
        />
      )
    },
    {
      key: 'profile', node: (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={onCloseProfile}
          userName={userName}
          onChangeName={onChangeName}
        />
      )
    },
    {
      key: 'settings', node: (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={onCloseSettings}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          providers={providers}
          onAddCustomProvider={onAddCustomProvider}
          onDeleteCustomProvider={onDeleteCustomProvider}
          onExportBackup={onExportBackup}
          onImportBackup={onImportBackup}
          onClearData={onClearData}
        />
      )
    },
    {
      key: 'auth', node: (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={onCloseAuth}
          onLoginSuccess={onLoginSuccess}
        />
      )
    },
    {
      key: 'admin', node: (
        <AdminDashboard
          isOpen={isAdminModalOpen}
          onClose={onCloseAdmin}
          currentUser={currentUser}
        />
      )
    },
  ];

  return <>{modals.map(m => <React.Fragment key={m.key}>{m.node}</React.Fragment>)}</>;
};
