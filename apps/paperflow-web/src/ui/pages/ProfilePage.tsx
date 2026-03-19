import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { apiGetMyProfile, apiUpdateMyProfile } from "../data/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";

export function ProfilePage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const { state, reload } = useAsyncData((signal) => apiGetMyProfile(accessToken, signal), [accessToken]);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      setDisplayName(state.data.displayName ?? "");
      setAvatarUrl(state.data.avatarUrl ?? "");
      setBio(state.data.bio ?? "");
    }
  }, [state]);

  return (
    <Page title="个人主页" subtitle="支持修改昵称、头像与简介。">
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {saveError ? <ErrorState error={saveError} title="保存失败" /> : null}
      {state.status === "success" ? (
        <Card>
          <div className="pf-grid" style={{ gap: 12 }}>
            <div className="pf-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="pf-row">
                {avatarUrl.trim() ? <img src={avatarUrl} alt="avatar" className="pf-avatar" /> : <div className="pf-avatar">{displayName.slice(0, 1) || "U"}</div>}
                <div className="pf-grid" style={{ gap: 4 }}>
                  <div style={{ fontWeight: 800 }}>{state.data.displayName}</div>
                  <div className="pf-muted2">{state.data.email}</div>
                </div>
              </div>
              <div className="pf-row" style={{ flexWrap: "wrap" }}>
                <span className="pf-pill">{state.data.status}</span>
                <span className="pf-pill">{state.data.emailVerified ? "邮箱已验证" : "邮箱未验证"}</span>
              </div>
            </div>
            <div className="pf-divider" />
            <div className="pf-grid" style={{ gap: 10 }}>
              <label className="pf-grid" style={{ gap: 6 }}>
                <span className="pf-muted">昵称</span>
                <input className="pf-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} />
              </label>
              <label className="pf-grid" style={{ gap: 6 }}>
                <span className="pf-muted">头像 URL</span>
                <input className="pf-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} maxLength={512} />
              </label>
              <label className="pf-grid" style={{ gap: 6 }}>
                <span className="pf-muted">个人简介</span>
                <textarea className="pf-textarea" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} />
              </label>
              <div>
                <Button
                  variant="primary"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setSaveError(null);
                    try {
                      await apiUpdateMyProfile(accessToken, {
                        displayName: displayName.trim(),
                        avatarUrl: avatarUrl.trim() || null,
                        bio: bio.trim() || null
                      });
                      await auth.refreshMe();
                      reload();
                    } catch (e) {
                      setSaveError(e);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "保存中..." : "保存资料"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </Page>
  );
}

