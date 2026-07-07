import type React from "react";

export function Page(props: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  headerClassName?: string;
  titleRowClassName?: string;
  actionsClassName?: string;
}) {
  return (
    <div className="pf-page">
      <div className={["pf-page__header", props.headerClassName].filter(Boolean).join(" ")}>
        <div className={["pf-row", "pf-row--baseline", props.titleRowClassName].filter(Boolean).join(" ")} style={{ justifyContent: "space-between" }}>
          <h2>{props.title}</h2>
          {props.actions ? <div className={["pf-row", props.actionsClassName].filter(Boolean).join(" ")}>{props.actions}</div> : null}
        </div>
        {props.subtitle ? <div className="pf-subtitle">{props.subtitle}</div> : null}
      </div>
      {props.children}
    </div>
  );
}
