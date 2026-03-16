import React from "react";
import { ErrorState } from "./ErrorState";
import { Button } from "./Button";
import { Card } from "./Card";

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: unknown | null }> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch() {}

  render() {
    if (this.state.error) {
      return (
        <div className="pf-container">
          <div className="pf-page">
            <div className="pf-page__header">
              <h2>应用出错</h2>
              <div className="pf-subtitle">页面渲染出现未捕获异常。</div>
            </div>
            <Card>
              <ErrorState error={this.state.error} title="渲染失败" />
              <div style={{ marginTop: 12 }} className="pf-row">
                <Button
                  onClick={() => {
                    this.setState({ error: null });
                  }}
                >
                  尝试恢复
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  刷新页面
                </Button>
              </div>
            </Card>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
