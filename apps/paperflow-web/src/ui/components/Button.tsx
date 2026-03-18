import type React from "react";

type Variant = "default" | "primary" | "danger";

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const { variant = "default", className, ...rest } = props;
  const classes = ["pf-button", variant === "primary" ? "pf-button--primary" : null, variant === "danger" ? "pf-button--danger" : null, className]
    .filter(Boolean)
    .join(" ");
  return <button {...rest} className={classes} />;
}
