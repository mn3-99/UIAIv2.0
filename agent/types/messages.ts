// agent/types/messages.ts
// Types de messages (doc 07).

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type BaseMessage = {
  id: string;
  timestamp: number;
};

export type UserMessage = BaseMessage & {
  type: 'user';
  content: string;
  attachments?: Array<{ path: string; size: number }>;
};

export type AssistantMessage = BaseMessage & {
  type: 'assistant';
  content: string;
  model: string;
  usage?: TokenUsage;
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
};

export type ToolUseSummaryMessage = BaseMessage & {
  type: 'tool_use_summary';
  toolName: string;
  summary: string;
  originalIds: string[];
};

export type SystemLocalCommandMessage = BaseMessage & {
  type: 'system_command';
  command: string;
  output: string;
};

export type TombstoneMessage = BaseMessage & {
  type: 'tombstone';
};

export type ProgressMessage = BaseMessage & {
  type: 'progress';
  label: string;
};

export type Message =
  | UserMessage
  | AssistantMessage
  | ToolUseSummaryMessage
  | SystemLocalCommandMessage
  | TombstoneMessage
  | ProgressMessage;
