import type React from "react";

type Tone = "default" | "danger" | "warning";

export function Alert(props: { title?: React.ReactNode; tone?: Tone; children: React.ReactNode; className?: string }) {
  const { title, tone = "default", children, className } = props;
  const classes = ["pf-alert", tone === "danger" ? "pf-alert--danger" : null, tone === "warning" ? "pf-alert--warning" : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} role={tone === "danger" ? "alert" : undefined}>
      {title ? <div className="pf-alert__title">{title}</div> : null}
      <div>{children}</div>
    </div>
  );
}
