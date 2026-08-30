// agent/Tool.ts
// Interface de base Tool (doc 04).

export type JSONSchema = {
  type: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  [key: string]: unknown;
};

export type ToolInputJSONSchema = {
  type: 'object';
  properties: Record<string, JSONSchema>;
  required?: string[];
};

export type ToolResult = {
  content: string;
  isError?: boolean;
};

/** Niveaux de risque (doc 04 ; consommes par le systeme de permissions, doc 08). */
export type ToolRisk = 'LOW' | 'MEDIUM' | 'HIGH';

/** Contexte passe a chaque outil lors de l'execution (doc 04). */
export type ToolUseContext = {
  workingDirectory: string;
  abortSignal?: AbortSignal;
  onProgress?: (progress: string) => void;
  sessionId: string;
  /** Canal de question interactive (AskUserQuestionTool). */
  askUser?: (question: string) => Promise<string>;
};

export type Tool = {
  name: string;
  description: string;
  inputSchema: ToolInputJSONSchema;
  risk: ToolRisk;
  /** Feature flag requis (doc 01 §1 / doc 04 filtrage). */
  featureGate?: string;
  /** Interne uniquement (filtre pour les utilisateurs externes). */
  internalOnly?: boolean;
  execute: (
    input: Record<string, unknown>,
    context: ToolUseContext,
  ) => Promise<string | ToolResult>;
};
