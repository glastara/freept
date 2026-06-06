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
      <header className="border-b px-4 py-3 shrink-0 flex items-center justify-between">
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
