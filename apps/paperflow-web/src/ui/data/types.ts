export type EnvelopeOk<T> = {
  requestId: string;
  data: T;
  links?: Array<{ rel: string; href: string; method?: string; type?: string }>;
};

export type EnvelopeErr = {
  requestId: string;
  error: { code: string; message: string; details?: Record<string, unknown> };
};

export type Envelope<T> = EnvelopeOk<T> | EnvelopeErr;

export type PaperFormatType = "pdf" | "html" | "markdown";

export type PaperHighlightLevel = "claim" | "evidence" | "risk" | "method";

export type PaperFormat = {
  type: PaperFormatType;
  url: string;
  sha256?: string | null;
};

export type PaperHighlightAnchor = {
  format: PaperFormatType;
  page?: number | null;
  bbox?: [number, number, number, number] | null;
  quote?: string | null;
  selector?: string | null;
};

export type PaperHighlight = {
  highlightId: string;
  level: PaperHighlightLevel;
  title: string;
  snippet: string;
  anchor?: PaperHighlightAnchor | null;
};

export type Post = {
  postId: string;
  title: string;
  content: string;
  source: string;
  publishedAt: string;
  formats?: PaperFormat[] | null;
  defaultFormat?: PaperFormatType | null;
  highlights?: PaperHighlight[] | null;
  commentModerationEnabled?: boolean | null;
  favorited?: boolean | null;
  lastViewedAt?: string | null;
};

export type Comment = {
  commentId: string;
  postId: string;
  userId: string;
  content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

export type Paged<T> = {
  items: T[];
  page: { number: number; size: number; totalItems?: number; totalPages?: number };
};

export type AdminUser = {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  status: "ACTIVE" | "DISABLED" | string;
  createdAt: string;
  updatedAt: string;
};

export type UserProfile = {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  status: "ACTIVE" | "DISABLED" | string;
  avatarUrl?: string | null;
  bio?: string | null;
  phone?: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  qqBound: boolean;
};

export type MailTemplateSettings = {
  type: string;
  subjectTemplate: string;
  bodyTemplate: string;
  placeholders: string[];
  updatedAt?: string | null;
};

export type PathfinderMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type PathfinderModel = "glm-4-flash" | "glm-z1-flash";

export type PathfinderStageStatus = "done" | "in_progress" | "locked";

export type PathfinderReadingItem = {
  id: string;
  title: string;
  done: boolean;
};

export type PathfinderStage = {
  id: string;
  title: string;
  objective: string;
  readings: PathfinderReadingItem[];
  status: PathfinderStageStatus;
  etaDays: number;
};

export type PathfinderSession = {
  sessionId: string;
  goal: string;
  model: PathfinderModel;
  focus: string[];
  stages: PathfinderStage[];
  messages: PathfinderMessage[];
  activeStageId?: string | null;
  favorited: boolean;
  createdAt: string;
  updatedAt: string;
};
