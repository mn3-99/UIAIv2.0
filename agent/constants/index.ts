// agent/constants/index.ts
// Constantes globales de l'agent (doc 02 : variables d'environnement cles).

export const AGENT_NAME = 'uiai-agent';
export const AGENT_VERSION = '0.1.0';

/** Repertoire de configuration utilisateur (equivalent de ~/.MijlAI/). */
export const CONFIG_DIR_NAME = '.uiai-agent';

/** Variables d'environnement reconnues (doc 02). */
export const ENV = {
  BRIDGE: 'UIAI_AGENT_BRIDGE',
  REMOTE: 'UIAI_AGENT_REMOTE',
  API_KEY: 'UIAI_API_KEY',
  DEBUG: 'UIAI_AGENT_DEBUG',
  MODEL: 'UIAI_AGENT_MODEL',
  BASE_URL: 'UIAI_BASE_URL',
  DAEMON_WORKER: 'UIAI_AGENT_DAEMON_WORKER',
} as const;

/** URL de base par defaut : le serveur Express du projet UIAI. */
export const DEFAULT_BASE_URL = 'http://localhost:3000';

/** Endpoint OpenAI-compatible expose par server.ts du projet. */
export const CHAT_COMPLETIONS_PATH = '/api/v1/chat/completions';
export const MODELS_PATH = '/api/models';

export const DEFAULT_MODEL = 'mijlai-pwr';
