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
import { ArrowUp, Globe } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { ScrollButton } from "@/components/ui/scroll-button";
import { Tool } from "@/components/ui/tool";
import { ChatMessage, Conversation, Model, ToolState } from "@/lib/types";

type Props = {
  model: string;
  models: Model[];
  onModelChange: (id: string) => void;
  activeConversation: Conversation | null;
  onMessagesChange: (messages: ChatMessage[], conversationId?: string) => void;
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
  // Mirror of messages kept in a ref so async streaming callbacks always see
  // the latest value without stale closures and without nesting setState calls.
  const messagesRef = useRef<ChatMessage[]>(activeConversation?.messages ?? []);
  // Captured at submit time so streaming callbacks always target the originating
  // conversation even if the user switches to a different one mid-stream.
  const streamingConvoIdRef = useRef<string | undefined>(undefined);

  function commitMessages(next: ChatMessage[], save = false) {
    messagesRef.current = next;
    setMessages(next);
    if (save) onMessagesChange(next, streamingConvoIdRef.current);
  }

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const submittingRef = useRef(false);

  const activeModel = models.find((m) => m.id === model);
  const supportsWebSearch = activeModel?.supportsWebSearch ?? false;

  // Sync messages when the active conversation changes
  useEffect(() => {
    const next = activeConversation?.messages ?? [];
    messagesRef.current = next;
    setMessages(next);
    setInput("");
  }, [activeConversation?.id]);

  // Disable web search toggle when switching to a model that doesn't support it
  useEffect(() => {
    if (!supportsWebSearch) setWebSearchEnabled(false);
  }, [supportsWebSearch]);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || submittingRef.current) return;
    submittingRef.current = true;

    streamingConvoIdRef.current = activeConversation?.id;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const history = [...messagesRef.current, userMsg];
    commitMessages(history, true); // save: creates/updates conversation entry
    setInput("");
    setIsStreaming(true);

    const apiMessages = history
      .filter((m) => !m.isError)
      .map(({ role, content }) => ({ role, content }));

    const useWebSearch = webSearchEnabled && supportsWebSearch;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model, webSearch: useWebSearch }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      // Add the assistant placeholder immediately
      const withPlaceholder: ChatMessage[] = [
        ...messagesRef.current,
        {
          role: "assistant",
          content: "",
          ...(useWebSearch ? { toolState: "input-streaming" as ToolState } : {}),
        },
      ];
      commitMessages(withPlaceholder, true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // We expect exactly 2 tool-header lines before text when webSearch is on:
      //   {"__tool":"input-streaming"}\n  — sent immediately
      //   {"__tool":"output-available"|"output-error",...}\n  — sent after plugin resolves
      // Everything after those two lines is model text.
      let lineBuffer = "";
      let headersRemaining = useWebSearch ? 2 : 0;

      const appendText = (text: string) => {
        if (!text) return;
        const cur = messagesRef.current;
        const updated = [...cur];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, content: last.content + text };
        commitMessages(updated);
      };

      const applyToolState = (state: ToolState, error?: string) => {
        const cur = messagesRef.current;
        const updated = [...cur];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, toolState: state, toolError: error };
        commitMessages(updated);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (headersRemaining === 0) {
          appendText(chunk);
          continue;
        }

        // Still parsing header lines — accumulate into lineBuffer and process
        // complete lines one at a time.
        lineBuffer += chunk;

        while (lineBuffer.includes("\n") && headersRemaining > 0) {
          const nl = lineBuffer.indexOf("\n");
          const line = lineBuffer.slice(0, nl);
          lineBuffer = lineBuffer.slice(nl + 1);

          try {
            const parsed = JSON.parse(line);
            if (parsed.__tool) {
              applyToolState(parsed.__tool as ToolState, parsed.error);
              headersRemaining--;
              continue;
            }
          } catch { /* not a header line */ }

          // Non-header line — treat as the start of the text response
          appendText(line + "\n" + lineBuffer);
          lineBuffer = "";
          headersRemaining = 0;
          break;
        }

        // All headers consumed — flush any partial text already in lineBuffer
        if (headersRemaining === 0 && lineBuffer) {
          appendText(lineBuffer);
          lineBuffer = "";
        }
      }

      // Flush any trailing decoder bytes
      const trailing = decoder.decode();
      if (trailing) {
        const cur = messagesRef.current;
        const updated = [...cur];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, content: last.content + trailing };
        commitMessages(updated);
      }
    } catch (e) {
      console.error("chat stream error", e);
      const msg = e instanceof Error ? e.message : "Failed to get response";
      const cur = messagesRef.current;
      const last = cur[cur.length - 1];
      let next: ChatMessage[];
      if (last?.role === "assistant") {
        next = [...cur.slice(0, -1), { ...last, content: msg, isError: true }];
      } else {
        next = [...cur, { role: "assistant", content: msg, isError: true }];
      }
      commitMessages(next, true);
    } finally {
      // Persist final streamed state to localStorage
      onMessagesChange(messagesRef.current, streamingConvoIdRef.current);
      submittingRef.current = false;
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Thread */}
      <div className="relative flex-1 min-h-0">
        {messages.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-2xl font-semibold">Ask anything. It&apos;s on the house.</p>
          </div>
        )}
        <ChatContainerRoot className="h-full">
          <ChatContainerContent className="py-6 px-4 max-w-3xl mx-auto w-full space-y-4">
            {messages.length > 0 &&
              messages.map((msg, i) => (
                <Message
                  key={i}
                  className={msg.role === "user" ? "justify-end" : "justify-start"}
                >
                  {isStreaming && i === messages.length - 1 && msg.role === "assistant" && msg.content === "" && !msg.toolState ? (
                    <Loader variant="typing" size="sm" className="mt-1 ml-1" />
                  ) : (
                    <div className={msg.role === "assistant" ? "w-full" : undefined}>
                      {msg.toolState && (
                        <Tool
                          toolPart={{
                            type: "web_search",
                            state: msg.toolState,
                            ...(msg.toolError ? { errorText: msg.toolError } : {}),
                          }}
                        />
                      )}
                      {(msg.content || (!isStreaming || i < messages.length - 1)) && (
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
                    </div>
                  )}
                </Message>
              ))}
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

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={[
                    "h-8 w-8 rounded-full",
                    !supportsWebSearch
                      ? "opacity-40 cursor-not-allowed"
                      : webSearchEnabled
                      ? "text-blue-500 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                  disabled={!supportsWebSearch || isStreaming}
                  onClick={() => setWebSearchEnabled((v) => !v)}
                  title={
                    !supportsWebSearch
                      ? "This model does not support web search"
                      : webSearchEnabled
                      ? "Disable web search"
                      : "Enable web search"
                  }
                >
                  <Globe className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={handleSubmit}
                  disabled={isStreaming || !input.trim()}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
