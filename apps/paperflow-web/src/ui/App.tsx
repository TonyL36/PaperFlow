import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { PostsPage } from "./pages/PostsPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { VisualizationPage } from "./pages/VisualizationPage";
import { AdminCommentsPage } from "./pages/AdminCommentsPage";
import { AdminPostModerationPage } from "./pages/AdminPostModerationPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminMailSettingsPage } from "./pages/AdminMailSettingsPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { FootprintsPage } from "./pages/FootprintsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PaperPdfReaderPage } from "./pages/PaperPdfReaderPage";
import { PathfinderPage } from "./pages/PathfinderPage";
import { useAuth } from "./auth/AuthContext";
import { TopNav } from "./layout/TopNav";
import { NotFoundPage } from "./layout/NotFoundPage";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

export function App() {
  const loc = useLocation();
  const isLogin = loc.pathname === "/login";
  const isWidePage = loc.pathname.startsWith("/pathfinder");
  return (
    <div className="pf-app">
      {isLogin ? null : <TopNav />}
      <div className={isLogin ? undefined : ["pf-container", isWidePage ? "pf-container--wide" : null].filter(Boolean).join(" ")}>
        <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/posts" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/papers/:postId" element={<PaperPdfReaderPage />} />
            <Route path="/viz" element={<VisualizationPage />} />
            <Route path="/pathfinder" element={<PathfinderPage />} />
            <Route
              path="/me"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route
              path="/favorites"
              element={
                <RequireAuth>
                  <FavoritesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/footprints"
              element={
                <RequireAuth>
                  <FootprintsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/comments"
              element={
                <RequireAdmin>
                  <AdminCommentsPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/posts/moderation"
              element={
                <RequireAdmin>
                  <AdminPostModerationPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAdmin>
                  <AdminUsersPage />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/settings/mail"
              element={
                <RequireAdmin>
                  <AdminMailSettingsPage />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppErrorBoundary>
      </div>
    </div>
  );
}

function RequireAuth(props: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  return <>{props.children}</>;
}

function RequireAdmin(props: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.state.status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }
  if (!auth.state.roles.includes("ADMIN")) {
    return <Navigate to="/posts" replace />;
  }
  return <>{props.children}</>;
}
