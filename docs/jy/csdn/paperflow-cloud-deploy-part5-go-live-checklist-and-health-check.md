# 项目发到云上以后，我们怎么用最小健康检查确认它真的跑起来了

> 摘要：我们一开始也会习惯性地先打开首页看一眼，但后来做着做着就发现，这样很容易漏掉真正关键的链路。PaperFlow 在本地和部署侧都补了一套最小健康检查与巡检脚本：本地启动后会校验服务健康和网关转发，部署侧则会检查健康接口、帖子列表、每日数据覆盖情况，以及可选的只读远端核查。本文按我们自己排坑的顺序，整理这套检查链路是怎么形成的。文中的地址、远端路径和巡检目标都只保留结构示意，不直接暴露可用于攻击的真实部署信息。
>
> 标签：健康检查｜上线验收｜PowerShell｜Spring Boot｜巡检脚本｜部署实践

系统一旦发到云上，大家第一反应通常都是：

- 打开首页；
- 点两下页面；
- 能看见内容就觉得“差不多上线成功了”。

这个动作当然有必要，但它解决的更像是“肉眼感知”。  
而上线真正需要确认的，是另一件事：

> 最小主链路到底通没通。

先说明一下，这篇也不会放真实公网地址、服务器登录方式、远端目录结构、定时任务真实位置这些敏感内容。  
能公开讲的，我会尽量只讲检查思路、脚本结构和判断逻辑。

PaperFlow 后来比较稳定的一点，就是我们慢慢把“启动成功”理解成一组可验证的 HTTP 事实，而不是某个进程看起来还活着、某个页面恰好能打开。

## 1. 本地启动时，我们验证的是 4 段链路，不只是 4 个进程

`scripts/dev.ps1` 在把几个服务拉起来之后，不会直接宣布成功，而是会主动跑一组探测：

```powershell
if (!(Wait-Http "http://localhost:$ContentServicePort/api/v1/actuator/health" 120)) { throw "content-service not ready" }
if (!(Wait-Http "http://localhost:$UserServicePort/api/v1/actuator/health" 120)) { throw "user-service not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/actuator/health" 120)) { throw "api-gateway not ready" }
if (!(Wait-Http "http://localhost:$GatewayPort/api/v1/posts?page[number]=1&page[size]=1" 120)) { throw "gateway upstream route not ready" }
```

我们后来看，这四步虽然不复杂，但含义其实不一样。

前三步是在确认服务进程和基础 HTTP 能力已经起来。  
最后一步则是在确认：

- 网关路由正常；
- 内容服务能响应；
- 一条真实业务接口可以穿过网关跑通。

也就是说，它验证的不是“服务活着”，而是“系统开始具备最小可用性”。

## 2. 健康检查真正有用的地方，是能把问题层级切开

如果没有这几步检查，启动失败时你看到的通常只是：

- 页面打不开；
- 页面能开但没数据；
- 接口偶尔通、偶尔不通。

这时排查会特别乱，因为你会同时怀疑：

- Java 服务没起来；
- 网关没起来；
- 前端路径错了；
- 数据库没初始化；
- 或者只是某个接口转发失败。

而像 `dev.ps1` 这种分层检查能快速把问题切开：

- `content-service` health 不通，先看内容服务；
- `user-service` health 不通，先看用户服务；
- 网关 health 不通，先看网关本身；
- 前三项都通，但 `/api/v1/posts` 不通，就看网关到下游的转发或内容服务数据链路。

很多时候，能快速定位问题，不靠很复杂的平台，靠的就是这种“检查顺序别乱掉”。

## 3. 部署环境里，我们更关心“能不能被验证”的巡检结果

PaperFlow 仓库里现在还有一份我们经常参考的脚本：

```text
scripts/check-prod-daily-health.ps1
```

为了公开发帖不暴露真实部署信息，这里只保留参数结构：

```powershell
[string]$BaseUrl = "https://your-domain.example"
```

而且它做的事，远远不只是访问一个 health 接口。

## 4. 第一层巡检：先看健康接口到底返回了什么

脚本里有一个 `Test-HealthEndpoint()`：

```powershell
function Test-HealthEndpoint([string]$Url) {
  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
    $contentType = [string]$resp.Headers["Content-Type"]
    $body = [string]$resp.Content
    $kind = "unknown"
    if ($contentType -match "json" -or $body.TrimStart().StartsWith("{")) {
      $kind = "json"
    } elseif ($body -match "<!doctype html>|<html") {
      $kind = "html"
    }
    return [pscustomobject]@{
      Url = $Url
      StatusCode = [int]$resp.StatusCode
      Kind = $kind
      Sample = if ($body.Length -gt 120) { $body.Substring(0, 120) } else { $body }
    }
  } catch {
    ...
  }
}
```

我们觉得这个实现很实在。  
它检查的不只是“是不是 200”，还要区分返回的是：

- JSON；
- HTML；
- 还是错误。

为什么这点重要？  
因为生产环境里很常见的一类问题就是：

- 你以为自己打到了健康接口；
- 实际返回的是前端的 HTML 页面；
- 表面上状态码正常，实际上路径已经配错了。

所以脚本不是只看 `statusCode`，而是连返回内容形态一起判断。

## 5. 第二层巡检：我们更关心真实业务接口，而不是只看 health

