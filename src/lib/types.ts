export interface Model {
  id: string;
  name: string;
  context_length: number;
  description: string;
  supportsWebSearch: boolean;
  supportsImages: boolean;
}

export interface Attachment {
  name: string;
  mediaType: string;
  dataUrl: string;
}

export type ToolState = "input-streaming" | "output-available" | "output-error";

export interface UrlSource {
  url: string;
  title: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
  toolState?: ToolState;
  toolError?: string;
  sources?: UrlSource[];
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
