import type React from "react";

export function Card(props: { children: React.ReactNode; padded?: boolean; className?: string }) {
  const { children, padded = true, className } = props;
  const classes = ["pf-card", padded ? "pf-card--padded" : null, className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
