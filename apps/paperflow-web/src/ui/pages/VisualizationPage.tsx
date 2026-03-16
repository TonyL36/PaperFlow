import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { useNavigate } from "react-router-dom";
import { apiListPosts } from "../data/api";
import type { Post } from "../data/types";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";

type NodeDatum = {
  id: string;
  title: string;
  publishedAt: Date;
  source: string;
  x: number;
  y: number;
};

export function VisualizationPage() {
  const nav = useNavigate();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { state, reload } = useAsyncData((signal) => apiListPosts(1, 60, signal), []);
  const posts: Post[] = state.data?.items ?? [];

  const nodes = useMemo(() => {
    const parsed = posts.map((p, i) => {
      const dt = new Date(p.publishedAt);
      return {
        id: p.postId,
        title: p.title,
        publishedAt: isNaN(dt.getTime()) ? new Date(Date.now() - i * 86400000) : dt,
        source: p.source,
        x: 0,
        y: 0
      } satisfies NodeDatum;
    });

    const min = d3.min(parsed, (d) => d.publishedAt.getTime()) ?? Date.now();
    const max = d3.max(parsed, (d) => d.publishedAt.getTime()) ?? Date.now();
    const xScale = d3.scaleTime().domain([new Date(min), new Date(max)]).range([60, 1040]).nice();
    const yScale = d3.scalePoint<string>().domain(Array.from(new Set(parsed.map((d) => d.source)))).range([80, 560]).padding(0.8);

    return parsed.map((d) => ({
      ...d,
      x: xScale(d.publishedAt),
      y: yScale(d.source) ?? 320
    }));
  }, [posts]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = 1100;
    const height = 640;

    const svg = d3.select(svgEl);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const bg = svg.append("rect").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height).attr("fill", "#fff");

    const min = d3.min(nodes, (d) => d.publishedAt.getTime()) ?? Date.now();
    const max = d3.max(nodes, (d) => d.publishedAt.getTime()) ?? Date.now();
    const xScale = d3.scaleTime().domain([new Date(min), new Date(max)]).range([60, 1040]).nice();
    const sources = Array.from(new Set(nodes.map((d) => d.source)));
    const yScale = d3.scalePoint<string>().domain(sources).range([80, 560]).padding(0.8);

    const xAxis = d3.axisBottom(xScale).ticks(6).tickFormat((d) => d3.timeFormat("%m-%d")(d as Date));
    const yAxis = d3.axisLeft(yScale);

    svg.append("g").attr("transform", "translate(0,600)").call(xAxis as any);
    svg.append("g").attr("transform", "translate(60,0)").call(yAxis as any);

    const tooltip = d3
      .select(svgEl.parentElement)
      .append("div")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "rgba(0,0,0,0.75)")
      .style("color", "#fff")
      .style("padding", "8px 10px")
      .style("border-radius", "6px")
      .style("font-size", "12px")
      .style("display", "none");

    const color = d3.scaleOrdinal<string, string>().domain(sources).range(d3.schemeTableau10);

    svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", 8)
      .attr("fill", (d) => color(d.source))
      .attr("stroke", "#222")
      .attr("stroke-width", 0.5)
      .on("mousemove", (event, d) => {
        const rect = (svgEl.parentElement as HTMLElement).getBoundingClientRect();
        tooltip
          .style("display", "block")
          .style("left", `${event.clientX - rect.left + 12}px`)
          .style("top", `${event.clientY - rect.top + 12}px`)
          .html(
            `<div style="font-weight:700;margin-bottom:4px;">${escapeHtml(d.title)}</div>` +
              `<div>postId: ${escapeHtml(d.id)}</div>` +
              `<div>source: ${escapeHtml(d.source)}</div>` +
              `<div>date: ${escapeHtml(d3.timeFormat("%Y-%m-%d %H:%M")(d.publishedAt))}</div>`
          );
      })
      .on("mouseleave", () => {
        tooltip.style("display", "none");
      })
      .on("click", (_, d) => {
        nav(`/posts/${encodeURIComponent(d.id)}`);
      });

    bg.on("click", () => {
      tooltip.style("display", "none");
    });

    return () => {
      tooltip.remove();
    };
  }, [nodes, nav]);

  return (
    <Page title="可视化" subtitle="示例：帖子时间 × 来源分组散点图；点击节点进入帖子详情。">
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      <Card padded={false}>
        <div style={{ position: "relative", padding: 8 }}>
          <svg ref={svgRef} width="100%" height="640" />
        </div>
      </Card>
    </Page>
  );
}

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
