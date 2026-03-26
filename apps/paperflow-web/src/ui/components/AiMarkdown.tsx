import React from "react";

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; code: string }
  | { type: "paragraph"; text: string };

function parseBlocks(input: string): Block[] {
  const src = (input || "").replace(/\r\n/g, "\n");
  const parts = src.split("```");
  const blocks: Block[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (i % 2 === 1) {
      const code = part.replace(/^\w+\n/, "").trimEnd();
      if (code) {
        blocks.push({ type: "code", code });
      }
      continue;
    }
    const lines = part.split("\n");
    let cursor = 0;
    while (cursor < lines.length) {
      const line = lines[cursor].trimEnd();
      if (!line.trim()) {
        cursor += 1;
        continue;
      }
      const h3 = /^###\s+(.+)$/.exec(line);
      const h2 = /^##\s+(.+)$/.exec(line);
      const h1 = /^#\s+(.+)$/.exec(line);
      if (h3) {
        blocks.push({ type: "heading", level: 3, text: h3[1].trim() });
        cursor += 1;
        continue;
      }
      if (h2) {
        blocks.push({ type: "heading", level: 2, text: h2[1].trim() });
        cursor += 1;
        continue;
      }
      if (h1) {
        blocks.push({ type: "heading", level: 1, text: h1[1].trim() });
        cursor += 1;
        continue;
      }
      if (line.trim().startsWith(">")) {
        const quoteLines: string[] = [];
        while (cursor < lines.length && lines[cursor].trim().startsWith(">")) {
          quoteLines.push(lines[cursor].trim().replace(/^>\s?/, ""));
          cursor += 1;
        }
        blocks.push({ type: "quote", text: quoteLines.join("\n") });
        continue;
      }
      if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        const ordered = /^\s*\d+\.\s+/.test(line);
        const items: string[] = [];
        while (
          cursor < lines.length &&
          (ordered ? /^\s*\d+\.\s+/.test(lines[cursor]) : /^\s*[-*]\s+/.test(lines[cursor]))
        ) {
          items.push(lines[cursor].trim().replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""));
          cursor += 1;
        }
        blocks.push({ type: "list", ordered, items });
        continue;
      }
      const paragraphLines: string[] = [];
      while (cursor < lines.length && lines[cursor].trim()) {
        paragraphLines.push(lines[cursor].trim());
        cursor += 1;
      }
      blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
    }
  }
  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const m = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)]+)\))/.exec(rest);
    if (!m) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) {
      nodes.push(rest.slice(0, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`b_${key++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={`c_${key++}`}>{token.slice(1, -1)}</code>);
    } else {
      const mm = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(token);
      if (mm) {
        nodes.push(
          <a key={`a_${key++}`} href={mm[2]} target="_blank" rel="noopener noreferrer">
            {mm[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }
    rest = rest.slice(m.index + token.length);
  }
  return nodes;
}

export function AiMarkdown(props: { content: string }) {
  const blocks = parseBlocks(props.content);
  return (
    <div className="pf-md">
      {blocks.map((block, idx) => {
        if (block.type === "heading" && block.level === 1) return <h4 key={idx}>{renderInline(block.text)}</h4>;
        if (block.type === "heading" && block.level === 2) return <h5 key={idx}>{renderInline(block.text)}</h5>;
        if (block.type === "heading") return <h6 key={idx}>{renderInline(block.text)}</h6>;
        if (block.type === "quote") return <blockquote key={idx}>{block.text}</blockquote>;
        if (block.type === "code") return <pre key={idx}><code>{block.code}</code></pre>;
        if (block.type === "list" && block.ordered) {
          return <ol key={idx}>{block.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}</ol>;
        }
        if (block.type === "list") {
          return <ul key={idx}>{block.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}</ul>;
        }
        return <p key={idx}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

