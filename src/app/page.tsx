"use client";

import { useEffect, useState } from "react";
import { Model } from "@/lib/types";
import { ChatInterface } from "@/components/ChatInterface";
import { Sidebar } from "@/components/Sidebar";
import { useConversations } from "@/lib/useConversations";

const STORAGE_KEY = "freept-model";

export default function Home() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    conversations,
    activeConversation,
    activeId,
    chatKey,
    searchQuery,
    setSearchQuery,
    newChat,
    selectConversation,
    saveMessages,
  } = useConversations();

  useEffect(() => {
    fetch("/api/models", { signal: AbortSignal.timeout(15_000) })
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewChat={newChat}
        onSelect={selectConversation}
      />

      <div className="flex flex-col flex-1 min-w-0">
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
            key={chatKey}
            model={selectedModel}
            models={models}
            onModelChange={handleModelChange}
            activeConversation={activeConversation}
            onMessagesChange={saveMessages}
          />
        )}
      </div>
    </div>
  );
}
