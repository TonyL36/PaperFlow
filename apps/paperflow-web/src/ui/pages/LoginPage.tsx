import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { apiConfirmPasswordReset, apiRegister, apiRequestPasswordReset, apiRequestRegisterEmailCode } from "../data/api";
import "../styles/login.css";

export function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [gx, setGx] = useState(false);

  const [loginEmail, setLoginEmail] = useState("alice@example.com");
  const [loginPassword, setLoginPassword] = useState("password123");

  const [regDisplayName, setRegDisplayName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regCodeHint, setRegCodeHint] = useState<string | null>(null);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetHint, setResetHint] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hint = useMemo(() => {
    return (
      <div className="pf-login-hint">
        <div>演示账号：alice@example.com / password123</div>
        <div>演示管理员：admin@example.com / admin12345</div>
      </div>
    );
  }, []);

  return (
    <div className="pf-login-page">
      <div className="pf-login-shell">
        <div className={["pf-login-container", "pf-login-a", mode === "login" ? "pf-is-txl" : null].filter(Boolean).join(" ")}>
          <form
            className="pf-login-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              try {
                await apiRegister({ email: regEmail, password: regPassword, displayName: regDisplayName, code: regCode });
                await auth.login(regEmail, regPassword);
                nav("/posts");
              } catch (e2) {
                setError(e2 instanceof Error ? e2.message : String(e2));
              } finally {
                setLoading(false);
              }
            }}
          >
            <h2 className="pf-login-title">创建账号</h2>
            <div className="pf-login-icons">
              <button
                className="pf-login-iconbtn"
                type="button"
                onClick={() => {
                  setError("QQ 登录/绑定待接入");
                }}
              >
                QQ
              </button>
              <button
                className="pf-login-iconbtn"
                type="button"
                onClick={() => {
                  setError("微信登录待接入");
                }}
              >
                Wx
              </button>
            </div>
            <span className="pf-login-span">选择注册方式，激活全新账号</span>
            <input
              type="text"
              className="pf-login-input"
              placeholder="昵称"
              value={regDisplayName}
              onChange={(e) => setRegDisplayName(e.target.value)}
            />
            <input
              type="email"
              className="pf-login-input"
              placeholder="邮箱"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
            />
            <input
              type="password"
              className="pf-login-input"
              placeholder="密码"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
            />
            <input
              type="text"
              className="pf-login-input"
              placeholder="邮箱验证码"
              value={regCode}
              onChange={(e) => setRegCode(e.target.value)}
            />
            <button
              className="pf-login-link"
              type="button"
              onClick={async () => {
                setLoading(true);
                setError(null);
                setRegCodeHint(null);
                try {
                  const r = await apiRequestRegisterEmailCode(regEmail);
                  const dbg = r.debugCode ? `（debugCode=${r.debugCode}）` : "";
                  setRegCodeHint(`验证码已发送 ${dbg}`);
                } catch (e2) {
                  setError(e2 instanceof Error ? e2.message : String(e2));
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              发送验证码
            </button>
            <button className="pf-login-button" type="submit" disabled={loading}>
              {loading ? "SIGN UP..." : "SIGN UP"}
            </button>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {regCodeHint ? <Alert>{regCodeHint}</Alert> : null}
          </form>
        </div>

        <div
          className={[
            "pf-login-container",
            "pf-login-b",
            mode === "login" ? "pf-is-txl" : null,
            mode === "login" ? "pf-is-z" : null
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <form
            className="pf-login-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              try {
                await auth.login(loginEmail, loginPassword);
                nav("/posts");
              } catch (e2) {
                setError(e2 instanceof Error ? e2.message : String(e2));
              } finally {
                setLoading(false);
              }
            }}
          >
            <h2 className="pf-login-title">登录账号</h2>
            <div className="pf-login-icons">
              <button
                className="pf-login-iconbtn"
                type="button"
                onClick={() => {
                  setError("QQ 登录/绑定待接入");
                }}
              >
                QQ
              </button>
              <button
                className="pf-login-iconbtn"
                type="button"
                onClick={() => {
                  setError("微信登录待接入");
                }}
              >
                Wx
              </button>
            </div>
            <span className="pf-login-span">选择登录方式，登录已有账号</span>
            <input
              type="email"
              className="pf-login-input"
              placeholder="邮箱"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <input
              type="password"
              className="pf-login-input"
              placeholder="密码"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button
              className="pf-login-link"
              type="button"
              onClick={() => {
                setResetOpen((v) => !v);
                setError(null);
              }}
            >
              忘记密码
            </button>
            {resetOpen ? (
              <>
                <input
                  type="email"
                  className="pf-login-input"
                  placeholder="找回邮箱"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <button
                  className="pf-login-link"
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    setResetHint(null);
                    try {
                      const r = await apiRequestPasswordReset(resetEmail);
                      const dbg = r.debugCode ? `（debugCode=${r.debugCode}）` : "";
                      setResetHint(`验证码已发送 ${dbg}`);
                    } catch (e2) {
                      setError(e2 instanceof Error ? e2.message : String(e2));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                >
                  发送验证码
                </button>
                <input
                  type="text"
                  className="pf-login-input"
                  placeholder="邮箱验证码"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                />
                <input
                  type="password"
                  className="pf-login-input"
                  placeholder="新密码（至少 8 位）"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                />
                <button
                  className="pf-login-button"
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      await apiConfirmPasswordReset(resetEmail, resetCode, resetNewPassword);
                      setResetHint("密码已重置，请使用新密码登录");
                      setResetOpen(false);
                    } catch (e2) {
                      setError(e2 instanceof Error ? e2.message : String(e2));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                >
                  重置密码
                </button>
                {resetHint ? <Alert>{resetHint}</Alert> : null}
              </>
            ) : null}
            <button className="pf-login-button" type="submit" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </button>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {hint}
          </form>
        </div>

        <div
          className={["pf-login-switch", mode === "login" ? "pf-is-txr" : null, gx ? "pf-is-gx" : null].filter(Boolean).join(" ")}
        >
          <div className={["pf-login-circle", mode === "login" ? "pf-is-txr" : null].filter(Boolean).join(" ")} />
          <div className={["pf-login-circle", "pf-login-circle-t", mode === "login" ? "pf-is-txr" : null].filter(Boolean).join(" ")} />

          <div className={["pf-login-switch-container", mode === "login" ? "pf-is-hidden" : null].filter(Boolean).join(" ")}>
            <h2 className="pf-login-title" style={{ letterSpacing: 0 }}>
              Welcome Back
            </h2>
            <p className="pf-login-description">已有账号？直接登录继续阅读。</p>
            <button
              className="pf-login-button pf-login-switchbtn"
              type="button"
              onClick={() => {
                setGx(true);
                setTimeout(() => setGx(false), 1250);
                setMode("login");
                setError(null);
              }}
            >
              登录
            </button>
          </div>

          <div className={["pf-login-switch-container", mode === "login" ? null : "pf-is-hidden"].filter(Boolean).join(" ")}>
            <h2 className="pf-login-title" style={{ letterSpacing: 0 }}>
              Hello Friend
            </h2>
            <p className="pf-login-description">还没有账号？注册一个新账号。</p>
            <button
              className="pf-login-button pf-login-switchbtn"
              type="button"
              onClick={() => {
                setGx(true);
                setTimeout(() => setGx(false), 1250);
                setMode("register");
                setError(null);
              }}
            >
              注册
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