脚本里拿最近帖子数据的函数大概是这个结构：

```powershell
function Get-RecentPosts([string]$RootUrl, [int]$Pages, [int]$Size) {
  $all = @()
  for ($page = 1; $page -le $Pages; $page++) {
    $url = "$RootUrl/api/v1/posts?page[number]=$page&page[size]=$Size"
    $resp = Invoke-RestMethod -Method GET -Uri $url -Headers @{ "X-Request-Id" = "health-check-$page" } -TimeoutSec 30
    $items = @($resp.data.items)
    if ($items.Count -eq 0) { break }
    $all += $items
    if ($items.Count -lt $Size) { break }
  }
  return @($all)
}
```

这一层意义很大，因为它在验证的是一条真实业务链路：

- HTTP 能通；
- 网关路径正确；
- 内容服务可用；
- 数据查询正常；
- 返回结构符合预期。

很多系统 health 是绿的，但业务其实已经半死不活。  
所以我们后来会把“真实业务接口探测”当成上线后第一轮确认的一部分，而不是可有可无的附加项。

## 6. 第三层巡检：不仅看能不能返回，还看数据有没有继续更新

这份脚本里还有一个更像“日常巡检”的部分。  
它会对最近几天的数据做来源和覆盖统计：

```powershell
$expectedSources = @(
  "agent-medical-review",
  "agent-cybersecurity-review",
  "agent-bigdata-review"
)
...
foreach ($day in $days) {
  foreach ($source in $expectedSources) {
    $count = @($recentRows | Where-Object { $_.Day -eq $day -and $_.Source -eq $source }).Count
    if ($count -ne $ExpectedPerTopicPerDay) {
      $countAnomalies += ...
    }
    if ($count -lt $ExpectedPerTopicPerDay) {
      $coverageIssues += ...
    }
  }
}
```

这说明这份脚本已经不只是“服务在不在线”，而是在回答：

- 每日任务有没有正常产出内容；
- 哪个来源今天少了；
- 哪一天的数据覆盖不完整；
- 有没有重复标题异常。

也就是说，系统健康在这里已经从“接口健康”延伸到了“业务运行健康”。

我们后来越来越认同这种思路，因为用户看到的不是 health 接口，而是今天有没有新内容、数据有没有断档。

## 7. 还可以再加一层：只读远端核查

这份脚本里还留了一个可选开关：

```powershell
[switch]$TryRemoteSsh
```

开启后，它会在远端做只读检查，拉一些部署现场信息。为了安全起见，下面只保留“检查哪些内容”，不保留真实机器上的具体目录：

```bash
echo "---CRONTAB---"
<check scheduled tasks>
echo "---RUN_SCRIPTS---"
<check daily job scripts>
echo "---LOG_FILES---"
<check daily job logs>
```

这一步也比较有价值，因为它没有直接进入“上去改机器”的模式，而是先做只读观察：

- 计划任务有没有挂上；
- 运行脚本在不在；
- 日志文件有没有持续产出；
- 配置里有没有相关开关。

很多部署问题最怕一上来就乱改。  
先做只读核查，至少能先把现场看清楚。

## 8. 为什么我们不把“打开首页”当成部署成功标准

因为首页能打开，只能说明非常有限的事情：

- Nginx 可能在工作；
- 前端静态资源可能能加载；
- 但不代表业务服务一定正常；
- 更不代表数据链路和定时任务正常。

反过来，如果你先跑一遍最小健康检查，哪怕不打开页面，也已经能确认很多关键事实：

- 基础服务起来了没有；
- 网关转发能不能走通；
- 业务查询接口有没有结果；
- 每日任务数据有没有持续进入系统。

这比“肉眼看起来像没问题”更接近真正的部署验收。

## 9. 对我们这个学生团队来说，健康检查不是附属品，而是实现链路的一部分

在我们这个项目一路做下来的过程中，我们慢慢不再把健康检查理解成“部署以后再补一下”。  
更好的做法是，在脚本、网关、业务接口、巡检逻辑里，一开始就留出这些验证入口。

PaperFlow 现在这一套虽然不复杂，但已经形成了比较清晰的层次：

- 本地启动时检查服务和网关链路；
- 生产环境里检查 health 和真实业务接口；
- 再进一步检查数据覆盖和任务产出；
- 必要时补一层只读远端核查。

这套方法最大的价值，不是它多高级，而是它让“系统到底有没有真正跑起来”这件事变得可回答。

## 10. 最后

如果你也是类似的大学生团队项目，也可以考虑在部署完成后不要只看页面。  
至少给自己准备一套最小验收问题：

- 健康接口通不通；
- 真实业务接口通不通；
- 返回的是 JSON 还是错误页面；
- 数据有没有持续更新；
- 定时任务是不是还活着。

另外，像这种公开发帖的部署复盘，我们也会尽量守几个底线：

- 不放真实公网 IP、域名、远端目录；
- 不放服务器登录方式、凭证、密钥、令牌；
- 不放能直接暴露计划任务和机器结构的完整细节；
- 只保留别人能复用的检查顺序、接口类型和排坑思路。

对我们这个 PaperFlow 学生项目来说，这套最小健康检查已经比“打开首页看看”可靠太多。  
它当然不是万能的，但已经足够帮助我们把大多数部署问题挡在第一时间。
