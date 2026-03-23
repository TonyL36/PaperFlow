from __future__ import annotations

import re
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

import httpx
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from app.agents.checkpoint import FileCheckpointStore
from app.agents.models import (
    AgentPdfQaResponse,
    CandidatePaper,
    LearningPlan,
    LearningStage,
    WorkflowRequest,
    WorkflowResponse,
    WorkflowState,
    WorkflowTrigger,
)

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "how",
    "into",
    "new",
    "of",
    "on",
    "or",
    "paper",
    "study",
    "the",
    "to",
    "with",
}


class GraphState(TypedDict, total=False):
    run_id: str
    trigger: str
    status: str
    messages: list[str]
    route_history: list[str]
    user_profile: dict[str, Any]
    goals: list[str]
    question: str
    requested_count: int
    search_queries: list[str]
    candidate_pool: list[dict[str, Any]]
    candidates: list[dict[str, Any]]
    approved: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    existing_library: list[dict[str, Any]]
    answer: str
    citations: list[str]
    learning_plan: dict[str, Any] | None
    waiting_for_human: bool
    need_more_search: bool
    current_node: str
    meta: dict[str, Any]


def tokenize(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-zA-Z0-9\-\+]+", text.lower()) if token and token not in STOPWORDS]


def normalize_title(title: str) -> str:
    lowered = re.sub(r"[_\-]+", " ", title.lower())
    cleaned = re.sub(r"[^a-z0-9\u4e00-\u9fff\s]+", " ", lowered)
    return re.sub(r"\s+", " ", cleaned).strip()


def similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, normalize_title(left), normalize_title(right)).ratio()


def overlap_score(query_tokens: Iterable[str], text: str) -> float:
    query = set(query_tokens)
    if not query:
        return 0.0
    target = set(tokenize(text))
    if not target:
        return 0.0
    return len(query & target) / len(query)


def slugify(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "_", value.strip())
    text = re.sub(r"_+", "_", text).strip("_")
    return text[:80] or "paper"


class LocalPaperCorpus:
    def __init__(self, uploads_dir: Path) -> None:
        self.uploads_dir = uploads_dir
        self.uploads_dir.mkdir(parents=True, exist_ok=True)

    def search(self, queries: list[str], limit: int) -> list[CandidatePaper]:
        files = sorted(self.uploads_dir.glob("*.pdf"), key=lambda item: item.stat().st_mtime, reverse=True)
        if not files:
            return []

        ranked: list[tuple[float, CandidatePaper]] = []
        query_tokens = tokenize(" ".join(queries))
        now_ts = datetime.utcnow().timestamp()
        for path in files:
            title = re.sub(r"^[0-9a-f\-]{36}_", "", path.stem, flags=re.IGNORECASE)
            pretty_title = title.replace("_", " ").strip()
            base_score = overlap_score(query_tokens, pretty_title) if query_tokens else 0.35
            age_days = max(0.0, (now_ts - path.stat().st_mtime) / 86400)
            recency_bonus = max(0.0, 0.25 - age_days / 3650)
            score = base_score + recency_bonus
            ranked.append(
                (
                    score,
                    CandidatePaper(
                        paper_id=slugify(path.stem),
                        title=pretty_title,
                        source="local-corpus",
                        local_path=str(path),
                        year=self._guess_year(pretty_title),
                        tags=self._guess_tags(pretty_title),
                        rationale=f"匹配本地语料，查询词命中率 {base_score:.2f}",
                    ),
                )
            )

        ranked.sort(key=lambda item: item[0], reverse=True)
        selected: list[CandidatePaper] = []
        seen_titles: set[str] = set()
        for score, paper in ranked:
            normalized = normalize_title(paper.title)
            if normalized in seen_titles:
                continue
            seen_titles.add(normalized)
            paper.score = round(score, 3)
            selected.append(paper)
            if len(selected) >= limit:
                break
        return selected

    @staticmethod
    def _guess_year(title: str) -> int | None:
        match = re.search(r"(20\d{2})", title)
        return int(match.group(1)) if match else None

    @staticmethod
    def _guess_tags(title: str) -> list[str]:
        tokens = tokenize(title)
        counts = Counter(tokens)
        return [token for token, _ in counts.most_common(4)]


