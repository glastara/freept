export interface Model {
  id: string;
  name: string;
  context_length: number;
  description: string;
  supportsWebSearch: boolean;
}

export type ToolState = "input-streaming" | "output-available" | "output-error";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  toolState?: ToolState;
  toolError?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
