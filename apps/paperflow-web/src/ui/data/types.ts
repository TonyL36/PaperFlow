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

export type Post = {
  postId: string;
  title: string;
  content: string;
  source: string;
  publishedAt: string;
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
