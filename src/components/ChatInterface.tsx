"use client";

import { useRef, useState } from "react";
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
import { Loader } from "@/components/ui/loader";
import { ScrollButton } from "@/components/ui/scroll-button";
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
  const submittingRef = useRef(false);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setIsStreaming(true);

    // Strip error messages and non-standard fields before sending to API
    const apiMessages = history
      .filter((m) => !m.isError)
      .map(({ role, content }) => ({ role, content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model }),
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

      // Flush any buffered multi-byte characters (e.g. emoji, CJK) from the decoder
      const trailing = decoder.decode();
      if (trailing) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + trailing };
          return updated;
        });
      }
    } catch (e) {
      console.error("chat stream error", e);
      const msg = e instanceof Error ? e.message : "Failed to get response";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: msg, isError: true };
        } else {
          updated.push({ role: "assistant", content: msg, isError: true });
        }
        return updated;
      });
    } finally {
      submittingRef.current = false;
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Thread */}
      <div className="relative flex-1 min-h-0">
        <ChatContainerRoot className="h-full">
          <ChatContainerContent className="py-6 px-4 max-w-3xl mx-auto w-full space-y-4">
            {messages.length === 0 ? (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2">
                <p className="text-2xl font-semibold">What can I help with?</p>
                <p className="text-muted-foreground text-sm">Powered by free models via OpenRouter</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <Message
                  key={i}
                  className={msg.role === "user" ? "justify-end" : "justify-start"}
                >
                  {isStreaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" ? (
                    <Loader variant="typing" size="sm" className="mt-1 ml-1" />
                  ) : (
                    <MessageContent
                      markdown={msg.role === "assistant" && !msg.isError}
                      className={
                        msg.isError
                          ? "text-destructive bg-destructive/10 rounded-xl px-4 py-2.5 max-w-[80%] text-sm"
                          : msg.role === "user"
                          ? "bg-muted rounded-3xl px-5 py-2.5 max-w-[80%]"
                          : "bg-transparent p-0 max-w-full"
                      }
                    >
                      {msg.content}
                    </MessageContent>
                  )}
                </Message>
              ))
            )}
            {/* Pending indicator: request in-flight but no assistant message yet */}
            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <Message className="justify-start">
                <Loader variant="typing" size="sm" className="mt-1 ml-1" />
              </Message>
            )}
            <ChatContainerScrollAnchor />
          </ChatContainerContent>
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="pointer-events-auto">
              <ScrollButton />
            </div>
          </div>
        </ChatContainerRoot>
      </div>

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
                <SelectContent className="min-w-[320px]">
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
