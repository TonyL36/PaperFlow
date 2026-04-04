# 2026-04-01 修复代码索引（PaperFlow）

## 说明

- 本文汇总 2026-04-01 当日修复涉及的核心代码文件
- 用于回溯“问题 -> 修复点 -> 验证”的定位链路

## A. PDF 持久化与元数据落库（content-service）

- [PublicPaperAssetsController.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/api/PublicPaperAssetsController.java)
- [PaperAssetEntity.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/domain/PaperAssetEntity.java)
- [PaperAssetRepository.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/java/com/paperflow/content/repo/PaperAssetRepository.java)
- [V7__paper_asset_cache.sql](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/db/migration/V7__paper_asset_cache.sql)
- [application.yml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/src/main/resources/application.yml)
- [compose.prod.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.prod.yml)

## B. 审核后上传与回灌重写脚本

- [prepare-medical-papers-review.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/prepare-medical-papers-review.ps1)
- [upload-reviewed-papers.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/upload-reviewed-papers.ps1)
- [rewrite-and-reupload-medical.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/rewrite-and-reupload-medical.ps1)
- [medical-seed-20260330.json](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/data/medical-seed-20260330.json)

## C. 前端正文渲染修复（Markdown inline / 列表）

- [RichText.tsx](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/components/RichText.tsx)

## D. 前台 502 修复（Nginx 动态解析上游）

- [paperflow.conf](file:///f:/Gitee/PaperFlow/PaperFlow/docker/nginx/paperflow.conf)

## E. 文档沉淀文件

- [30-cloud-deploy-guardrails.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/30-cloud-deploy-guardrails.md)
- [31-agent-batch-ingest-and-quality.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/31-agent-batch-ingest-and-quality.md)
- [2026-04-01.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/daily/2026-04-01.md)
- [00-index.md](file:///f:/Gitee/PaperFlow/PaperFlow/docs/jy/by-feature/00-index.md)
