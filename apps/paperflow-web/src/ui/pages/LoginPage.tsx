import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Page } from "../layout/Page";

export function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("alice@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hint = useMemo(() => {
    return (
      <div className="pf-muted2">
        <div>Mock 模式默认账号：alice@example.com / password123（普通用户）</div>
        <div>Mock 管理员账号：admin@example.com / admin12345（带 ADMIN 角色）</div>
      </div>
    );
  }, []);

  return (
    <Page title="登录" subtitle="用于调用 /api/v1/auth/login。可通过 Mock 模式快速体验。">
      <div style={{ maxWidth: 520 }}>
        <Card>
          <div className="pf-grid" style={{ gap: 12 }}>
            <label className="pf-grid" style={{ gap: 6 }}>
              <div className="pf-muted2">邮箱</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="pf-input" />
            </label>
            <label className="pf-grid" style={{ gap: 6 }}>
              <div className="pf-muted2">密码</div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pf-input" />
            </label>
            <div className="pf-row" style={{ justifyContent: "flex-end" }}>
              <Button
                variant="primary"
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    await auth.login(email, password);
                    nav("/posts");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? "登录中..." : "登录"}
              </Button>
            </div>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {hint}
          </div>
        </Card>
      </div>
    </Page>
  );
}
