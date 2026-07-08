"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage, Conversation } from "./types";

const CONVERSATIONS_KEY = "freept-conversations";
const ACTIVE_ID_KEY = "freept-active-id";

function load(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function save(convos: Conversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convos));
  } catch (e) {
    // Quota exceeded (large image attachments) — retry without attachment data
    // so the conversation text is still persisted.
    try {
      const slim = convos.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({ ...m, attachments: undefined })),
      }));
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(slim));
    } catch {
      console.error("Failed to persist conversations", e);
    }
  }
}

function makeTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = first?.content || first?.attachments?.[0]?.name || "New chat";
  return text.length > 40 ? text.slice(0, 40).trimEnd() + "…" : text;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatKey, setChatKey] = useState(0);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = load();
    setConversations(stored);
    const savedId = localStorage.getItem(ACTIVE_ID_KEY);
    const exists = savedId && stored.find((c) => c.id === savedId);
    const id = exists ? savedId : null;
    setActiveId(id);
    activeIdRef.current = id;
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    activeIdRef.current = null;
    localStorage.removeItem(ACTIVE_ID_KEY);
    setChatKey((k) => k + 1);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
    activeIdRef.current = id;
    localStorage.setItem(ACTIVE_ID_KEY, id);
  }, []);

  // Called by ChatInterface after every message update.
  // Uses a ref-captured id so streaming callbacks always target the right conversation.
  const saveMessages = useCallback((messages: ChatMessage[], conversationId?: string) => {
    const targetId = conversationId ?? activeIdRef.current;

    // For a brand-new conversation, assign the ID synchronously before scheduling
    // the state update. React's updater runs asynchronously (MessageChannel macrotask),
    // so any saveMessages call that arrives after an `await` would see activeIdRef
    // as still null if we only set it inside the updater — causing a duplicate entry.
    const resolvedId = targetId ?? crypto.randomUUID();
    if (!targetId) {
      activeIdRef.current = resolvedId;
      setActiveId(resolvedId);
      localStorage.setItem(ACTIVE_ID_KEY, resolvedId);
    }

    setConversations((prev) => {
      const existing = prev.find((c) => c.id === resolvedId);
      let updated: Conversation[];

      if (existing) {
        updated = prev.map((c) =>
          c.id === resolvedId
            ? { ...c, messages, title: makeTitle(messages), updatedAt: Date.now() }
            : c
        );
      } else {
        const newConvo: Conversation = {
          id: resolvedId,
          title: makeTitle(messages),
          messages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        updated = [newConvo, ...prev];
      }

      updated = [...updated].sort((a, b) => b.updatedAt - a.updatedAt);
      save(updated);
      return updated;
    });
  }, []);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const filteredConversations = searchQuery
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  return {
    conversations: filteredConversations,
    activeConversation,
    activeId,
    chatKey,
    searchQuery,
    setSearchQuery,
    newChat,
    selectConversation,
    saveMessages,
  };
}
