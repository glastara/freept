"use client";

import { useState } from "react";
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import { Message, MessageContent } from "@/components/ui/message";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { ChatMessage, Model } from "@/lib/types";

type Props = {
  model: string;
  models: Model[];
  onModelChange: (id: string) => void;
};

function handleModelChange(
  onModelChange: (id: string) => void
): (value: string | null) => void {
  return (value) => {
    if (value !== null) onModelChange(value);
  };
}

export function ChatInterface({ model, models, onModelChange }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, model }), // history excludes the assistant placeholder intentionally
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      // Append assistant placeholder only once we know the request succeeded
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk,
          };
          return updated;
        });
      }
    } catch (e) {
      console.error("chat stream error", e);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Error: failed to get response",
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Thread */}
      <ChatContainerRoot className="flex-1">
        <ChatContainerContent className="py-6 px-4 max-w-3xl mx-auto w-full space-y-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <p className="text-muted-foreground text-xl">Hey there</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <Message
                key={i}
                className={msg.role === "user" ? "justify-end" : "justify-start"}
              >
                <MessageContent
                  markdown={msg.role === "assistant"}
                  className={
                    msg.role === "user"
                      ? "bg-muted rounded-3xl px-5 py-2.5 max-w-[80%]"
                      : "bg-transparent p-0 max-w-full"
                  }
                >
                  {msg.content}
                </MessageContent>
              </Message>
            ))
          )}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
      </ChatContainerRoot>

      {/* Input */}
      <div className="border-t p-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            disabled={isStreaming}
          >
            <PromptInputTextarea placeholder="How can I help you today?" />
            <PromptInputActions className="justify-between pt-1">
              {/* Model selector — left */}
              <Select value={model} onValueChange={handleModelChange(onModelChange)}>
                <SelectTrigger className="h-auto w-auto border-none bg-transparent px-2 py-1 text-xs text-muted-foreground shadow-none hover:text-foreground focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Send button — right */}
              <Button
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={handleSubmit}
                disabled={isStreaming || !input.trim()}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