class ArxivClient:
    base_url = "https://export.arxiv.org/api/query"

    async def search(self, queries: list[str], limit: int) -> list[CandidatePaper]:
        if not queries:
            return []

        collected: list[CandidatePaper] = []
        seen_ids: set[str] = set()
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            for query in queries[:3]:
                params = {
                    "search_query": f"all:{query}",
                    "start": 0,
                    "max_results": max(3, min(limit, 8)),
                    "sortBy": "submittedDate",
                    "sortOrder": "descending",
                }
                response = await client.get(self.base_url, params=params, headers={"User-Agent": "PaperFlow/0.1"})
                response.raise_for_status()
                papers = self._parse_feed(response.text, query)
                for paper in papers:
                    if paper.paper_id in seen_ids:
                        continue
                    seen_ids.add(paper.paper_id)
                    collected.append(paper)
                    if len(collected) >= limit:
                        return collected
        return collected

    def _parse_feed(self, xml_text: str, query: str) -> list[CandidatePaper]:
        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "arxiv": "http://arxiv.org/schemas/atom",
        }
        root = ET.fromstring(xml_text)
        papers: list[CandidatePaper] = []
        for entry in root.findall("atom:entry", ns):
            paper_id = self._text(entry.find("atom:id", ns))
            title = re.sub(r"\s+", " ", self._text(entry.find("atom:title", ns))).strip()
            abstract = re.sub(r"\s+", " ", self._text(entry.find("atom:summary", ns))).strip()
            authors = [self._text(author.find("atom:name", ns)) for author in entry.findall("atom:author", ns)]
            published = self._text(entry.find("atom:published", ns))
            categories = [item.attrib.get("term", "") for item in entry.findall("atom:category", ns)]
            paper_url = ""
            for link in entry.findall("atom:link", ns):
                href = link.attrib.get("href", "")
                rel = link.attrib.get("rel", "")
                if href and (rel == "alternate" or not paper_url):
                    paper_url = href
            year = None
            if published[:4].isdigit():
                year = int(published[:4])
            papers.append(
                CandidatePaper(
                    paper_id=paper_id.rsplit("/", 1)[-1] if paper_id else f"arxiv_{uuid.uuid4().hex[:8]}",
                    title=title or "Untitled arXiv paper",
                    abstract=abstract,
                    authors=[author for author in authors if author],
                    year=year,
                    source="arxiv",
                    url=paper_url or paper_id,
                    tags=[item for item in categories[:4] if item],
                    rationale=f"来自 arXiv 检索，命中查询“{query}”",
                )
            )
        return papers

    @staticmethod
    def _text(element: ET.Element | None) -> str:
        return element.text.strip() if element is not None and element.text else ""


