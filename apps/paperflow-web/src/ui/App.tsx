import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { PostsPage } from "./pages/PostsPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { VisualizationPage } from "./pages/VisualizationPage";
import { AdminCommentsPage } from "./pages/AdminCommentsPage";
import { useAuth } from "./auth/AuthContext";
import { TopNav } from "./layout/TopNav";
import { NotFoundPage } from "./layout/NotFoundPage";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

export function App() {
  return (
    <div className="pf-app">
      <TopNav />
      <div className="pf-container">
        <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/posts" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/viz" element={<VisualizationPage />} />
            <Route
              path="/admin/comments"
              element={
                <RequireAuth>
                  <AdminCommentsPage />
                </RequireAuth>
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
