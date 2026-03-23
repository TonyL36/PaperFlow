from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.agents.models import AgentRunSnapshot, WorkflowState


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


class FileCheckpointStore:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, state: WorkflowState, node: str) -> AgentRunSnapshot:
        state.current_node = node
        snapshot = AgentRunSnapshot(
            run_id=state.run_id,
            node=node,
            saved_at=now_iso(),
            state=state,
        )
        run_dir = self.base_dir / state.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        target = run_dir / f"{len(list(run_dir.glob('*.json'))):02d}_{node}.json"
        target.write_text(
            json.dumps(snapshot.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        latest = run_dir / "latest.json"
        latest.write_text(
            json.dumps(snapshot.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return snapshot

    def load_latest(self, run_id: str) -> AgentRunSnapshot | None:
        latest = self.base_dir / run_id / "latest.json"
        if not latest.exists():
            return None
        data = json.loads(latest.read_text(encoding="utf-8"))
        return AgentRunSnapshot.model_validate(data)
