import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { apiAdminGetMailTemplate, apiAdminListMailTemplateTypes, apiAdminUpdateMailTemplate } from "../data/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { Page } from "../layout/Page";

export function AdminMailSettingsPage() {
  const auth = useAuth();
  const accessToken = auth.state.status === "authenticated" ? auth.state.accessToken : "";
  const [selectedType, setSelectedType] = useState("REGISTER_VERIFICATION");
  const { state: typesState } = useAsyncData((signal) => apiAdminListMailTemplateTypes(accessToken, signal), [accessToken]);
  const { state, reload } = useAsyncData((signal) => apiAdminGetMailTemplate(accessToken, selectedType, signal), [accessToken, selectedType]);
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown | null>(null);

  useEffect(() => {
    if (typesState.status === "success") {
      const keys = Object.keys(typesState.data || {});
      if (keys.length > 0 && !keys.includes(selectedType)) {
        setSelectedType(keys[0]);
      }
    }
  }, [typesState, selectedType]);

  useEffect(() => {
    if (state.status === "success") {
      setSubjectTemplate(state.data.subjectTemplate ?? "");
      setBodyTemplate(state.data.bodyTemplate ?? "");
    }
  }, [state]);

  return (
    <Page title="邮件模板设置" subtitle="支持注册、找回密码、绑定邮箱三类验证码模板单独配置。">
      {state.status === "loading" ? <Spinner label="加载中..." /> : null}
      {state.status === "error" ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {saveError ? <ErrorState error={saveError} title="保存失败" /> : null}
      {state.status === "success" ? (
        <Card>
          <div className="pf-grid" style={{ gap: 10 }}>
            <label className="pf-grid" style={{ gap: 6 }}>
              <span className="pf-muted">模板类型</span>
              <select className="pf-select" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                {Object.entries(typesState.data || {}).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}（{k}）
                  </option>
                ))}
              </select>
            </label>
            <div className="pf-alert">
              <div className="pf-alert__title">可用占位符</div>
              <div className="pf-row" style={{ flexWrap: "wrap" }}>
                {state.data.placeholders?.map((item) => (
                  <span key={item} className="pf-pill">{item}</span>
                ))}
              </div>
            </div>
            <label className="pf-grid" style={{ gap: 6 }}>
              <span className="pf-muted">邮件主题模板</span>
              <input className="pf-input" value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} maxLength={255} />
            </label>
            <label className="pf-grid" style={{ gap: 6 }}>
              <span className="pf-muted">邮件正文模板</span>
              <textarea className="pf-textarea" value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} rows={10} maxLength={4000} />
            </label>
            <div>
              <Button
                variant="primary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setSaveError(null);
                  try {
                    await apiAdminUpdateMailTemplate(accessToken, selectedType, { subjectTemplate, bodyTemplate });
                    reload();
                  } catch (e) {
                    setSaveError(e);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "保存中..." : "保存模板"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </Page>
  );
}

