export const MessageRoles = {
  USER: 'user',
  ASSISTANT: 'assistant',
  TOOL: 'tool',
} as const;

export type MessageRole = (typeof MessageRoles)[keyof typeof MessageRoles];
