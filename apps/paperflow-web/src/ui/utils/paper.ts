import type { PaperFormat } from "../data/types";

function normalizePdfUrl(raw: string): string | null {
  const value = raw.trim().replace(/[)\],.;]+$/g, "");
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

export function extractPdfUrlFromContent(content: string | null | undefined): string | null {
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  for (const row of lines) {
    const line = row.trim();
    if (!line) continue;
    const markdownMatch = line.match(/\[PDF\]\((https?:\/\/[^\s)]+)\)/i);
    if (markdownMatch?.[1]) {
      const normalized = normalizePdfUrl(markdownMatch[1]);
      if (normalized) return normalized;
    }
    const plainMatch = line.match(/PDF\s*[:：]\s*(https?:\/\/\S+)/i);
    if (plainMatch?.[1]) {
      const normalized = normalizePdfUrl(plainMatch[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

export function resolvePostPdfUrl(
  formats: PaperFormat[] | null | undefined,
  content: string | null | undefined
): string | null {
  const pdfFromFormats = formats?.find((it) => it.type === "pdf" && !!it.url)?.url ?? null;
  const normalizedFormatUrl = pdfFromFormats ? normalizePdfUrl(pdfFromFormats) : null;
  if (normalizedFormatUrl) return normalizedFormatUrl;
  return extractPdfUrlFromContent(content);
}