class ScoutAgent:
    def __init__(self, corpus: LocalPaperCorpus, arxiv_client: ArxivClient) -> None:
        self.corpus = corpus
        self.arxiv_client = arxiv_client

    async def run(self, state: WorkflowState) -> None:
        queries = state.search_queries or self._build_queries(state)
        state.search_queries = queries

        pool = [paper.model_copy(deep=True) for paper in state.candidate_pool]
        if not pool:
            try:
                pool = await self.arxiv_client.search(queries, limit=max(state.requested_count * 3, 12))
                if pool:
                    state.messages.append(f"Scout 已从 arXiv 拉取 {len(pool)} 篇候选。")
            except Exception as exc:
                state.messages.append(f"Scout 访问 arXiv 失败，已回退本地语料: {exc}")
                pool = []
        if not pool:
            pool = self.corpus.search(queries, limit=max(state.requested_count * 3, 12))
            if pool:
                state.messages.append(f"Scout 已回退到本地语料，共 {len(pool)} 篇候选。")

        query_tokens = tokenize(" ".join(queries + state.user_profile.interests + state.goals))
        for paper in pool:
            paper.relevance_score = round(self._relevance(paper, query_tokens), 3)
            paper.quality_score = round(self._quality(paper), 3)
            paper.score = round(paper.relevance_score * 0.7 + paper.quality_score * 0.3, 3)
            if not paper.paper_id:
                paper.paper_id = f"paper_{uuid.uuid4().hex[:8]}"
            if not paper.source:
                paper.source = state.trigger.value

        pool.sort(key=lambda paper: paper.score, reverse=True)
        state.candidates = pool[: max(state.requested_count * 2, 8)]
        state.messages.append(f"Scout 完成候选召回，共 {len(state.candidates)} 篇。")

    def _build_queries(self, state: WorkflowState) -> list[str]:
        queries: list[str] = []
        if state.goals:
            queries.extend(state.goals[:2])
        if state.user_profile.goal:
            queries.append(state.user_profile.goal)
        if state.user_profile.interests:
            queries.extend(state.user_profile.interests[:3])
        if state.question:
            queries.append(state.question)
        cleaned: list[str] = []
        for item in queries:
            value = item.strip()
            if value and value not in cleaned:
                cleaned.append(value)
        if cleaned:
            return cleaned[:5]
        return ["multimodal learning", "rag for papers", "diffusion transformer"]

    @staticmethod
    def _relevance(paper: CandidatePaper, query_tokens: list[str]) -> float:
        text = " ".join([paper.title, paper.abstract, " ".join(paper.tags), " ".join(paper.notes)])
        return overlap_score(query_tokens, text)

    @staticmethod
    def _quality(paper: CandidatePaper) -> float:
        score = 0.2
        if paper.abstract:
            score += 0.25
        if paper.authors:
            score += 0.2
        if paper.year:
            score += 0.2
        if paper.url or paper.local_path:
            score += 0.15
        return min(score, 1.0)


class CuratorAgent:
    async def run(self, state: WorkflowState) -> None:
        approved: list[CandidatePaper] = [paper.model_copy(deep=True) for paper in state.approved]
        rejected: list[CandidatePaper] = [paper.model_copy(deep=True) for paper in state.rejected]
        library = state.existing_library + approved
        profile_tokens = tokenize(" ".join(state.user_profile.interests + state.goals + [state.user_profile.goal]))
        blocked = {token.lower() for token in state.user_profile.blocked_topics}

        for paper in state.candidates:
            review = paper.model_copy(deep=True)
            review.novelty_score = round(self._novelty(review, library), 3)
            review.relevance_score = round(
                max(review.relevance_score, overlap_score(profile_tokens, review.title + " " + review.abstract)),
                3,
            )
            review.normalized_filename = self._normalized_filename(review)

            title_tokens = set(tokenize(review.title + " " + " ".join(review.tags)))
            if blocked and title_tokens & blocked:
                review.notes.append("命中用户屏蔽主题")
                rejected.append(review)
                continue

            duplicate = self._find_duplicate(review, library)
            if duplicate:
                review.duplicate_of = duplicate.paper_id
                review.notes.append(f"疑似与 {duplicate.title} 重复")
                rejected.append(review)
                continue

            if state.trigger == WorkflowTrigger.uploaded:
                review.notes.append("上传来源，放宽相关性阈值")
                approved.append(review)
                library.append(review)
                continue

            if review.relevance_score < 0.15:
                review.notes.append("与当前目标关联度过低")
                rejected.append(review)
                continue

            if review.novelty_score < 0.2 and review.relevance_score > 0.75:
                review.notes.append("与现有库过近，暂缓入库")
                rejected.append(review)
                continue

            if 0.3 <= review.relevance_score <= 0.8:
                review.notes.append("命中 Curator 甜蜜区")
            elif review.relevance_score > 0.8:
                review.notes.append("高相关但需注意同质化")
            else:
                review.notes.append("低相关边缘样本，保留少量探索")

            approved.append(review)
            library.append(review)
            if len(approved) >= state.requested_count:
                break

        state.approved = approved
        state.rejected = rejected
        state.need_more_search = len(state.approved) < max(2, min(state.requested_count, 3))
        state.messages.append(f"Curator 审核完成，通过 {len(state.approved)} 篇，拒绝 {len(state.rejected)} 篇。")

    @staticmethod
    def _find_duplicate(paper: CandidatePaper, library: list[CandidatePaper]) -> CandidatePaper | None:
        for item in library:
            if similarity(paper.title, item.title) >= 0.9:
                return item
        return None

    @staticmethod
    def _novelty(paper: CandidatePaper, library: list[CandidatePaper]) -> float:
        if not library:
            return 1.0
        sims = [similarity(paper.title, item.title) for item in library]
        return max(0.0, 1 - max(sims))

    @staticmethod
    def _normalized_filename(paper: CandidatePaper) -> str:
        first_author = slugify(paper.authors[0] if paper.authors else "unknown")
        keyword = slugify((paper.tags[0] if paper.tags else paper.title.split(" ")[0]) if paper.title else "paper")
        year = str(paper.year or datetime.utcnow().year)
        return f"{first_author}_{keyword}_{year}.pdf"


