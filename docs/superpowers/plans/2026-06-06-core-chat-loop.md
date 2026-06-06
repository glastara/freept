# Core Chat Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up a full-screen streaming chat UI — messages state, POST /api/chat with ReadableStream decoding, prompt-kit rendering, and a model selector inside the PromptInput bar.

**Architecture:** `page.tsx` owns model loading and passes model/models/onModelChange to a new `ChatInterface` component. `ChatInterface` owns all chat state (messages, input, isStreaming) and renders the thread + PromptInput. No other files are created or modified.

**Tech Stack:** Next.js 15 App Router, React 19, prompt-kit (ChatContainerRoot/Content, Message/MessageContent, PromptInput/PromptInputTextarea/PromptInputActions), shadcn Select, lucide-react (ArrowUp), Tailwind v4.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/page.tsx` | Modify | Full-screen layout, model loading, render ChatInterface |
| `src/components/ChatInterface.tsx` | Create | All chat state, streaming logic, thread + input rendering |

---

### Task 1: Restructure `page.tsx` to full-screen layout

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx with full-screen shell**

Replace the entire contents of `src/app/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Model } from "@/lib/types";
import { ChatInterface } from "@/components/ChatInterface";

const STORAGE_KEY = "freept-model";

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load models");
        return res.json();
      })
      .then((data: Model[]) => {
        setModels(data);
        const saved = localStorage.getItem(STORAGE_KEY);
        const initial =
          saved && data.find((m) => m.id === saved) ? saved : data[0]?.id ?? "";
        setSelectedModel(initial);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleModelChange(id: string) {
    setSelectedModel(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b px-4 py-3 shrink-0">
        <h1 className="text-sm font-semibold">FreePT</h1>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">Loading models…</p>
        </div>
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-destructive text-sm">Error: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <ChatInterface
          model={selectedModel}
          models={models}
          onModelChange={handleModelChange}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript sees no errors (ChatInterface doesn't exist yet — expect one import error only)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: one error about `@/components/ChatInterface` not found. No other errors.

---

### Task 2: Create `ChatInterface.tsx` — layout + message rendering

**Files:**
- Create: `src/components/ChatInterface.tsx`

- [ ] **Step 1: Create the component file with layout skeleton and messages rendering**

Create `src/components/ChatInterface.tsx`:

```tsx
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
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, model }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

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
    } catch {
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
              <Select value={model} onValueChange={onModelChange}>
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
```

- [ ] **Step 2: Type-check — expect zero errors**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Full-screen layout with "FreePT" header
- "Hey there" centred in the thread area
- PromptInput at the bottom with model name selector (left) and send button (right)
- Typing in the textarea and pressing Enter or the send button shows user message in thread
- Model reply streams in below it
- Switching model in the dropdown changes which model replies

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/ChatInterface.tsx
git commit -m "feat: core chat loop — streaming messages, model selector in input"
```

---

## Self-Review Checklist

- [x] **Spec coverage**
  - Full-screen layout → Task 1 Step 1
  - ChatInterface component with messages/input/isStreaming → Task 2 Step 1
  - handleSubmit: guard, append user msg, POST /api/chat, stream decode, functional update → Task 2 Step 1
  - User messages: `justify-end`, `bg-muted rounded-3xl px-5 py-2.5` → Task 2 Step 1
  - Assistant messages: `justify-start`, `bg-transparent p-0`, markdown → Task 2 Step 1
  - Model selector inside PromptInputActions (left) → Task 2 Step 1
  - Send button (right), disabled while streaming → Task 2 Step 1
  - Empty state "Hey there" → Task 2 Step 1
  - Error sets assistant placeholder content → Task 2 Step 1

- [x] **Placeholder scan** — no TBDs or vague steps; all code is complete

- [x] **Type consistency** — `ChatMessage`, `Model` from `@/lib/types` used consistently; `onModelChange: (id: string) => void` matches call sites in both files
