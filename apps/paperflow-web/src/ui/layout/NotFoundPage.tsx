import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { Page } from "./Page";

export function NotFoundPage() {
  return (
    <Page title="404" subtitle="页面不存在或已被移动。">
      <Card>
        <div className="pf-grid">
          <div>你可以回到主页继续浏览。</div>
          <div>
            <Link to="/posts">返回每日帖子</Link>
          </div>
        </div>
      </Card>
    </Page>
  );
}
