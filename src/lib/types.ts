export interface Model {
  id: string;
  name: string;
  context_length: number;
  description: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}
