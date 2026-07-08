"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/ui/message";
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
import { ArrowUp, Check, Copy, FileText, Globe, ImageIcon, Paperclip, X } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { ScrollButton } from "@/components/ui/scroll-button";
import { Tool } from "@/components/ui/tool";
import {
  FileUpload,
  FileUploadContent,
  FileUploadTrigger,
} from "@/components/ui/file-upload";
import { Attachment, ChatMessage, Conversation, Model, ToolState, UrlSource } from "@/lib/types";
import { acceptForModel, processFile } from "@/lib/attachments";
import { Source, SourceContent, SourceTrigger } from "@/components/ui/source";

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

// Convert a message with attachments into OpenAI-style multimodal content parts.
function toApiContent(msg: ChatMessage): string | object[] {
  if (!msg.attachments?.length) return msg.content;
  const parts: object[] = [];
  if (msg.content) parts.push({ type: "text", text: msg.content });
  for (const a of msg.attachments) {
    if (a.text != null) {
      parts.push({ type: "text", text: `\n\n[Attached file: ${a.name}]\n${a.text}` });
    } else if (a.mediaType.startsWith("image/") && a.dataUrl) {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    } else if (a.dataUrl) {
      parts.push({ type: "file", file: { filename: a.name, file_data: a.dataUrl } });
    }
  }
  return parts;
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  if (attachment.mediaType.startsWith("image/") && attachment.dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachment.dataUrl}
        alt={attachment.name}
        className="max-h-64 max-w-[240px] rounded-2xl object-cover"
      />
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="max-w-[200px] truncate">{attachment.name}</span>
    </div>
  );
}


