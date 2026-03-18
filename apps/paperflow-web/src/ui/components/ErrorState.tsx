import type React from "react";
import { normalizeError } from "../utils/errors";
import { Alert } from "./Alert";
import { Button } from "./Button";

export function ErrorState(props: { error: unknown; title?: React.ReactNode; hint?: React.ReactNode; onRetry?: () => void }) {
  const n = normalizeError(props.error);
  const meta = [n.code ? `code=${n.code}` : null, n.requestId ? `requestId=${n.requestId}` : null].filter(Boolean).join(" · ");
  return (
    <Alert title={props.title ?? "加载失败"} tone="danger">
      <div className="pf-grid" style={{ gap: 8 }}>
        <div>
          <div>{n.message}</div>
          {meta ? <div className="pf-muted2" style={{ marginTop: 4 }}>{meta}</div> : null}
        </div>
        {props.hint ? <div className="pf-muted">{props.hint}</div> : null}
        {props.onRetry ? (
          <div>
            <Button onClick={props.onRetry}>重试</Button>
          </div>
        ) : null}
      </div>
    </Alert>
  );
}