class EditorAgent:
    async def run(self, state: WorkflowState) -> None:
        for paper in state.approved:
            if not paper.tags:
                paper.tags = self._extract_tags(paper)
            paper.summary = self._build_summary(paper)
            paper.teaser = self._build_teaser(paper)
            paper.rationale = paper.rationale or "已通过 Curator 审核，适合进入阅读与问答环节。"
            if not paper.notes:
                paper.notes.append("已生成结构化知识卡片")
        state.messages.append("Editor 已生成摘要、标签和卡片文案。")

    @staticmethod
    def _extract_tags(paper: CandidatePaper) -> list[str]:
        tokens = tokenize(f"{paper.title} {paper.abstract}")
        counts = Counter(tokens)
        return [token for token, _ in counts.most_common(5)]

    @staticmethod
    def _build_summary(paper: CandidatePaper) -> str:
        background = paper.abstract[:90].strip() if paper.abstract else f"论文主题围绕 {paper.title}。"
        method = "方法层面建议关注 " + " / ".join(paper.tags[:3]) if paper.tags else "方法细节待补充。"
        result = "适合作为知识库卡片、阅读入口和后续 Sage 检索上下文。"
        return f"背景: {background}\n方法: {method}\n结果: {result}"

    @staticmethod
    def _build_teaser(paper: CandidatePaper) -> str:
        core = "、".join(paper.tags[:3]) if paper.tags else "核心概念"
        return f"{paper.title} | 重点关注 {core}"


class SageAgent:
    async def run(self, state: WorkflowState) -> None:
        if not state.question:
            return

        ranked = self._rank_candidates(state.question, state.approved + state.existing_library)
        top_items = ranked[:5]
        if not top_items:
            state.answer = "当前知识库没有足够上下文，建议先让 Scout 扩充候选论文后再问。"
            state.citations = []
            return

        citations = [paper.title for _, paper in top_items]
        lines = [f"围绕问题“{state.question}”，Sage 从已审核论文中找到了 {len(top_items)} 条高相关上下文。"]
        for index, (_, paper) in enumerate(top_items, start=1):
            lines.append(f"{index}. {paper.title}：{paper.summary or paper.abstract or paper.rationale or '暂无摘要'}")
        if state.goals:
            lines.append(f"结合当前目标，下一步优先阅读 {top_items[0][1].title}，再进入计划拆分。")
        state.answer = "\n".join(lines)
        state.citations = citations
        state.messages.append("Sage 已完成基于本地知识卡片的问答。")

    def answer_pdf(self, question: str, blocks: list[dict[str, Any]], top_k: int) -> AgentPdfQaResponse:
        ranked = []
        query_tokens = tokenize(question)
        for block in blocks:
            text = str(block.get("text", ""))
            score = overlap_score(query_tokens, text)
            if score <= 0:
                continue
            ranked.append((score, block))
        ranked.sort(key=lambda item: item[0], reverse=True)
        selected = [block for _, block in ranked[:top_k]]
        if not selected:
            answer = "当前页没有检索到足够相关的段落，建议扩大页码范围或重新划词。"
            citations: list[str] = []
        else:
            snippets = []
            citations = []
            for block in selected:
                page = block.get("page", "?")
                preview = str(block.get("text", "")).strip().replace("\n", " ")[:180]
                citations.append(f"page {page}")
                snippets.append(f"[page {page}] {preview}")
            answer = "Sage 基于当前 PDF 局部上下文给出的回答线索:\n" + "\n".join(snippets)
        return AgentPdfQaResponse(
            task_id="",
            question=question,
            answer=answer,
            citations=citations,
            context_blocks=selected,
        )

    @staticmethod
    def _rank_candidates(question: str, papers: list[CandidatePaper]) -> list[tuple[float, CandidatePaper]]:
        query_tokens = tokenize(question)
        ranked = []
        for paper in papers:
            corpus = " ".join([paper.title, paper.abstract, paper.summary, " ".join(paper.tags)])
            score = overlap_score(query_tokens, corpus)
            if score <= 0:
                continue
            ranked.append((score + paper.score * 0.1, paper))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked


