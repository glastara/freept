# FreePT — Hackathon Build Runbook (2.5 hours)

**FreePT** is a ChatGPT-style web app whose differentiator is a **live free-model
selector**: the list of models is fetched from OpenRouter and filtered to free ones
programmatically, so it auto-updates as OpenRouter's catalogue changes — no hardcoded list.

The scaffold is **already done** (this repo): Next.js 15 (App Router, TS) + Tailwind v4 +
shadcn/ui + prompt-kit components, with two OpenRouter API routes stubbed and ready:

- `GET /api/models` — returns free models (`pricing.prompt === "0" && completion === "0"`).
- `POST /api/chat` — streams a chat completion from the selected model.

Goal today: a working chat app with a model selector, deployed to Vercel.

---

## Pre-flight (do this BEFORE the clock starts)

- [ ] Put your real key in `.env.local`: `OPENROUTER_API_KEY=sk-or-...`
- [ ] Add `OPENROUTER_API_KEY` in Vercel → Project → Settings → Environment Variables.
- [ ] `npm run dev` boots clean at http://localhost:3000.
- [ ] Sanity-check the API: `curl localhost:3000/api/models` returns a JSON array.

> Time budget below is 150 min. Each block has a "done when" so you don't overrun.

---

## 0:00–0:15 — Backend smoke test (15 min)
**Goal: prove both routes work before touching UI.**
- `curl -s localhost:3000/api/models | head` → array of `{id,name,context_length,description}`.
- Test streaming:
  ```bash
  curl -N localhost:3000/api/chat -H 'Content-Type: application/json' \
    -d '{"model":"<paste an id from /api/models>","messages":[{"role":"user","content":"hi"}]}'
  ```
- **Done when:** you see tokens stream back from `/api/chat`.

## 0:15–0:45 — Model selector (30 min)
**Goal: a dropdown of free models wired to state.**
- Make `src/app/page.tsx` a client component (`"use client"`).
- On mount, `fetch("/api/models")` → store in state; type as `Model[]` (`src/lib/types.ts`).
- Render a shadcn `Select` (run `npx shadcn@latest add select`) of model names.
- Hold `selectedModel` in state; default to the first item.
- (Stretch) persist `selectedModel` to `localStorage`.
- **Done when:** switching the dropdown updates the active model id in React state.

## 0:45–1:30 — Core chat loop (45 min — the heart of the app)
**Goal: send messages, stream replies.**
- Keep `messages: ChatMessage[]` in state.
- Build the input with prompt-kit `PromptInput` (`src/components/ui/prompt-input.tsx`).
- On submit:
  1. Append the user message to state.
  2. `POST /api/chat` with `{ messages, model: selectedModel }`.
  3. Read `res.body.getReader()`, decode chunks, append to a streaming assistant message.
- Render the thread with prompt-kit `ChatContainer` + `Message`.
- **Done when:** you can hold a multi-turn conversation and the model switcher changes who replies.

## 1:30–2:00 — Rendering polish (30 min)
- Render assistant text with prompt-kit `Markdown` + `CodeBlock` (Typography plugin is already configured).
- Show `Loader` while a response is streaming.
- Add `ScrollButton` for long threads (auto-scroll to bottom).
- **Done when:** markdown + fenced code render correctly and the view follows the stream.

## 2:00–2:20 — UX + resilience (20 min)
- Empty/welcome state when there are no messages.
- Disable the input while streaming; re-enable on completion.
- Error toast / inline message if a request fails (bad key, model error).
- Show the active model name in a header.
- **Done when:** a failed request doesn't crash the app and the active model is visible.

## 2:20–2:30 — Ship (10 min)
- Commit and push to `main` → Vercel auto-deploys (repo connected to Vercel).
- Confirm `OPENROUTER_API_KEY` is set in Vercel.
- Smoke-test the live URL: load models, send a message.
- **Done when:** the deployed URL holds a conversation end-to-end.

---

## Stretch (only if ahead of schedule)
- Conversation history in `localStorage`.
- Copy-message button (prompt-kit supports it).
- Stop-generation button (abort the fetch / reader).
- Model context-length badge next to the selector.
- System-prompt field.

## Gotchas
- `/api/chat` requires a `model` (returns 400 if missing) — always send the selected id.
- Free models can be rate-limited or occasionally fail; surface errors, don't swallow them.
- The `context_length` field may be `null` for some models — guard before rendering a badge.
- Responses stream as `text/plain` (not SSE) — read the raw body, no `data:` parsing needed.
