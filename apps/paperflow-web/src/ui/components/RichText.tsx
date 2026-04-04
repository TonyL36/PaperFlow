import { Fragment } from "react";

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
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
  if (b.kind === "h1") return <h1 className="pf-h1">{renderInline(b.text)}</h1>;
  if (b.kind === "h2") return <h2 className="pf-h2">{renderInline(b.text)}</h2>;
  if (b.kind === "h3") return <h3 className="pf-h3">{renderInline(b.text)}</h3>;
  if (b.kind === "quote") return <div className="pf-quote">{renderInline(b.text)}</div>;
  if (b.kind === "code") return <pre className="pf-code"><code>{b.code}</code></pre>;
  if (b.kind === "ul") return <ul className="pf-ul">{b.items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}</ul>;
  if (b.kind === "ol") return <ol className="pf-ul">{b.items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}</ol>;
  return <p className="pf-p">{renderInline(b.text)}</p>;
}

function renderInline(text: string) {
  const out: Array<string | JSX.Element> = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(<strong key={`${m.index}-b`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(<code key={`${m.index}-c`}>{token.slice(1, -1)}</code>);
    } else {
      out.push(token);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
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
  let orderBuf: string[] = [];

  const flushPara = () => {
    const t = paraBuf.join(" ").replace(/\s+/g, " ").trim();
    if (t) out.push({ kind: "p", text: t });
    paraBuf = [];
  };
  const flushList = () => {
    if (listBuf.length) out.push({ kind: "ul", items: listBuf });
    listBuf = [];
  };
  const flushOrder = () => {
    if (orderBuf.length) out.push({ kind: "ol", items: orderBuf });
    orderBuf = [];
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
        flushOrder();
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
      flushOrder();
      i += 1;
      continue;
    }

    if (t.startsWith("# ")) {
      flushPara();
      flushList();
      flushOrder();
      out.push({ kind: "h1", text: t.slice(2).trim() });
      i += 1;
      continue;
    }
    if (t.startsWith("## ")) {
      flushPara();
      flushList();
      flushOrder();
      out.push({ kind: "h2", text: t.slice(3).trim() });
      i += 1;
      continue;
    }
    if (t.startsWith("### ")) {
      flushPara();
      flushList();
      flushOrder();
      out.push({ kind: "h3", text: t.slice(4).trim() });
      i += 1;
      continue;
    }
    if (t.startsWith(">")) {
      flushPara();
      flushList();
      flushOrder();
      out.push({ kind: "quote", text: t.replace(/^>\s?/, "").trim() });
      i += 1;
      continue;
    }
    if (t.startsWith("- ")) {
      flushPara();
      flushOrder();
      listBuf.push(t.slice(2).trim());
      i += 1;
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      flushPara();
      flushList();
      orderBuf.push(t.replace(/^\d+\.\s+/, "").trim());
      i += 1;
      continue;
    }

    flushList();
    flushOrder();
    paraBuf.push(t);
    i += 1;
  }

  if (inCode) {
    inCode = false;
    flushCode();
  }
  flushPara();
  flushList();
  flushOrder();
  return out;
}
