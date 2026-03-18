import { Fragment } from "react";

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "code"; code: string };

export function RichText(props: { text: string }) {
  const blocks = toBlocks(props.text);
  return (
    <div className="pf-richtext">
      {blocks.map((b, i) => (
        <Fragment key={i}>{renderBlock(b)}</Fragment>
      ))}
    </div>
  );
}

function renderBlock(b: Block) {
  if (b.kind === "h1") return <h1 className="pf-h1">{b.text}</h1>;
  if (b.kind === "h2") return <h2 className="pf-h2">{b.text}</h2>;
  if (b.kind === "h3") return <h3 className="pf-h3">{b.text}</h3>;
  if (b.kind === "quote") return <div className="pf-quote">{b.text}</div>;
  if (b.kind === "code") return <pre className="pf-code"><code>{b.code}</code></pre>;
  if (b.kind === "ul") return <ul className="pf-ul">{b.items.map((it, idx) => <li key={idx}>{it}</li>)}</ul>;
  return <p className="pf-p">{b.text}</p>;
}

function toBlocks(input: string): Block[] {
  const text = (input ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const out: Block[] = [];

  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];
  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  const flushPara = () => {
    const t = paraBuf.join(" ").replace(/\s+/g, " ").trim();
    if (t) out.push({ kind: "p", text: t });
    paraBuf = [];
  };
  const flushList = () => {
    if (listBuf.length) out.push({ kind: "ul", items: listBuf });
    listBuf = [];
  };
  const flushCode = () => {
    const c = codeBuf.join("\n").replace(/\s+$/g, "");
    out.push({ kind: "code", code: c });
    codeBuf = [];
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      if (inCode) {
        inCode = false;
        flushCode();
      } else {
        flushPara();
        flushList();
        inCode = true;
      }
      i += 1;
      continue;
    }

    if (inCode) {
      codeBuf.push(raw);
      i += 1;
      continue;
    }

    const t = line.trim();
    if (!t) {
      flushPara();
      flushList();
      i += 1;
      continue;
    }

    if (t.startsWith("# ")) {
      flushPara();
      flushList();
      out.push({ kind: "h1", text: t.slice(2).trim() });
      i += 1;
      continue;
    }
    if (t.startsWith("## ")) {
      flushPara();
      flushList();
      out.push({ kind: "h2", text: t.slice(3).trim() });
      i += 1;
      continue;
    }
    if (t.startsWith("### ")) {
      flushPara();
      flushList();
      out.push({ kind: "h3", text: t.slice(4).trim() });
      i += 1;
      continue;
    }
    if (t.startsWith(">")) {
      flushPara();
      flushList();
      out.push({ kind: "quote", text: t.replace(/^>\s?/, "").trim() });
      i += 1;
      continue;
    }
    if (t.startsWith("- ")) {
      flushPara();
      listBuf.push(t.slice(2).trim());
      i += 1;
      continue;
    }

    flushList();
    paraBuf.push(t);
    i += 1;
  }

  if (inCode) {
    inCode = false;
    flushCode();
  }
  flushPara();
  flushList();
  return out;
}

