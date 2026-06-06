# FreePT

A clean, fast chat interface for free AI models — powered by [OpenRouter](https://openrouter.ai).

FreePT automatically fetches every model on OpenRouter where both prompt and completion pricing are $0, so you always have access to the latest free models without any configuration.

## Features

- Chat with any free model available on OpenRouter
- Conversation history with a collapsible sidebar
- Streaming responses
- Markdown rendering with syntax-highlighted code blocks
- No account required — just bring your own OpenRouter API key

## Getting Started

### 1. Get an OpenRouter API key

Sign up at [openrouter.ai](https://openrouter.ai) — it's free.

### 2. Clone and install

```bash
git clone https://github.com/glastara/freept.git
cd freept
npm install
```

### 3. Add your API key

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your key:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [OpenRouter](https://openrouter.ai) via the OpenAI SDK

## License

MIT — use it, modify it, ship it, go for it.
