import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { PostsPage } from "./pages/PostsPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { VisualizationPage } from "./pages/VisualizationPage";
import { AdminCommentsPage } from "./pages/AdminCommentsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { FootprintsPage } from "./pages/FootprintsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { useAuth } from "./auth/AuthContext";
import { TopNav } from "./layout/TopNav";
import { NotFoundPage } from "./layout/NotFoundPage";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

export function App() {
  const loc = useLocation();
  const isLogin = loc.pathname === "/login";
  return (
    <div className="pf-app">
      {isLogin ? null : <TopNav />}
      <div className={isLogin ? undefined : "pf-container"}>
        <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/posts" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/viz" element={<VisualizationPage />} />
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
              path="/admin/users"
              element={
                <RequireAdmin>
                  <AdminUsersPage />
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
