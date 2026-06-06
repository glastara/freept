# Conversation History Design

**Date:** 2026-06-06  
**Status:** Approved

## Overview

Add persistent conversation history to FreePT: a sidebar showing past chats, a new chat button, and search by title. Conversations are stored in `localStorage`.

## Data Model

Add to `src/lib/types.ts`:

```ts
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
```

- `id`: `crypto.randomUUID()`
- `title`: auto-generated from the first user message, truncated to 40 chars
- `createdAt` / `updatedAt`: Unix timestamps (ms)

**localStorage keys:**
- `freept-conversations` — JSON array of all `Conversation` objects
- `freept-active-id` — string ID of the currently active conversation

## Layout

Two-column layout replacing the current single-column:

```
┌──────────────┬───────────────────────────────┐
│   Sidebar    │         Chat area             │
│   ~260px     │         flex-1                │
│              │                               │
│  FreePT  [+] │  [model selector in footer]   │
│  [Search   ] │                               │
│  ─────────── │  messages / welcome state     │
│  Chat title  │                               │
│  Chat title  │  [prompt input]               │
│  ...         │                               │
└──────────────┴───────────────────────────────┘
```

The existing full-width header bar is removed. The app title and new-chat button move into the sidebar header.

## Components & Files

| File | Role |
|------|------|
| `src/lib/useConversations.ts` | Hook encapsulating all localStorage read/write and conversation management |
| `src/components/Sidebar.tsx` | Sidebar UI: title, new-chat button, search input, conversation list |
| `src/app/page.tsx` | Wires hook + sidebar + ChatInterface together |
| `src/components/ChatInterface.tsx` | Receives `activeConversation` prop; calls `onMessagesChange` instead of owning state |
| `src/lib/types.ts` | Add `Conversation` type |

## `useConversations` Hook API

```ts
const {
  conversations,      // Conversation[] — filtered by search query if active
  activeConversation, // Conversation | null
  searchQuery,        // string
  setSearchQuery,     // (q: string) => void
  newChat,            // () => void — clears active conversation (no entry created yet)
  selectConversation, // (id: string) => void
  saveMessages,       // (messages: ChatMessage[]) => void — creates or updates active conversation
} = useConversations();
```

**`saveMessages` behaviour:**
- If no active conversation exists, creates a new one with title from the first user message
- Updates `updatedAt` and persists to localStorage
- Sorts the list by `updatedAt` descending (most recent first)

## Behaviour

- **App load with no history:** welcome state shown ("Ask anything. It's on the house."), no active conversation, sidebar shows empty list
- **New chat:** clicking the button sets `activeId` to `null` and clears the chat view — no entry is created until the first message is sent
- **First message sent:** `saveMessages` is called with the new messages array, which creates the conversation entry and generates the title
- **Switching conversations:** clicking a sidebar item loads that conversation's messages into the chat view; any ongoing stream for the previous conversation continues saving to it in the background (the `onMessagesChange` callback always targets the conversation that was active when the stream started)
- **Search:** client-side `title.toLowerCase().includes(query.toLowerCase())` filter; updates in real time as the user types; no fuzzy matching

## Welcome State Copy

> **Ask anything. It's on the house.**  
> Powered by free models via OpenRouter
