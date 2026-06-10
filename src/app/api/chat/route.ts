import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const encoder = new TextEncoder();

type UrlSource = { url: string; title: string };

function toolLine(state: string, error?: string): Uint8Array {
  const payload = error
    ? JSON.stringify({ __tool: state, error })
    : JSON.stringify({ __tool: state });
  return encoder.encode(payload + "\n");
}

function sourcesLine(sources: UrlSource[]): Uint8Array {
  return encoder.encode(JSON.stringify({ __sources: sources }) + "\n");
}

async function streamPlain(
  model: string,
  messages: object[],
  controller: ReadableStreamDefaultController,
) {
  const msgs = messages as Parameters<typeof client.chat.completions.create>[0]["messages"];
  const stream = await client.chat.completions.create({ model, messages: msgs, stream: true });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) controller.enqueue(encoder.encode(text));
  }
}

// Strips <longcat_tool_call>...</longcat_tool_call> blocks that some OpenRouter
// models emit inline in their content stream when invoking the web search plugin.
// Works across chunk boundaries by buffering a small tail.
class ToolCallFilter {
  private buffer = "";
  private inside = false;
  private static readonly OPEN = "<longcat_tool_call>";
  private static readonly CLOSE = "</longcat_tool_call>";

  feed(text: string): string {
    this.buffer += text;
    let out = "";
    while (true) {
      if (!this.inside) {
        const i = this.buffer.indexOf(ToolCallFilter.OPEN);
        if (i === -1) {
          const safe = Math.max(0, this.buffer.length - (ToolCallFilter.OPEN.length - 1));
          out += this.buffer.slice(0, safe);
          this.buffer = this.buffer.slice(safe);
          break;
        }
        out += this.buffer.slice(0, i);
        this.buffer = this.buffer.slice(i);
        this.inside = true;
      } else {
        const i = this.buffer.indexOf(ToolCallFilter.CLOSE);
        if (i === -1) {
          this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - (ToolCallFilter.CLOSE.length - 1)));
          break;
        }
        this.buffer = this.buffer.slice(i + ToolCallFilter.CLOSE.length);
        this.inside = false;
      }
    }
    return out;
  }

  flush(): string {
    if (this.inside) return "";
    const r = this.buffer;
    this.buffer = "";
    return r;
  }
}

async function streamWithWebSearch(
  model: string,
  messages: object[],
  controller: ReadableStreamDefaultController,
) {
  const msgs = messages as Parameters<typeof client.chat.completions.create>[0]["messages"];
  const stream = await client.chat.completions.create({
    model, messages: msgs, stream: true,
    tools: [{ type: "openrouter:web_search" }],
  } as unknown as Parameters<typeof client.chat.completions.create>[0] & { stream: true });

  // Collect source annotations from pre-content chunks. On the first raw content
  // token, emit output-available (compact, unchanged size) then a __sources line
  // so the client never has to parse a variably-sized JSON header mid-stream.
  const sources: UrlSource[] = [];
  const filter = new ToolCallFilter();
  let headerSent = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
    const raw = (delta?.content as string | null) ?? "";

    if (!headerSent) {
      const annotations = delta?.annotations as Array<{ type: string; url_citation?: { url: string; title: string } }> | undefined;
      if (annotations) {
        for (const a of annotations) {
          if (a.type === "url_citation" && a.url_citation?.url) {
            sources.push({ url: a.url_citation.url, title: a.url_citation.title ?? a.url_citation.url });
          }
        }
      }
    }

    // Use `raw` (not filtered output) to detect the first content token —
    // the filter's partial-tag guard can delay output and must not postpone headers.
    if (raw && !headerSent) {
      controller.enqueue(toolLine("output-available"));
      if (sources.length) controller.enqueue(sourcesLine(sources));
      headerSent = true;
    }

    const text = filter.feed(raw);
    if (text) controller.enqueue(encoder.encode(text));
  }

  const tail = filter.flush();
  if (tail) controller.enqueue(encoder.encode(tail));

  if (!headerSent) {
    controller.enqueue(toolLine("output-available"));
    if (sources.length) controller.enqueue(sourcesLine(sources));
  }
}

export async function POST(req: NextRequest) {
  const { messages, model, webSearch } = await req.json();

  if (!model) {
    return new Response("Missing model", { status: 400 });
  }

  const readable = new ReadableStream({
    async start(controller) {
      if (!webSearch) {
        await streamPlain(model, messages, controller);
        controller.close();
        return;
      }

      controller.enqueue(toolLine("input-streaming"));

      try {
        await streamWithWebSearch(model, messages, controller);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Web search plugin failed";
        controller.enqueue(toolLine("output-error", msg));
        try {
          await streamPlain(model, messages, controller);
        } catch {
          // If fallback also fails the client will handle the empty/partial stream
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
