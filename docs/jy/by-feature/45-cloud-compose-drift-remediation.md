# 45 云端 compose 漂移收口与发布防护

## 背景

- 这次问题不是代码逻辑 bug，而是云端 `compose.prod.yml` 和仓库基线发生了历史漂移
- 风险点很高：现网容器暂时可能还能跑，但一旦按错误的 `compose` 执行重建，后端服务就可能被错误镜像替换
- 目标不是“记住这次踩坑”，而是把排查方法、修复步骤和防再犯机制固定下来

## 问题现象

- 远端 `/opt/paperflow/docker/compose.prod.yml` 与仓库版不一致
- `user-service`、`content-service`、`api-gateway` 的 `dockerfile` 被错误写成了 `docker/Dockerfile.frontend`
- `content-service` 还缺少：
  - `PAPERFLOW_DEMO_INGEST_ENABLED`
  - `PAPERFLOW_DEMO_INGEST_TOKEN`
  - `PF_PAPERS_CACHE_DIR`
  - `paper_pdf_cache_prod` 卷挂载

## 正确基线

- 正确映射应为：
  - `user-service -> docker/Dockerfile.user-service`
  - `content-service -> docker/Dockerfile.content-service`
  - `api-gateway -> docker/Dockerfile.api-gateway`
  - `frontend -> docker/Dockerfile.frontend`
- 基线文件位置： [compose.prod.yml](file:///f:/Gitee/PaperFlow/PaperFlow/docker/compose.prod.yml)

## 核对方法

先看远端文件本身：

```bash
cd /opt/paperflow
sed -n '1,120p' docker/compose.prod.yml
```

再看 Compose 展开后的真实结果：

```bash
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml config
```

最后看现网容器是否仍稳定：

```bash
docker compose --env-file docker/env/prod.env -f docker/compose.prod.yml ps
```

这里必须用“三件套”一起看：

- 远端文件内容
- `config` 展开结果
- `ps` 运行状态

只看其中一个，很容易误判“文件错了但容器还活着”这种半失真状态。

## 本次处理

### 1. 只读确认漂移

- 先读取远端 `/opt/paperflow/docker/compose.prod.yml`
- 确认三个后端服务的 `dockerfile` 确实错误指向前端 Dockerfile

### 2. 先补本地 guardrail

- 在发布脚本 [deploy-ecs-no-build.ps1](file:///f:/Gitee/PaperFlow/PaperFlow/scripts/deploy-ecs-no-build.ps1) 中新增 `Test-ComposeProdDockerfileMap`
- 发布前先校验四个核心服务的 Dockerfile 映射
- 若映射不匹配，脚本直接终止，不继续打包和上传

对应回归测试：

- [deployComposeGuardrails.test.ts](file:///f:/Gitee/PaperFlow/PaperFlow/apps/paperflow-web/src/ui/deployComposeGuardrails.test.ts)

## 3. 远端收口策略

- 先备份原始 `compose.prod.yml`
- 不做零散改行，而是直接把远端文件整体同步回仓库版
- 再补 `docker/env/prod.env` 中缺失的空值声明：
  - `PAPERFLOW_DEMO_INGEST_ENABLED=`
  - `PAPERFLOW_DEMO_INGEST_TOKEN=`
  - `PF_PAPERS_CACHE_DIR=/var/lib/paperflow/pdf-cache`

这样做的原因很直接：

- 零散改行容易漏掉卷挂载和环境变量
- 整体同步到仓库版，才能保证“仓库基线是唯一真相”

## 4. 验证结果

- 远端 `compose.prod.yml` 已回到仓库基线
- `docker compose config` 通过
- `docker compose ps` 通过
- 本轮没有重启现有容器
- 现网服务没有中断

## 5. 经验结论

- `compose` 漂移不能靠记忆排查，必须看“文件 + config + ps”
- 修漂移时优先整体同步，不建议人工零散改几行
- 发布脚本必须内置 guardrail，否则错误编排迟早会再次进入发布链路
- “线上能跑”不等于“配置正确”，很多配置问题只会在下次重建时爆炸

## 6. 后续建议

- 后续若要正式重建线上服务，优先单服务执行，避免一次性全量重建
- 每次改动 `compose.prod.yml` 后，先在本地或只读环境跑一遍 `docker compose config`
- 若未来继续扩展生产配置，先改仓库基线，再同步远端，避免双写造成再次漂移
