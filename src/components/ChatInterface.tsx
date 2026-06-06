"use client";

import { useEffect, useRef, useState } from "react";
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
import { ChatMessage, Conversation, Model } from "@/lib/types";

type Props = {
  model: string;
  models: Model[];
  onModelChange: (id: string) => void;
  activeConversation: Conversation | null;
  onMessagesChange: (messages: ChatMessage[]) => void;
};

function handleModelChange(
  onModelChange: (id: string) => void
): (value: string | null) => void {
  return (value) => {
    if (value !== null) onModelChange(value);
  };
}

export function ChatInterface({
  model,
  models,
  onModelChange,
  activeConversation,
  onMessagesChange,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    activeConversation?.messages ?? []
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const submittingRef = useRef(false);
  // Capture the active conversation id at submit time so streaming callbacks
  // always write to the right conversation even if the user switches.
  const streamingConvoIdRef = useRef<string | undefined>(undefined);

  // Sync messages when the active conversation changes externally (sidebar click / new chat)
  useEffect(() => {
    setMessages(activeConversation?.messages ?? []);
    setInput("");
  }, [activeConversation?.id]);

  function updateMessages(updated: ChatMessage[]) {
    setMessages(updated);
    onMessagesChange(updated);
  }

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;

    // Capture the conversation id at submit time (may be undefined for a brand-new chat)
    streamingConvoIdRef.current = activeConversation?.id;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messages, userMsg];
    updateMessages(history);
    setInput("");
    setIsStreaming(true);

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

      setMessages((prev) => {
        const next = [...prev, { role: "assistant" as const, content: "" }];
        onMessagesChange(next);
        return next;
      });

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
          onMessagesChange(updated);
          return updated;
        });
      }

      const trailing = decoder.decode();
      if (trailing) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + trailing };
          onMessagesChange(updated);
          return updated;
        });
      }
    } catch (e) {
      console.error("chat stream error", e);
      const msg = e instanceof Error ? e.message : "Failed to get response";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        let next: ChatMessage[];
        if (last.role === "assistant") {
          next = [...updated.slice(0, -1), { ...last, content: msg, isError: true }];
        } else {
          next = [...updated, { role: "assistant", content: msg, isError: true }];
        }
        onMessagesChange(next);
        return next;
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
                <p className="text-2xl font-semibold">Ask anything. It's on the house.</p>
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