class PathfinderAgent:
    async def run(self, state: WorkflowState) -> None:
        goal = state.goals[0] if state.goals else state.user_profile.goal or "建立论文阅读闭环"
        if state.approved:
            state.learning_plan = self._build_plan(goal, state.approved)
            state.messages.append("Pathfinder 已基于审核结果生成学习路径。")
            return

        state.search_queries = self._plan_queries(goal, state.user_profile.interests)
        state.messages.append("Pathfinder 已生成搜索议程，准备交给 Scout。")

    @staticmethod
    def _plan_queries(goal: str, interests: list[str]) -> list[str]:
        queries = [goal]
        if interests:
            queries.extend([f"{goal} {item}" for item in interests[:2]])
        queries.extend([f"{goal} survey", f"{goal} benchmark"])
        unique: list[str] = []
        for item in queries:
            cleaned = item.strip()
            if cleaned and cleaned not in unique:
                unique.append(cleaned)
        return unique[:5]

    @staticmethod
    def _build_plan(goal: str, papers: list[CandidatePaper]) -> LearningPlan:
        ordered = sorted(papers, key=lambda paper: (paper.year or 0, paper.score))
        foundation = [paper.paper_id for paper in ordered[:2]]
        core = [paper.paper_id for paper in ordered[2:4]]
        frontier = [paper.paper_id for paper in ordered[4:6]]
        stages = [
            LearningStage(
                title="Stage 1 Foundations",
                objective="建立术语与问题定义",
                paper_ids=foundation,
                milestones=["读完摘要与引言", "整理 10 个核心术语"],
            ),
            LearningStage(
                title="Stage 2 Core Methods",
                objective="理解主流方法与实验范式",
                paper_ids=core,
                milestones=["对比方法差异", "整理实验设置"],
            ),
            LearningStage(
                title="Stage 3 Frontier Gaps",
                objective="定位当前研究空白和下一步探索点",
                paper_ids=frontier,
                milestones=["记录 3 个 open problems", "形成下一轮 Scout 查询"],
            ),
        ]
        return LearningPlan(
            goal=goal,
            stages=[stage for stage in stages if stage.paper_ids],
            next_actions=[
                "先读 Stage 1，再将不懂的概念交给 Sage 追问。",
                "Stage 2 完成后用 Curator 规则补充 2-3 篇对照论文。",
                "Stage 3 结束时回写新的搜索关键词给 Scout。",
            ],
        )


