from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class WorkflowTrigger(str, Enum):
    roaming = "roaming"
    uploaded = "uploaded"
    planned = "planned"
    discovered = "discovered"


class CandidatePaper(BaseModel):
    paper_id: str = ""
    title: str
    abstract: str = ""
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    source: str = WorkflowTrigger.roaming.value
    url: str = ""
    local_path: str = ""
    tags: list[str] = Field(default_factory=list)
    score: float = 0.0
    relevance_score: float = 0.0
    novelty_score: float = 0.0
    quality_score: float = 0.0
    duplicate_of: str | None = None
    normalized_filename: str = ""
    summary: str = ""
    teaser: str = ""
    rationale: str = ""
    notes: list[str] = Field(default_factory=list)


class UserProfile(BaseModel):
    interests: list[str] = Field(default_factory=list)
    blocked_topics: list[str] = Field(default_factory=list)
    goal: str = ""
    experience_level: str = "intermediate"
    exploration_bias: float = Field(default=0.5, ge=0.0, le=1.0)
    preferred_sources: list[str] = Field(default_factory=lambda: ["arxiv", "uploaded", "planned"])


class LearningStage(BaseModel):
    title: str
    objective: str
    paper_ids: list[str] = Field(default_factory=list)
    milestones: list[str] = Field(default_factory=list)


class LearningPlan(BaseModel):
    goal: str
    stages: list[LearningStage] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)


class WorkflowState(BaseModel):
    run_id: str
    trigger: WorkflowTrigger
    status: str = "running"
    messages: list[str] = Field(default_factory=list)
    route_history: list[str] = Field(default_factory=list)
    user_profile: UserProfile = Field(default_factory=UserProfile)
    goals: list[str] = Field(default_factory=list)
    question: str = ""
    requested_count: int = 5
    search_queries: list[str] = Field(default_factory=list)
    candidate_pool: list[CandidatePaper] = Field(default_factory=list)
    candidates: list[CandidatePaper] = Field(default_factory=list)
    approved: list[CandidatePaper] = Field(default_factory=list)
    rejected: list[CandidatePaper] = Field(default_factory=list)
    existing_library: list[CandidatePaper] = Field(default_factory=list)
    answer: str = ""
    citations: list[str] = Field(default_factory=list)
    learning_plan: LearningPlan | None = None
    waiting_for_human: bool = False
    need_more_search: bool = False
    current_node: str = "start"
    meta: dict[str, Any] = Field(default_factory=dict)


class WorkflowRequest(BaseModel):
    trigger: WorkflowTrigger = WorkflowTrigger.roaming
    user_profile: UserProfile = Field(default_factory=UserProfile)
    goals: list[str] = Field(default_factory=list)
    question: str = ""
    requested_count: int = Field(default=5, ge=1, le=20)
    candidate_pool: list[CandidatePaper] = Field(default_factory=list)
    existing_library: list[CandidatePaper] = Field(default_factory=list)


class WorkflowResponse(BaseModel):
    run_id: str
    status: str
    route_history: list[str]
    search_queries: list[str]
    approved: list[CandidatePaper]
    rejected: list[CandidatePaper]
    answer: str = ""
    citations: list[str] = Field(default_factory=list)
    learning_plan: LearningPlan | None = None
    next_action: str = ""


class AgentRunSnapshot(BaseModel):
    run_id: str
    node: str
    saved_at: str
    state: WorkflowState


class AgentPdfQaRequest(BaseModel):
    task_id: str
    question: str
    page: int | None = Field(default=None, ge=1)
    selected_text: str = ""
    top_k: int = Field(default=5, ge=1, le=10)


class AgentPdfQaResponse(BaseModel):
    task_id: str
    question: str
    answer: str
    citations: list[str] = Field(default_factory=list)
    context_blocks: list[dict[str, Any]] = Field(default_factory=list)