function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <MessageAction tooltip={copied ? "Copied!" : "Copy"}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy message"
        className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </MessageAction>
  );
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const activeModel = models.find((m) => m.id === model);
  const supportsWebSearch = activeModel?.supportsWebSearch ?? false;
  const supportsImages = activeModel?.supportsImages ?? false;

  const acceptTypes = acceptForModel(supportsImages);

  async function handleFilesAdded(files: File[]) {
    setAttachmentError(null);
    const results = await Promise.all(
      files.map((f) => processFile(f, { supportsImages }))
    );
    const added: Attachment[] = [];
    const errors: string[] = [];
    for (const r of results) {
      if (r.ok) added.push(r.attachment);
      else errors.push(r.error);
    }
    if (added.length) setAttachments((prev) => [...prev, ...added]);
    if (errors.length) setAttachmentError(errors.join(" "));
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

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
    if ((!trimmed && attachments.length === 0) || submittingRef.current) return;
    submittingRef.current = true;

    streamingConvoIdRef.current = activeConversation?.id;

    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed,
      ...(attachments.length ? { attachments } : {}),
    };
    const history = [...messagesRef.current, userMsg];
    commitMessages(history, true); // save: creates/updates conversation entry
    setInput("");
    setAttachments([]);
    setAttachmentError(null);
    setIsStreaming(true);

    const apiMessages = history
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, content: toApiContent(m) }));

    const useWebSearch = webSearchEnabled && supportsWebSearch;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model, webSearch: useWebSearch }),
      });

      if (!res.ok || !res.body) {
        let msg = "Request failed";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") msg = data.error;
        } catch { /* non-JSON error body */ }
        throw new Error(msg);
      }

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

      // Header protocol for web search:
      //   {"__tool":"input-streaming"}\n  — sent immediately
      //   {"__tool":"output-available"|"output-error"}\n  — when search finishes
      //   {"__sources":[...]}\n  — optional, immediately after output-available
      // We consume lines as headers until we hit a line that is not a recognised
      // JSON header (or JSON.parse fails), at which point content begins.
      let lineBuffer = "";
      let parsingHeaders = useWebSearch;

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

      const applySources = (sources: UrlSource[]) => {
        const cur = messagesRef.current;
        const updated = [...cur];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, sources };
        commitMessages(updated);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (!parsingHeaders) {
          appendText(chunk);
          continue;
        }

        // Still in header-parsing mode: accumulate and process complete lines.
        lineBuffer += chunk;

        while (lineBuffer.includes("\n")) {
          const nl = lineBuffer.indexOf("\n");
          const line = lineBuffer.slice(0, nl);
          lineBuffer = lineBuffer.slice(nl + 1);

          let isHeader = false;
          try {
            const parsed = JSON.parse(line);
            if (parsed.__tool) {
              applyToolState(parsed.__tool as ToolState, parsed.error);
              isHeader = true;
            } else if (parsed.__sources) {
              applySources(parsed.__sources as UrlSource[]);
              isHeader = true;
            }
          } catch { /* not a header line */ }

          if (!isHeader) {
            // Content starts here — flush this line and remainder as text.
            parsingHeaders = false;
            appendText(line + (lineBuffer ? "\n" + lineBuffer : ""));
            lineBuffer = "";
            break;
          }
        }

        // Headers done — flush any partial text already buffered.
        if (!parsingHeaders && lineBuffer) {
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
                    <div
                      className={
                        msg.role === "assistant"
                          ? "w-full"
                          : "flex max-w-[80%] min-w-0 flex-col items-end gap-2"
                      }
                    >
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {msg.attachments.map((a, ai) => (
                            <AttachmentPreview key={ai} attachment={a} />
                          ))}
                        </div>
                      )}
                      {msg.toolState && (
                        <Tool
                          toolPart={{
                            type: "web_search",
                            state: msg.toolState,
                            ...(msg.toolError ? { errorText: msg.toolError } : {}),
                          }}
                        />
                      )}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
                          {msg.sources.map((src, si) => (
                            <Source key={si} href={src.url}>
                              <SourceTrigger label={si + 1} showFavicon />
                              <SourceContent title={src.title} description={src.url} />
                            </Source>
                          ))}
                        </div>
                      )}
                      {(msg.content ||
                        (msg.role === "assistant" &&
                          (!isStreaming || i < messages.length - 1))) && (
                        <MessageContent
                          markdown={msg.role === "assistant" && !msg.isError}
                          className={
                            msg.isError
                              ? "text-destructive bg-destructive/10 rounded-xl px-4 py-2.5 max-w-[80%] text-sm"
                              : msg.role === "user"
                              ? "bg-muted rounded-3xl px-5 py-2.5"
                              : "bg-transparent p-0 max-w-full"
                          }
                        >
                          {msg.content}
                        </MessageContent>
                      )}
                      {msg.content &&
                        !msg.isError &&
                        !(isStreaming && i === messages.length - 1) && (
                          <MessageActions
                            className={
                              msg.role === "user" ? "justify-end" : "justify-start -ml-1"
                            }
                          >
                            <CopyButton text={msg.content} />
                          </MessageActions>
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
          {attachmentError && (
            <div className="mb-2 flex items-start justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{attachmentError}</span>
              <button
                type="button"
                aria-label="Dismiss"
                className="shrink-0 opacity-70 hover:opacity-100"
                onClick={() => setAttachmentError(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <FileUpload
            onFilesAdded={handleFilesAdded}
            accept={acceptTypes}
            disabled={isStreaming}
          >
          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            disabled={isStreaming}
          >
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2">
                {attachments.map((a, i) => (
                  <div key={i} className="relative">
                    {a.mediaType.startsWith("image/") && a.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.dataUrl}
                        alt={a.name}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="max-w-[160px] truncate">{a.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      className="absolute -top-1.5 -right-1.5 rounded-full bg-foreground p-0.5 text-background shadow"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachment(i);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                <FileUploadTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                    disabled={isStreaming}
                    title={
                      supportsImages
                        ? "Attach images, PDFs, or documents"
                        : "Attach PDFs or documents (this model does not accept images)"
                    }
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </FileUploadTrigger>

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
                  disabled={isStreaming || (!input.trim() && attachments.length === 0)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </PromptInputActions>
          </PromptInput>

          <FileUploadContent>
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-background/95 px-14 py-10 shadow-lg">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Drop files to attach</p>
              <p className="text-sm text-muted-foreground">
                {supportsImages
                  ? "Images, PDFs, and documents (.docx, .txt, .md, …)"
                  : "PDFs and documents — this model does not accept images"}
              </p>
            </div>
          </FileUploadContent>
          </FileUpload>
        </div>
      </div>
    </div>
  );
}
