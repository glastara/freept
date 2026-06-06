# FreePT Core Chat Loop — Design Spec

**Date:** 2026-06-06  
**Scope:** Implement the core chat loop: send messages, stream replies, render thread.

---

## Architecture

Two-file split:

- **`src/app/page.tsx`** — already owns model loading and selection. Refactored to full-screen layout; renders `<ChatInterface model={selectedModel} />` once models load.
- **`src/components/ChatInterface.tsx`** (new) — owns all chat state and rendering.

---

## Layout

Full-screen (`h-screen flex flex-col`):

```
┌─────────────────────────────────────┐
│  FreePT              [Model ▼]      │  ← sticky header
├─────────────────────────────────────┤
│                                     │
│   (chat thread, scrollable)         │  ← flex-1, ChatContainerRoot
│                                     │
├─────────────────────────────────────┤
│  [ Type a message…         Send ]   │  ← pinned bottom, PromptInput
└─────────────────────────────────────┘
```

---

## `ChatInterface` Component

**State:**
- `messages: ChatMessage[]` — the conversation history
- `input: string` — current textarea value
- `isStreaming: boolean` — true while a response is in-flight

**`handleSubmit()`:**
1. Guard: if `input` is blank or `isStreaming`, return early.
2. Append `{ role: "user", content: input }` to messages; clear input.
3. Append `{ role: "assistant", content: "" }` placeholder to messages; set `isStreaming = true`.
4. `POST /api/chat` with `{ messages: [...prev, userMsg], model }`.
5. Read `res.body.getReader()`, decode each chunk with `TextDecoder`, and append to the last message's `content` in place (functional state update to avoid stale closures).
6. On reader done or error: set `isStreaming = false`.

**Rendering:**
- `ChatContainerRoot > ChatContainerContent` wraps the thread (provides auto-scroll via `use-stick-to-bottom`).
- Each message: `<Message>` with `<MessageContent markdown={role === "assistant"}>`.
- No avatars — keeps the UI simple.
- `PromptInput > PromptInputTextarea` + a send `Button`, with `disabled={isStreaming}`.

---

## Error Handling

If the fetch or stream throws, set `isStreaming = false` and replace the empty assistant placeholder content with an inline error string (e.g. `"Error: failed to get response"`). No toast needed at this stage.

---

## What's Excluded (next steps)

- Markdown rendering polish / CodeBlock (PLAN §1:30–2:00)
- Loader spinner while streaming (PLAN §1:30–2:00)
- ScrollButton (PLAN §1:30–2:00)
- Empty/welcome state, disable-during-stream UX polish (PLAN §2:00–2:20)
- localStorage conversation history (stretch)
