import { NextRequest } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const encoder = new TextEncoder();

function toolLine(state: string, error?: string): Uint8Array {
  const payload = error
    ? JSON.stringify({ __tool: state, error })
    : JSON.stringify({ __tool: state });
  return encoder.encode(payload + "\n");
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

  // Emit output-available on the first content token — that's when the web
  // search phase ends and the model starts responding. The client expects this
  // header BEFORE any text, so it must be sent here, not after the loop.
  let headerSent = false;
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text && !headerSent) {
      controller.enqueue(toolLine("output-available"));
      headerSent = true;
    }
    if (text) controller.enqueue(encoder.encode(text));
  }
  if (!headerSent) controller.enqueue(toolLine("output-available"));
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

      // Web search: input-streaming first, then output-available is emitted
      // inside streamWithWebSearch right before text starts, so the client's
      // two-header protocol is satisfied before any content arrives.
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
