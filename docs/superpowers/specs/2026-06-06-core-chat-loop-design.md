# FreePT Core Chat Loop — Design Spec

**Date:** 2026-06-06  
**Scope:** Implement the core chat loop: send messages, stream replies, render thread.

---

## Layout

Full-screen (`h-screen flex flex-col`), always in chat-state (no empty→chat transition):

```
┌─────────────────────────────────────┐
│  FreePT                             │  ← simple header, no model selector
├─────────────────────────────────────┤
│                                     │
│   (chat thread, scrollable)         │  ← flex-1, ChatContainerRoot
│   [empty: centered "Hey there"]     │
│                                     │
├─────────────────────────────────────┤
│  [Model Name ▼]         [↑ Send]   │  ← PromptInputActions
│  [  Type a message…            ]    │  ← PromptInputTextarea
└─────────────────────────────────────┘
```

---

## Component Structure

**`src/app/page.tsx`** — owns model loading + selection state. Renders full-screen layout with `ChatInterface` once loaded.

**`src/components/ChatInterface.tsx`** (new) — client component. Receives `model: string`, `models: Model[]`, `onModelChange: (id: string) => void`.

---

## `ChatInterface` State & Logic

**State:**
- `messages: ChatMessage[]` — conversation history
- `input: string` — current textarea value
- `isStreaming: boolean` — true while response in-flight

**`handleSubmit()`:**
1. Guard: blank input or `isStreaming` → return.
2. Append `{ role: "user", content: input }` to messages; clear input.
3. Append `{ role: "assistant", content: "" }` placeholder; set `isStreaming = true`.
4. `POST /api/chat` with `{ messages: [...history, userMsg], model }`.
5. Read `res.body.getReader()`, decode chunks with `TextDecoder`, append to last message's content via functional state update.
6. On done or error: set `isStreaming = false`. On error: set assistant placeholder content to `"Error: failed to get response"`.

---

## Rendering

**Thread** (`ChatContainerRoot > ChatContainerContent`):
- `messages.length === 0`: centered "Hey there" text inside content area.
- User messages: `<Message className="justify-end">` + `<MessageContent className="bg-muted rounded-3xl px-5 py-2.5">`.
- Assistant messages: `<Message className="justify-start">` + `<MessageContent markdown className="bg-transparent p-0">`.

**Input** (`PromptInput` pinned at bottom):
- `<PromptInputTextarea placeholder="How can I help you today?" />`
- `<PromptInputActions>`:
  - **Left**: `<Select>` rendered as inline text trigger `"Model Name ▼"` — the existing shadcn Select component, trigger styled as a ghost/text button.
  - **Right**: send `<Button size="icon">` with `<ArrowUp />`, disabled while `isStreaming`.

---

## Error Handling

Fetch/stream throws → `isStreaming = false` + replace assistant placeholder with `"Error: failed to get response"`. No toast at this stage.

---

## What's Excluded (next steps per PLAN.md)

- Loader spinner while streaming (§1:30–2:00)
- ScrollButton for long threads (§1:30–2:00)
- Disable input while streaming / UX polish (§2:00–2:20)
- localStorage conversation history (stretch)
