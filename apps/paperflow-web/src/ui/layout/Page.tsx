import type React from "react";

export function Page(props: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="pf-page">
      <div className="pf-page__header">
        <div className="pf-row pf-row--baseline" style={{ justifyContent: "space-between" }}>
          <h2>{props.title}</h2>
          {props.actions ? <div className="pf-row">{props.actions}</div> : null}
        </div>
        {props.subtitle ? <div className="pf-subtitle">{props.subtitle}</div> : null}
      </div>
      {props.children}
    </div>
  );
}
