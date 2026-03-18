import type React from "react";

export function EmptyState(props: { title?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="pf-empty">
      {props.title ? <div style={{ fontWeight: 700, marginBottom: 4 }}>{props.title}</div> : null}
      {props.children ? <div>{props.children}</div> : null}
    </div>
  );
}
