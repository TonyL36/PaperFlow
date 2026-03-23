from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row


@dataclass
class PaperflowDbConfig:
    host: str = "localhost"
    port: int = 5432
    dbname: str = "paperflowdb"
    user: str = "paperflow"
    password: str = "paperflow"
    enabled: bool = True

    @classmethod
    def from_env(cls) -> "PaperflowDbConfig":
        enabled = os.getenv("PAPERFLOW_DB_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
        return cls(
            host=os.getenv("PAPERFLOW_DB_HOST", "localhost"),
            port=int(os.getenv("PAPERFLOW_DB_PORT", "5432")),
            dbname=os.getenv("PAPERFLOW_DB_NAME", "paperflowdb"),
            user=os.getenv("PAPERFLOW_DB_USER", "paperflow"),
            password=os.getenv("PAPERFLOW_DB_PASSWORD", os.getenv("POSTGRES_PASSWORD", "paperflow")),
            enabled=enabled,
        )

    def dsn(self) -> str:
        return (
            f"host={self.host} port={self.port} dbname={self.dbname} "
            f"user={self.user} password={self.password}"
        )


class PaperflowDbService:
    def __init__(self, config: PaperflowDbConfig) -> None:
        self.config = config

    async def upsert_upload_task(self, task_id: str, filename: str, upload_path: str, source: str = "uploaded") -> None:
        if not self.config.enabled:
            return
        await asyncio.to_thread(self._upsert_upload_task_sync, task_id, filename, upload_path, source)

    def _upsert_upload_task_sync(self, task_id: str, filename: str, upload_path: str, source: str) -> None:
        with psycopg.connect(self.config.dsn()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into pf_paper (
                      id, external_source, external_id, title, normalized_title,
                      source, ingest_status, file_path, file_name, normalized_filename, metadata
                    ) values (
                      %(id)s, %(external_source)s, %(external_id)s, %(title)s, %(normalized_title)s,
                      %(source)s, %(ingest_status)s, %(file_path)s, %(file_name)s, %(normalized_filename)s, %(metadata)s::jsonb
                    )
                    on conflict (id) do update set
                      file_path = excluded.file_path,
                      file_name = excluded.file_name,
                      normalized_filename = excluded.normalized_filename,
                      source = excluded.source,
                      ingest_status = excluded.ingest_status,
                      metadata = excluded.metadata,
                      updated_at = now()
                    """,
                    {
                        "id": task_id,
                        "external_source": "local-upload",
                        "external_id": task_id,
                        "title": filename,
                        "normalized_title": filename.lower(),
                        "source": source,
                        "ingest_status": "pending",
                        "file_path": upload_path,
                        "file_name": filename,
                        "normalized_filename": filename,
                        "metadata": '{"upload_status":"queued"}',
                    },
                )
            conn.commit()

    async def save_parsed_paper(
        self,
        task_id: str,
        filename: str,
        upload_path: str,
        blocks: list[dict[str, Any]],
        raw_data: dict[str, Any],
        parse_meta: dict[str, Any],
    ) -> None:
        if not self.config.enabled:
            return
        await asyncio.to_thread(
            self._save_parsed_paper_sync,
            task_id,
            filename,
            upload_path,
            blocks,
            raw_data,
            parse_meta,
        )

    def _save_parsed_paper_sync(
        self,
        task_id: str,
        filename: str,
        upload_path: str,
        blocks: list[dict[str, Any]],
        raw_data: dict[str, Any],
        parse_meta: dict[str, Any],
    ) -> None:
        title = self._pick_title(filename, blocks)
        summary = self._build_summary(blocks)
        teaser = summary[:120]
        tags = self._guess_tags(title, blocks)
        normalized_title = title.lower()
        normalized_filename = filename
        year = self._guess_year(title)
        with psycopg.connect(self.config.dsn()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into pf_paper (
                      id, external_source, external_id, title, normalized_title, abstract, authors,
                      year, source, ingest_status, file_path, file_name, normalized_filename,
                      summary, teaser, tags, metadata
                    ) values (
                      %(id)s, %(external_source)s, %(external_id)s, %(title)s, %(normalized_title)s, %(abstract)s, '[]'::jsonb,
                      %(year)s, %(source)s, %(ingest_status)s, %(file_path)s, %(file_name)s, %(normalized_filename)s,
                      %(summary)s, %(teaser)s, %(tags)s::jsonb, %(metadata)s::jsonb
                    )
                    on conflict (id) do update set
                      title = excluded.title,
                      normalized_title = excluded.normalized_title,
                      abstract = excluded.abstract,
                      year = excluded.year,
                      ingest_status = excluded.ingest_status,
                      file_path = excluded.file_path,
                      file_name = excluded.file_name,
                      normalized_filename = excluded.normalized_filename,
                      summary = excluded.summary,
                      teaser = excluded.teaser,
                      tags = excluded.tags,
                      metadata = excluded.metadata,
                      updated_at = now()
                    """,
                    {
                        "id": task_id,
                        "external_source": "local-upload",
                        "external_id": task_id,
                        "title": title,
                        "normalized_title": normalized_title,
                        "abstract": self._pick_abstract(blocks),
                        "year": year,
                        "source": "uploaded",
                        "ingest_status": "parsed",
                        "file_path": upload_path,
                        "file_name": filename,
                        "normalized_filename": normalized_filename,
                        "summary": summary,
                        "teaser": teaser,
                        "tags": self._json_dump(tags),
                        "metadata": self._json_dump(
                            {
                                "raw_source_file": raw_data.get("source_file"),
                                "block_count": len(blocks),
                                "formula_count": parse_meta.get("formula_count", 0),
                            }
                        ),
                    },
                )
                cur.execute("delete from pf_paper_chunk where paper_id = %s", (task_id,))
                chunk_rows = []
                for index, block in enumerate(blocks, start=1):
                    chunk_rows.append(
                        {
                            "paper_id": task_id,
                            "chunk_no": index,
                            "chunk_kind": self._map_chunk_kind(str(block.get("type", "text"))),
                            "section_title": None,
                            "page_from": block.get("page"),
                            "page_to": block.get("page"),
                            "token_count": max(1, len(str(block.get("text", "")).split())),
                            "content": str(block.get("text", "")),
                            "metadata": self._json_dump(
                                {
                                    "block_id": block.get("id"),
                                    "bbox": block.get("bbox"),
                                    "page": block.get("page"),
                                    "source_type": block.get("type"),
                                }
                            ),
                        }
                    )
                if chunk_rows:
                    cur.executemany(
                        """
                        insert into pf_paper_chunk (
                          paper_id, chunk_no, chunk_kind, section_title,
                          page_from, page_to, token_count, content, metadata
                        ) values (
                          %(paper_id)s, %(chunk_no)s, %(chunk_kind)s, %(section_title)s,
                          %(page_from)s, %(page_to)s, %(token_count)s, %(content)s, %(metadata)s::jsonb
                        )
                        """,
                        chunk_rows,
                    )
            conn.commit()

    async def mark_task_failed(self, task_id: str, error: str) -> None:
        if not self.config.enabled:
            return
        await asyncio.to_thread(self._mark_task_failed_sync, task_id, error)

    def _mark_task_failed_sync(self, task_id: str, error: str) -> None:
        with psycopg.connect(self.config.dsn()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update pf_paper
                    set ingest_status = 'failed',
                        metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{error}', to_jsonb(%s::text), true),
                        updated_at = now()
                    where id = %s
                    """,
                    (error, task_id),
                )
            conn.commit()

    async def list_papers(self, limit: int = 20, offset: int = 0) -> list[dict[str, Any]]:
        if not self.config.enabled:
            return []
        return await asyncio.to_thread(self._list_papers_sync, limit, offset)

    def _list_papers_sync(self, limit: int, offset: int) -> list[dict[str, Any]]:
        with psycopg.connect(self.config.dsn(), row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, title, source, ingest_status, year, file_name, normalized_filename,
                           summary, teaser, tags, created_at, updated_at
                    from pf_paper
                    order by updated_at desc, created_at desc
                    limit %s offset %s
                    """,
                    (limit, offset),
                )
                return list(cur.fetchall())

    async def get_paper(self, paper_id: str) -> dict[str, Any] | None:
        if not self.config.enabled:
            return None
        return await asyncio.to_thread(self._get_paper_sync, paper_id)

    def _get_paper_sync(self, paper_id: str) -> dict[str, Any] | None:
        with psycopg.connect(self.config.dsn(), row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, title, normalized_title, abstract, authors, year, source,
                           ingest_status, file_path, file_name, normalized_filename,
                           summary, teaser, tags, metadata, created_at, updated_at
                    from pf_paper
                    where id = %s
                    """,
                    (paper_id,),
                )
                paper = cur.fetchone()
                if paper is None:
                    return None
                cur.execute(
                    """
                    select id, chunk_no, chunk_kind, page_from, page_to, token_count, content, metadata
                    from pf_paper_chunk
                    where paper_id = %s
                    order by chunk_no asc
                    """,
                    (paper_id,),
                )
                paper["chunks"] = list(cur.fetchall())
                return paper

    async def upsert_agent_run(
        self,
        run_id: str,
        trigger: str,
        current_node: str,
        status: str,
        payload: dict[str, Any],
        result: dict[str, Any],
        messages: list[str],
        user_id: str | None = None,
    ) -> None:
        if not self.config.enabled:
            return
        await asyncio.to_thread(
            self._upsert_agent_run_sync,
            run_id,
            trigger,
            current_node,
            status,
            payload,
            result,
            messages,
            user_id,
        )

    def _upsert_agent_run_sync(
        self,
        run_id: str,
        trigger: str,
        current_node: str,
        status: str,
        payload: dict[str, Any],
        result: dict[str, Any],
        messages: list[str],
        user_id: str | None,
    ) -> None:
        with psycopg.connect(self.config.dsn()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into pf_agent_run (
                      id, trigger, current_node, status, user_id, payload, result
                    ) values (
                      %(id)s, %(trigger)s, %(current_node)s, %(status)s, %(user_id)s,
                      %(payload)s::jsonb, %(result)s::jsonb
                    )
                    on conflict (id) do update set
                      trigger = excluded.trigger,
                      current_node = excluded.current_node,
                      status = excluded.status,
                      user_id = excluded.user_id,
                      payload = excluded.payload,
                      result = excluded.result,
                      updated_at = now()
                    """,
                    {
                        "id": run_id,
                        "trigger": trigger,
                        "current_node": current_node,
                        "status": status,
                        "user_id": user_id,
                        "payload": self._json_dump(payload),
                        "result": self._json_dump(result),
                    },
                )
                cur.execute("delete from pf_agent_run_message where run_id = %s", (run_id,))
                if messages:
                    cur.executemany(
                        """
                        insert into pf_agent_run_message (run_id, node, level, message)
                        values (%(run_id)s, %(node)s, %(level)s, %(message)s)
                        """,
                        [
                            {
                                "run_id": run_id,
                                "node": current_node,
                                "level": "info",
                                "message": message,
                            }
                            for message in messages
                        ],
                    )
            conn.commit()

    async def upsert_agent_outputs(
        self,
        run_id: str,
        trigger: str,
        approved_papers: list[dict[str, Any]],
        learning_plan: dict[str, Any] | None,
        user_id: str,
    ) -> None:
        if not self.config.enabled:
            return
        await asyncio.to_thread(
            self._upsert_agent_outputs_sync,
            run_id,
            trigger,
            approved_papers,
            learning_plan,
            user_id,
        )

    def _upsert_agent_outputs_sync(
        self,
        run_id: str,
        trigger: str,
        approved_papers: list[dict[str, Any]],
        learning_plan: dict[str, Any] | None,
        user_id: str,
    ) -> None:
        with psycopg.connect(self.config.dsn()) as conn:
            with conn.cursor() as cur:
                for paper in approved_papers:
                    title = str(paper.get("title", "")).strip() or "Untitled Paper"
                    normalized_title = title.lower()
                    tags = paper.get("tags") or []
                    authors = paper.get("authors") or []
                    summary = str(paper.get("summary", "")).strip()
                    teaser = str(paper.get("teaser", "")).strip() or summary[:120]
                    metadata = {
                        "run_id": run_id,
                        "rationale": paper.get("rationale", ""),
                        "notes": paper.get("notes", []),
                    }
                    cur.execute(
                        """
                        insert into pf_paper (
                          id, external_source, external_id, title, normalized_title, abstract, authors,
                          year, source, ingest_status, arxiv_url, file_path, normalized_filename,
                          summary, teaser, tags, curator_score, relevance_score, novelty_score, quality_score,
                          duplicate_of, metadata
                        ) values (
                          %(id)s, %(external_source)s, %(external_id)s, %(title)s, %(normalized_title)s, %(abstract)s, %(authors)s::jsonb,
                          %(year)s, %(source)s, 'ready', %(arxiv_url)s, %(file_path)s, %(normalized_filename)s,
                          %(summary)s, %(teaser)s, %(tags)s::jsonb, %(curator_score)s, %(relevance_score)s, %(novelty_score)s, %(quality_score)s,
                          %(duplicate_of)s, %(metadata)s::jsonb
                        )
                        on conflict (id) do update set
                          title = excluded.title,
                          normalized_title = excluded.normalized_title,
                          abstract = excluded.abstract,
                          authors = excluded.authors,
                          year = excluded.year,
                          source = excluded.source,
                          ingest_status = excluded.ingest_status,
                          arxiv_url = excluded.arxiv_url,
                          file_path = excluded.file_path,
                          normalized_filename = excluded.normalized_filename,
                          summary = excluded.summary,
                          teaser = excluded.teaser,
                          tags = excluded.tags,
                          curator_score = excluded.curator_score,
                          relevance_score = excluded.relevance_score,
                          novelty_score = excluded.novelty_score,
                          quality_score = excluded.quality_score,
                          duplicate_of = excluded.duplicate_of,
                          metadata = excluded.metadata,
                          updated_at = now()
                        """,
                        {
                            "id": paper.get("paper_id") or f"paper_{run_id[:8]}",
                            "external_source": paper.get("source") or "agent",
                            "external_id": paper.get("paper_id") or f"paper_{run_id[:8]}",
                            "title": title,
                            "normalized_title": normalized_title,
                            "abstract": paper.get("abstract", ""),
                            "authors": self._json_dump(authors),
                            "year": paper.get("year"),
                            "source": paper.get("source") or trigger,
                            "arxiv_url": paper.get("url", ""),
                            "file_path": paper.get("local_path", ""),
                            "normalized_filename": paper.get("normalized_filename", ""),
                            "summary": summary,
                            "teaser": teaser,
                            "tags": self._json_dump(tags),
                            "curator_score": paper.get("score", 0.0),
                            "relevance_score": paper.get("relevance_score", 0.0),
                            "novelty_score": paper.get("novelty_score", 0.0),
                            "quality_score": paper.get("quality_score", 0.0),
                            "duplicate_of": paper.get("duplicate_of"),
                            "metadata": self._json_dump(metadata),
                        },
                    )

                if learning_plan is not None:
                    plan_id = f"plan_{run_id}"[:64]
                    cur.execute(
                        """
                        insert into pf_learning_plan (
                          id, user_id, goal, status, source, metadata
                        ) values (
                          %(id)s, %(user_id)s, %(goal)s, 'active', 'pathfinder', %(metadata)s::jsonb
                        )
                        on conflict (id) do update set
                          user_id = excluded.user_id,
                          goal = excluded.goal,
                          status = excluded.status,
                          source = excluded.source,
                          metadata = excluded.metadata,
                          updated_at = now()
                        """,
                        {
                            "id": plan_id,
                            "user_id": user_id,
                            "goal": learning_plan.get("goal", ""),
                            "metadata": self._json_dump({"run_id": run_id, "next_actions": learning_plan.get("next_actions", [])}),
                        },
                    )
                    cur.execute(
                        "delete from pf_learning_plan_stage_paper where stage_id in (select id from pf_learning_plan_stage where plan_id = %s)",
                        (plan_id,),
                    )
                    cur.execute("delete from pf_learning_plan_stage where plan_id = %s", (plan_id,))
                    stages = learning_plan.get("stages", [])
                    for index, stage in enumerate(stages, start=1):
                        stage_id = f"{plan_id}_s{index}"[:64]
                        cur.execute(
                            """
                            insert into pf_learning_plan_stage (
                              id, plan_id, stage_no, title, objective, status, metadata
                            ) values (
                              %(id)s, %(plan_id)s, %(stage_no)s, %(title)s, %(objective)s, 'todo', %(metadata)s::jsonb
                            )
                            """,
                            {
                                "id": stage_id,
                                "plan_id": plan_id,
                                "stage_no": index,
                                "title": stage.get("title", f"Stage {index}"),
                                "objective": stage.get("objective", ""),
                                "metadata": self._json_dump({"milestones": stage.get("milestones", [])}),
                            },
                        )
                        for paper_order, paper_id in enumerate(stage.get("paper_ids", []), start=1):
                            cur.execute(
                                """
                                insert into pf_learning_plan_stage_paper (
                                  stage_id, paper_id, paper_order, is_required, metadata
                                ) values (
                                  %(stage_id)s, %(paper_id)s, %(paper_order)s, true, '{}'::jsonb
                                )
                                on conflict (stage_id, paper_id) do update set
                                  paper_order = excluded.paper_order
                                """,
                                {
                                    "stage_id": stage_id,
                                    "paper_id": paper_id,
                                    "paper_order": paper_order,
                                },
                            )
            conn.commit()

    @staticmethod
    def _pick_title(filename: str, blocks: list[dict[str, Any]]) -> str:
        for block in blocks[:20]:
            if str(block.get("type", "")).lower() == "title" and str(block.get("text", "")).strip():
                return str(block["text"]).strip()[:512]
        return Path(filename).stem[:512]

    @staticmethod
    def _pick_abstract(blocks: list[dict[str, Any]]) -> str:
        texts = [str(block.get("text", "")).strip() for block in blocks if str(block.get("type", "")).lower() in {"text", "title"}]
        return " ".join([text for text in texts[:4] if text])[:2000]

    @staticmethod
    def _build_summary(blocks: list[dict[str, Any]]) -> str:
        texts = [str(block.get("text", "")).strip() for block in blocks if str(block.get("type", "")).lower() in {"text", "title"}]
        merged = " ".join([text for text in texts[:6] if text])
        return merged[:600]

    @staticmethod
    def _guess_tags(title: str, blocks: list[dict[str, Any]]) -> list[str]:
        words = re.findall(r"[A-Za-z0-9\-\+]+", f"{title} {' '.join(str(b.get('text', '')) for b in blocks[:12])}".lower())
        counts: dict[str, int] = {}
        for word in words:
            if len(word) < 3:
                continue
            counts[word] = counts.get(word, 0) + 1
        ordered = sorted(counts.items(), key=lambda item: item[1], reverse=True)
        return [word for word, _ in ordered[:6]]

    @staticmethod
    def _guess_year(title: str) -> int | None:
        import re

        match = re.search(r"(20\d{2})", title)
        return int(match.group(1)) if match else None

    @staticmethod
    def _map_chunk_kind(block_type: str) -> str:
        mapping = {
            "title": "title",
            "formula": "formula",
            "text": "paragraph",
        }
        return mapping.get(block_type.lower(), "paragraph")

    @staticmethod
    def _json_dump(value: Any) -> str:
        import json

        return json.dumps(value, ensure_ascii=False)
