import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { apiConfirmPasswordReset, apiRegister, apiRequestPasswordReset, apiRequestRegisterEmailCode } from "../data/api";
import "../styles/login.css";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmailInput(email: string) {
  const value = email.trim();
  if (!value) return "请输入邮箱地址";
  if (!emailPattern.test(value)) return "邮箱格式不正确";
  return null;
}

function validateRegisterInput(displayName: string, email: string, password: string, code: string) {
  const name = displayName.trim();
  if (!name) return "昵称不能为空";
  if (name.length > 64) return "昵称最多 64 个字符";
  const emailErr = validateEmailInput(email);
  if (emailErr) return emailErr;
  if (password.length < 8) return "密码至少 8 位";
  if (password.length > 128) return "密码最多 128 位";
  const verifyCode = code.trim();
  if (!verifyCode) return "请输入邮箱验证码";
  if (verifyCode.length < 4 || verifyCode.length > 12) return "验证码长度需为 4-12 位";
  return null;
}

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
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

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
  const registerValidationError = useMemo(
    () => validateRegisterInput(regDisplayName, regEmail, regPassword, regCode),
    [regDisplayName, regEmail, regPassword, regCode]
  );
  const registerEmailValidationError = useMemo(() => validateEmailInput(regEmail), [regEmail]);
  const showRegisterValidation = Boolean(regDisplayName || regEmail || regPassword || regCode);

  return (
    <div className="pf-login-page">
      <div className="pf-login-shell">
        <div className={["pf-login-container", "pf-login-a", mode === "login" ? "pf-is-txl" : null].filter(Boolean).join(" ")}>
          <form
            className="pf-login-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const validationError = validateRegisterInput(regDisplayName, regEmail, regPassword, regCode);
              if (validationError) {
                setError(validationError);
                return;
              }
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
                const emailError = validateEmailInput(regEmail);
                if (emailError) {
                  setError(emailError);
                  return;
                }
                setLoading(true);
                setError(null);
                setRegCodeHint(null);
                try {
                  const r = await apiRequestRegisterEmailCode(regEmail);
                  const dbg = r.debugCode ? `（debugCode=${r.debugCode}）` : "";
                  if (r.status === "ALREADY_REGISTERED") {
                    setRegCodeHint("该邮箱已注册，请直接登录或使用找回密码。");
                  } else if (r.status === "CODE_ALREADY_SENT") {
                    setRegCodeHint(`验证码已发送，请使用最近一次有效验证码 ${dbg}`);
                  } else {
                    setRegCodeHint(`验证码已发送 ${dbg}`);
                  }
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
            <button className="pf-login-button" type="submit" disabled={loading || !!registerValidationError}>
              {loading ? "SIGN UP..." : "SIGN UP"}
            </button>
            {showRegisterValidation && registerValidationError ? <Alert tone="warning">{registerValidationError}</Alert> : null}
            {showRegisterValidation && !registerValidationError && registerEmailValidationError ? <Alert tone="warning">{registerEmailValidationError}</Alert> : null}
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
                setResetOpen(true);
                setError(null);
                setResetError(null);
                setResetHint(null);
              }}
            >
              忘记密码
            </button>
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
      {resetOpen ? (
        <div className="pf-login-modal-mask" onClick={() => setResetOpen(false)}>
          <div className="pf-login-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="pf-login-modal-title">账号找回</h3>
            <span className="pf-login-span">输入邮箱与验证码，重置新密码</span>
            <input
              type="email"
              className="pf-login-input"
              placeholder="找回邮箱"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
            <input
              type="text"
              className="pf-login-input"
              placeholder="邮箱验证码"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
            />
            <button
              className="pf-login-link"
              type="button"
              onClick={async () => {
                setResetLoading(true);
                setResetError(null);
                setResetHint(null);
                try {
                  const r = await apiRequestPasswordReset(resetEmail);
                  const dbg = r.debugCode ? `（debugCode=${r.debugCode}）` : "";
                  setResetHint(`验证码已发送 ${dbg}`);
                } catch (e2) {
                  setResetError(e2 instanceof Error ? e2.message : String(e2));
                } finally {
                  setResetLoading(false);
                }
              }}
              disabled={resetLoading}
            >
              发送验证码
            </button>
            <input
              type="password"
              className="pf-login-input"
              placeholder="新密码（至少 8 位）"
              value={resetNewPassword}
              onChange={(e) => setResetNewPassword(e.target.value)}
            />
            <div className="pf-row" style={{ gap: 12, justifyContent: "center" }}>
              <button
                className="pf-login-button"
                type="button"
                onClick={async () => {
                  setResetLoading(true);
                  setResetError(null);
                  try {
                    await apiConfirmPasswordReset(resetEmail, resetCode, resetNewPassword);
                    setResetHint("密码已重置，请使用新密码登录");
                  } catch (e2) {
                    setResetError(e2 instanceof Error ? e2.message : String(e2));
                  } finally {
                    setResetLoading(false);
                  }
                }}
                disabled={resetLoading}
              >
                {resetLoading ? "提交中..." : "重置密码"}
              </button>
              <button
                className="pf-login-button"
                type="button"
                onClick={() => setResetOpen(false)}
                disabled={resetLoading}
              >
                关闭
              </button>
            </div>
            {resetError ? <Alert tone="danger">{resetError}</Alert> : null}
            {resetHint ? <Alert>{resetHint}</Alert> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
