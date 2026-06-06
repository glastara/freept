"use client";

import { SquarePen } from "lucide-react";
import { Conversation } from "@/lib/types";
import { Button } from "@/components/ui/button";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
};

export function Sidebar({
  conversations,
  activeId,
  searchQuery,
  onSearchChange,
  onNewChat,
  onSelect,
}: Props) {
  return (
    <aside className="flex flex-col w-64 shrink-0 border-r h-full bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b">
        <span className="text-base font-bold tracking-tight">
          <span className="text-primary">Free</span>PT
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={onNewChat}
          title="New chat"
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search chats"
          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Conversation list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {searchQuery ? "No chats match your search." : "No chats yet."}
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full text-left rounded-md px-3 py-2 text-sm truncate mb-0.5 transition-colors ${
                c.id === activeId
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {c.title}
            </button>
          ))
        )}
      </nav>
    </aside>
  );
}
