export function Spinner(props: { label?: string }) {
  return (
    <div className="pf-row">
      <div className="pf-spinner" aria-label={props.label ?? "加载中"} />
      {props.label ? <div className="pf-muted">{props.label}</div> : null}
    </div>
  );
}
