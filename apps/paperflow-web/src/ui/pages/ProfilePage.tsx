import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { apiGetMyProfile, apiListFavorites, apiListFootprints, apiUpdateMyProfile, apiUploadMyAvatar } from "../data/api";
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saveError, setSaveError] = useState<unknown | null>(null);
  const { state: favoritesState } = useAsyncData((signal) => apiListFavorites(1, 50, accessToken, signal), [accessToken]);
  const { state: footprintsState } = useAsyncData((signal) => apiListFootprints(1, 50, accessToken, signal), [accessToken]);

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
            <div className="pf-row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
              <span className="pf-muted2">我的统计</span>
              <div className="pf-row" style={{ flexWrap: "wrap" }}>
                <span className="pf-pill">收藏 {favoritesState.data?.page?.totalItems ?? favoritesState.data?.items?.length ?? 0}</span>
                <span className="pf-pill">足迹 {footprintsState.data?.page?.totalItems ?? footprintsState.data?.items?.length ?? 0}</span>
                <Link className="pf-navlink" to="/favorites">查看收藏</Link>
                <Link className="pf-navlink" to="/footprints">查看足迹</Link>
              </div>
            </div>
            <div className="pf-divider" />
            <div className="pf-grid" style={{ gap: 10 }}>
              <label className="pf-grid" style={{ gap: 6 }}>
                <span className="pf-muted">昵称</span>
                <input className="pf-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} />
              </label>
              <label className="pf-grid" style={{ gap: 6 }}>
                <span className="pf-muted">本地头像上传</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingAvatar(true);
                    setSaveError(null);
                    try {
                      const profile = await apiUploadMyAvatar(accessToken, file);
                      setAvatarUrl(profile.avatarUrl ?? "");
                      await auth.refreshMe();
                      reload();
                    } catch (err) {
                      setSaveError(err);
                    } finally {
                      setUploadingAvatar(false);
                      e.currentTarget.value = "";
                    }
                  }}
                />
                <span className="pf-muted2">{uploadingAvatar ? "上传中..." : "支持 png/jpg/webp，最大 2MB"}</span>
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
                        avatarUrl: avatarUrl || null,
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
