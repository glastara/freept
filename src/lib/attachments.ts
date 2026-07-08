import { Attachment } from "./types";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // per file

// Plain-text-ish files we can read directly and send as a text block.
const TEXT_EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml",
  "html", "htm", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp",
  "h", "hpp", "go", "rs", "rb", "php", "sh", "bash", "zsh", "sql", "log",
  "ini", "toml", "env", "conf", "srt", "vtt",
]);

const RASTER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load SVG"));
    img.src = src;
  });
}

// Vision models reject image/svg+xml, so paint the SVG onto a canvas and export
// a PNG they can actually read. A white backdrop keeps transparent SVGs visible.
async function rasterizeSvgToPng(file: File): Promise<string> {
  const source = await readAsText(file);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || img.width || 512;
    const height = img.naturalHeight || img.height || 512;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type ProcessResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; error: string };

// Turn a dropped/selected File into an Attachment, deciding how it will reach
// the model: images as data URLs, PDFs via OpenRouter's file-parser, and
// everything text-bearing (docx, plain text, code) extracted to a text block
// so it works on any model — not just vision ones.
export async function processFile(
  file: File,
  opts: { supportsImages: boolean }
): Promise<ProcessResult> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `"${file.name}" is larger than 10MB and was skipped.` };
  }

  const type = file.type;
  const ext = extensionOf(file.name);
  const isRasterImage =
    (type.startsWith("image/") && type !== "image/svg+xml") ||
    (!type && RASTER_IMAGE_EXTENSIONS.has(ext));

  if (isRasterImage) {
    if (!opts.supportsImages) {
      return {
        ok: false,
        error: `"${file.name}" is an image, but this model can't read images — switch to a vision model.`,
      };
    }
    const normalizedExt = ext === "jpg" ? "jpeg" : ext;
    return {
      ok: true,
      attachment: {
        name: file.name,
        mediaType: type || `image/${normalizedExt || "png"}`,
        dataUrl: await readAsDataUrl(file),
      },
    };
  }

  if (type === "image/svg+xml" || ext === "svg") {
    if (opts.supportsImages) {
      try {
        return {
          ok: true,
          attachment: { name: file.name, mediaType: "image/png", dataUrl: await rasterizeSvgToPng(file) },
        };
      } catch {
        // Fall through to sending the SVG source as text.
      }
    }
    return {
      ok: true,
      attachment: { name: file.name, mediaType: "text/plain", text: await readAsText(file) },
    };
  }

  if (type === "application/pdf" || ext === "pdf") {
    return {
      ok: true,
      attachment: { name: file.name, mediaType: "application/pdf", dataUrl: await readAsDataUrl(file) },
    };
  }

  const isDocx =
    ext === "docx" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (isDocx) {
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      const text = value.trim();
      if (!text) return { ok: false, error: `"${file.name}" appears to be empty.` };
      return { ok: true, attachment: { name: file.name, mediaType: "text/plain", text } };
    } catch {
      return { ok: false, error: `Couldn't read "${file.name}" — the Word document may be corrupt.` };
    }
  }

  // Legacy binary .doc has no reliable in-browser parser.
  if (ext === "doc" || type === "application/msword") {
    return {
      ok: false,
      error: `Legacy ".doc" isn't supported — please save "${file.name}" as .docx or PDF.`,
    };
  }

  const isTextLike =
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    TEXT_EXTENSIONS.has(ext);
  if (isTextLike) {
    return {
      ok: true,
      attachment: { name: file.name, mediaType: "text/plain", text: await readAsText(file) },
    };
  }

  return { ok: false, error: `"${file.name}" is an unsupported file type.` };
}

// The `accept` string for the native file picker. Drag-and-drop ignores this
// (processFile does the real gating), so it only needs to be roughly right.
export function acceptForModel(supportsImages: boolean): string {
  return [
    supportsImages ? "image/png,image/jpeg,image/gif,image/webp" : "",
    "image/svg+xml",
    "application/pdf",
    ".doc,.docx",
    "text/plain,text/markdown,text/csv,.md,.markdown,.csv,.json,.xml,.log,.yaml,.yml,.txt",
  ]
    .filter(Boolean)
    .join(",");
}
