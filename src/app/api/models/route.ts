import { NextResponse } from "next/server";

export async function GET() {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 }, // re-fetch at most once per hour
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach OpenRouter" },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch models from OpenRouter" },
      { status: 502 }
    );
  }

  const { data } = await res.json();

  // Filter to models where both prompt and completion are free
  const freeModels = data
    .filter(
      (m: any) =>
        m.pricing?.prompt === "0" && m.pricing?.completion === "0"
    )
    .map((m: any) => ({
      id: m.id,
      name: m.name ?? m.id,
      context_length: m.context_length ?? null,
      description: m.description ?? "",
      supportsWebSearch:
        Array.isArray(m.supported_parameters) &&
        m.supported_parameters.includes("tools"),
      supportsImages:
        Array.isArray(m.architecture?.input_modalities) &&
        m.architecture.input_modalities.includes("image"),
    }));

  return NextResponse.json(freeModels);
}
