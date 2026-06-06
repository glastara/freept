"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Model } from "@/lib/types";

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

  function handleModelChange(id: string | null) {
    if (!id) return;
    setSelectedModel(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const activeModel = models.find((m) => m.id === selectedModel);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <h1 className="text-2xl font-semibold tracking-tight">FreePT</h1>

      {loading && (
        <p className="text-muted-foreground text-sm">Loading models…</p>
      )}

      {error && (
        <p className="text-destructive text-sm">Error: {error}</p>
      )}

      {!loading && !error && (
        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <Select value={selectedModel} onValueChange={handleModelChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeModel && (
            <p className="text-muted-foreground text-xs text-center">
              {activeModel.id}
              {activeModel.context_length
                ? ` · ${(activeModel.context_length / 1000).toFixed(0)}k ctx`
                : ""}
            </p>
          )}
        </div>
      )}

      <p className="text-muted-foreground/50 text-xs">
        Chat UI coming next →
      </p>
    </main>
  );
}
