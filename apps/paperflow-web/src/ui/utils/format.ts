export function formatDateTime(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    return input;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function readingTimeMinutes(text: string): number {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return 0;
  const words = cleaned.split(" ").length;
  return Math.max(1, Math.round(words / 200));
}

export function excerpt(text: string, maxLen: number): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

export function sourceMeta(source: string | undefined): { icon: string; label: string } {
  const s = (source ?? "").toLowerCase();
  if (s === "scheduler") return { icon: "🗓️", label: "Daily" };
  if (s === "agent-demo") return { icon: "🤖", label: "Agent" };
  if (s.includes("manual")) return { icon: "✍️", label: "Manual" };
  return { icon: "📝", label: source || "Post" };
}