class FiveAgentWorkflow:
    def __init__(self, uploads_dir: Path, checkpoint_store: FileCheckpointStore, db_service: Any | None = None) -> None:
        self.checkpoints = checkpoint_store
        self.memory = InMemorySaver()
        self.db_service = db_service
        self.scout = ScoutAgent(LocalPaperCorpus(uploads_dir), ArxivClient())
        self.curator = CuratorAgent()
        self.editor = EditorAgent()
        self.sage = SageAgent()
        self.pathfinder = PathfinderAgent()
        self.graph = self._build_graph()

    async def run(self, request: WorkflowRequest) -> WorkflowResponse:
        state = WorkflowState(
            run_id=uuid.uuid4().hex,
            trigger=request.trigger,
            user_profile=request.user_profile,
            goals=request.goals,
            question=request.question,
            requested_count=request.requested_count,
            candidate_pool=[paper.model_copy(deep=True) for paper in request.candidate_pool],
            existing_library=[paper.model_copy(deep=True) for paper in request.existing_library],
        )
        await self._checkpoint(state, "start")
        final = await self.graph.ainvoke(self._dump_state(state), config=self._config(state.run_id))
        final_state = WorkflowState.model_validate(final)
        await self._persist_outputs(final_state)
        return WorkflowResponse(
            run_id=final_state.run_id,
            status=final_state.status,
            route_history=final_state.route_history,
            search_queries=final_state.search_queries,
            approved=final_state.approved,
            rejected=final_state.rejected,
            answer=final_state.answer,
            citations=final_state.citations,
            learning_plan=final_state.learning_plan,
            next_action=self._next_action(final_state),
        )

    def get_run(self, run_id: str) -> WorkflowState | None:
        try:
            snapshot = self.graph.get_state(self._config(run_id))
            values = getattr(snapshot, "values", None)
            if values:
                return WorkflowState.model_validate(values)
        except Exception:
            pass
        latest = self.checkpoints.load_latest(run_id)
        return latest.state if latest else None

    def answer_pdf(self, task_id: str, question: str, blocks: list[dict[str, Any]], top_k: int) -> AgentPdfQaResponse:
        response = self.sage.answer_pdf(question=question, blocks=blocks, top_k=top_k)
        response.task_id = task_id
        return response

    def _build_graph(self):
        builder = StateGraph(GraphState)
        builder.add_node("route_start", self._route_start_node)
        builder.add_node("pathfinder", self._pathfinder_node)
        builder.add_node("scout", self._scout_node)
        builder.add_node("curator", self._curator_node)
        builder.add_node("editor", self._editor_node)
        builder.add_node("sage", self._sage_node)
        builder.add_node("finalize", self._finalize_node)

        builder.add_edge(START, "route_start")
        builder.add_conditional_edges(
            "route_start",
            self._route_from_start,
            {
                "pathfinder": "pathfinder",
                "scout": "scout",
                "curator": "curator",
                "sage": "sage",
            },
        )
        builder.add_conditional_edges(
            "pathfinder",
            self._route_after_pathfinder,
            {
                "scout": "scout",
                "finalize": "finalize",
            },
        )
        builder.add_edge("scout", "curator")
        builder.add_conditional_edges(
            "curator",
            self._route_after_curator,
            {
                "scout": "scout",
                "editor": "editor",
                "finalize": "finalize",
            },
        )
        builder.add_conditional_edges(
            "editor",
            self._route_after_editor,
            {
                "sage": "sage",
                "pathfinder": "pathfinder",
                "finalize": "finalize",
            },
        )
        builder.add_conditional_edges(
            "sage",
            self._route_after_sage,
            {
                "pathfinder": "pathfinder",
                "finalize": "finalize",
            },
        )
        builder.add_edge("finalize", END)
        return builder.compile(checkpointer=self.memory)

    @staticmethod
    def _config(run_id: str) -> dict[str, Any]:
        return {"configurable": {"thread_id": run_id}}

    @staticmethod
    def _dump_state(state: WorkflowState) -> GraphState:
        return state.model_dump(mode="json")

    def _load_state(self, raw: GraphState) -> WorkflowState:
        return WorkflowState.model_validate(raw)

    async def _checkpoint(self, state: WorkflowState, node: str) -> GraphState:
        state.current_node = node
        self.checkpoints.save(state, node)
        await self._persist_run_state(state)
        return self._dump_state(state)

    def _enter_node(self, raw: GraphState, node: str) -> WorkflowState:
        state = self._load_state(raw)
        state.current_node = node
        state.route_history.append(node)
        return state

    async def _route_start_node(self, raw: GraphState) -> GraphState:
        state = self._load_state(raw)
        state.messages.append("LangGraph 工作流启动。")
        return await self._checkpoint(state, "route_start")

    async def _pathfinder_node(self, raw: GraphState) -> GraphState:
        state = self._enter_node(raw, "pathfinder")
        await self.pathfinder.run(state)
        return await self._checkpoint(state, "pathfinder")

    async def _scout_node(self, raw: GraphState) -> GraphState:
        state = self._enter_node(raw, "scout")
        await self.scout.run(state)
        return await self._checkpoint(state, "scout")

    async def _curator_node(self, raw: GraphState) -> GraphState:
        state = self._enter_node(raw, "curator")
        await self.curator.run(state)
        return await self._checkpoint(state, "curator")

    async def _editor_node(self, raw: GraphState) -> GraphState:
        state = self._enter_node(raw, "editor")
        await self.editor.run(state)
        return await self._checkpoint(state, "editor")

    async def _sage_node(self, raw: GraphState) -> GraphState:
        state = self._enter_node(raw, "sage")
        await self.sage.run(state)
        return await self._checkpoint(state, "sage")

    async def _finalize_node(self, raw: GraphState) -> GraphState:
        state = self._load_state(raw)
        state.status = "completed"
        state.current_node = "end"
        state.messages.append("LangGraph 工作流结束。")
        return await self._checkpoint(state, "end")

    async def _persist_run_state(self, state: WorkflowState) -> None:
        if self.db_service is None:
            return
        try:
            payload = {
                "goals": state.goals,
                "question": state.question,
                "requested_count": state.requested_count,
                "search_queries": state.search_queries,
                "route_history": state.route_history,
            }
            result = {
                "approved_ids": [paper.paper_id for paper in state.approved],
                "rejected_ids": [paper.paper_id for paper in state.rejected],
                "answer": state.answer,
                "citations": state.citations,
                "has_learning_plan": state.learning_plan is not None,
            }
            await self.db_service.upsert_agent_run(
                run_id=state.run_id,
                trigger=state.trigger.value,
                current_node=state.current_node,
                status=state.status,
                payload=payload,
                result=result,
                messages=state.messages,
                user_id=self._resolve_user_id(state),
            )
        except Exception as exc:
            state.messages.append(f"数据库持久化 pf_agent_run 失败: {exc}")

    async def _persist_outputs(self, state: WorkflowState) -> None:
        if self.db_service is None:
            return
        try:
            await self.db_service.upsert_agent_outputs(
                run_id=state.run_id,
                trigger=state.trigger.value,
                approved_papers=[paper.model_dump(mode="json") for paper in state.approved],
                learning_plan=state.learning_plan.model_dump(mode="json") if state.learning_plan is not None else None,
                user_id=self._resolve_user_id(state),
            )
        except Exception as exc:
            state.messages.append(f"数据库持久化 workflow 输出失败: {exc}")
            await self._persist_run_state(state)

    def _route_from_start(self, raw: GraphState) -> str:
        state = self._load_state(raw)
        if state.candidate_pool:
            return "scout"
        if state.trigger == WorkflowTrigger.uploaded:
            return "curator"
        if state.trigger == WorkflowTrigger.discovered and state.question and state.existing_library:
            return "sage"
        if state.goals or state.user_profile.goal:
            return "pathfinder"
        return "scout"

    def _route_after_pathfinder(self, raw: GraphState) -> str:
        state = self._load_state(raw)
        return "finalize" if state.learning_plan is not None else "scout"

    def _route_after_curator(self, raw: GraphState) -> str:
        state = self._load_state(raw)
        if state.need_more_search and not state.candidate_pool and len(state.route_history) < 4:
            return "scout"
        if state.approved:
            return "editor"
        return "finalize"

    def _route_after_editor(self, raw: GraphState) -> str:
        state = self._load_state(raw)
        if state.question:
            return "sage"
        if state.goals or state.user_profile.goal:
            return "pathfinder"
        return "finalize"

    def _route_after_sage(self, raw: GraphState) -> str:
        state = self._load_state(raw)
        if (state.goals or state.user_profile.goal) and state.learning_plan is None:
            return "pathfinder"
        return "finalize"

    @staticmethod
    def _next_action(state: WorkflowState) -> str:
        if state.learning_plan:
            return "按 Pathfinder 给出的 Stage 1 开始阅读，并把不懂的问题交给 Sage。"
        if state.approved:
            return "优先阅读已审核论文，再决定是否触发 Pathfinder 生成阶段计划。"
        return "补充候选论文或放宽 Curator 阈值后重试。"

    @staticmethod
    def _resolve_user_id(state: WorkflowState) -> str:
        user_id = str(state.meta.get("user_id", "")).strip()
        return user_id or "demo-user"
