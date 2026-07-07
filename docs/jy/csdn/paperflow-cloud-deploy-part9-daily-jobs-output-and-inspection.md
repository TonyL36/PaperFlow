# 服务活着不等于每天有新内容：我们怎么检查定时任务、结果文件和上传产出

> 摘要：很多内容型系统上线之后，会把注意力集中在服务是否存活、页面是否可访问，但真正决定系统有没有持续价值的，往往是另一条链：定时任务有没有按时跑、候选内容有没有被筛出来、审核后的数据有没有成功上传、线上内容是不是持续增长。PaperFlow 现在这条链并不是靠一个“大而全”的调度平台完成的，而是用一组 PowerShell 脚本、状态文件、锁文件、上传结果 CSV 和巡检脚本串起来。本文结合真实脚本，整理我们是怎么检查“有服务不等于有产出”这件事的。文中的远端检查方式和运行细节只保留排查结构，不直接暴露真实部署信息。
>
> 标签：定时任务｜巡检｜PowerShell｜内容生产｜运维实践｜线上系统

先说明一下，这篇只讲每日内容链路的检查思路，不会放真实远端路径、任务位置或者能直接摸清机器结构的敏感信息。

一个系统一旦做出“每日更新内容”的承诺，判断它是否健康的标准就会变。

这时候你不能只问：

- 前端能不能打开；
- 网关是不是健康；
- 接口有没有响应。

你还得继续问：

- 今天有没有新增内容；
- 每个主题是不是都按预期产出；
- 上传有没有失败；
- 有没有重复内容被塞进去；
- 定时任务到底是没跑，还是跑了但没生成结果。

PaperFlow 当前这条每日内容链路，虽然没上重型调度平台，但已经有一套很清晰的工程骨架。

## 1. 在我们这个项目里，我们更愿意把“每日内容生产”理解成一条流水线

从现有脚本看，PaperFlow 的每日内容流程并不是“跑个任务就结束”，而是至少包含几步：

```text
拉取线上现状
  -> 准备待审核内容
  -> 批量做 review 判定
  -> 把 APPROVED 项上传到业务系统
  -> 记录 ok / fail / skip 结果
  -> 更新状态文件
  -> 再回头检查线上总量和重复情况
```

这点在 `run-topic-daily.ps1` 里体现得非常明显。

它一开始先读线上现状：

```powershell
$start = GetTopicStats -baseUrl $BaseUrl -sourceName $source
Write-Host ("START topic={0} count={1} dup={2}" -f $Topic, $start.count, $start.dup)
if ($start.dup -gt 0) { throw "duplicate titles exist online, please clean duplicates first" }
```

然后准备 review 数据：

```powershell
& (Join-Path $root "prepare-topic-papers-review.ps1") `
  -BaseUrl $BaseUrl `
  -Email $Email `
  -Password $Password `
  -Topic $Topic `
  -TargetCount $DailyCount `
  -Model $Model
```

再把可上传项筛出来：

```powershell
foreach ($it in $items) {
  $sum = [string]$it.aiSummary
  if ($sum -match "AI service unavailable") {
    $it.reviewStatus = "REJECTED"
    $it.reviewerNote = "AI unavailable"
  } else {
    $it.reviewStatus = "APPROVED"
    $it.reviewerNote = "approved by topic daily pipeline"
  }
}
```

最后再调上传脚本：

```powershell
& (Join-Path $root "upload-reviewed-papers.ps1") `
  -BaseUrl $BaseUrl `
  -Email $Email `
  -Password $Password `
  -ReviewJsonPath $review `
  -Source $source `
  -StatePath $StatePath
```

这说明它本质上已经是一条小型生产流水线，而不是一个“批处理命令”。

## 2. 只看任务是否触发还不够，我们更看重任务有没有留下“产出证据”

这是我们在这类系统实现过程中逐渐重视的一点。

很多团队会说：

- cron 配好了；
- 脚本也会跑；
- 日志看着也在刷。

但这些都不等于真的有内容进入系统。

PaperFlow 这里有一个很好的设计，就是上传脚本会把结果落成三类 CSV：

```powershell
$okPath = Join-Path $outDir ($prefix + "-ok-" + $ts + ".csv")
$failPath = Join-Path $outDir ($prefix + "-fail-" + $ts + ".csv")
$skipPath = Join-Path $outDir ($prefix + "-skip-" + $ts + ".csv")

$ok | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $okPath
$fail | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $failPath
$skip | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $skipPath
```

这三类文件特别有价值，因为它们把任务结果从“控制台输出”变成了可追踪的产物：

- `ok` 表示真正写进系统的内容；
- `fail` 表示上传失败的条目；
- `skip` 表示被重复判定或被状态去重的条目。

只要这些文件还在，你就能回头回答：

- 这次任务到底做了什么；
- 为什么今天只上了 6 篇，不是 10 篇；
- 是 AI review 失败了，还是上传阶段被跳过了。

## 3. 锁文件和状态文件看起来不起眼，但它们决定任务会不会越跑越乱

`run-topic-daily.ps1` 里有两类很关键的文件：

- 锁文件
- 状态文件

锁文件的作用很直白：防止同一主题任务重复并发执行。

```powershell
if (Test-Path $LockFile) {
  $lockAgeMinutes = ((Get-Date) - (Get-Item $LockFile).LastWriteTime).TotalMinutes
  if ($lockAgeMinutes -gt $lockTtlMinutes) {
    Remove-Item -Force $LockFile
    Write-Host ("WARN stale lock removed topic={0} age_minutes={1:n1}" -f $Topic, $lockAgeMinutes)
  } else {
    throw "$Topic daily job already running"
  }
}
```

它甚至还考虑了陈旧锁清理，不会因为上一次异常中断就永久卡死。

而状态文件则是另一层防重：

```powershell
$state = LoadState -path $StatePath
...
$state.sourceIds = @($knownSourceIds.Keys | Sort-Object)
SaveState -path $StatePath -state $state
```

这意味着任务不是每次都从“完全失忆”开始，而是会记住自己以前已经处理过哪些来源项。

这类细节平时不显眼，但一旦没有它们，系统很快就会开始：

- 重复发相同内容；
- 并发跑两次同一主题；
- 日志看起来挺热闹，但线上开始出现脏数据。

## 4. 这条流水线有一个比较关键的点：它先检查重复，再决定要不要继续

以 `run-medical-daily.ps1` 为例，任务一开始就会先拉线上数据统计：

```powershell
$start = GetMedicalStats -baseUrl $BaseUrl
Write-Host ("START count={0} dup={1}" -f $start.count, $start.dup)
if ($start.dup -gt 0) { throw "duplicate titles exist online, please clean duplicates first" }
```

上传后还会再检查一遍：

```powershell
$end = GetMedicalStats -baseUrl $BaseUrl
if ($end.dup -gt 0) { throw "duplicates detected after upload" }
```

这个思路在我们这个项目里比较适合。  
因为它不是等线上已经乱成一团才回头治理，而是在任务入口和出口都卡住重复问题。

对内容系统来说，这比“先都发上去，后面再清洗”稳得多。

## 5. 上传阶段真正决定的是“有没有写进业务系统”，不是“本地 JSON 生成了没有”

很多人容易把“中间产物生成成功”误当成“任务完成成功”。  
但在 PaperFlow 这里，最终是否落地其实取决于上传脚本。

`upload-reviewed-papers.ps1` 的关键动作是：

```powershell
$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/auth/login" ...
$token = $login.data.accessToken
```

拿到 token 之后，才真正调用：

```powershell
$res = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/papers/ingest" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" -Body $bodyBytes
```

也就是说，这条每日任务链最终还是要回到正式业务系统里：

- 先登录；
- 再带认证头；
- 调真实业务 API；
- 拿到真实返回。

这一点很重要，因为它意味着每日任务不是“往某个离线目录写文件”，而是在走真实线上入口。  
这反过来也说明，任务是否成功，本身就能反向验证：

- 登录接口是否正常；
- 受保护的 ingest 接口是否正常；
- 业务系统写入链路是否正常。

## 6. 线上巡检不该只看服务健康，还得看“最近几天每个来源到底产了多少”

这件事仓库里其实已经有现成实现了：

```text
scripts/check-prod-daily-health.ps1
```

这份脚本里最有价值的一段，是它会检查最近几天不同来源的覆盖情况：

```powershell
$expectedSources = @(
  "agent-medical-review",
  "agent-cybersecurity-review",
  "agent-bigdata-review"
)
...
if ($count -lt $ExpectedPerTopicPerDay) {
  $coverageIssues += ...
}
```

也就是说，这份巡检不是只问：

- 服务活不活；
- health 绿不绿。

它还会继续问：

- 医疗主题今天够不够 10 篇；
- 网络安全主题是不是掉量了；
- 大数据主题是不是没产出；
- 有没有重复标题。

这种检查方式更接近“内容系统真正的健康定义”。

因为用户感知到的不是你的 `actuator/health`，而是今天有没有新内容。

## 7. 如果线上没有新内容，我们不会先怀疑某一个点，而是按流水线阶段往下切

这也是目前比较固定的一套排查顺序。

如果发现“今天没有新增内容”，通常可以按下面顺序看：

1. 巡检脚本里的 `COVERAGE_ISSUES` 和 `COUNT_ANOMALIES`  
2. 最近一次每日任务日志里有没有 `START / DONE / FAIL / SKIP` 关键信息  
3. 锁文件是不是卡住了旧任务  
4. `review json` 有没有真正生成  
5. `ok / fail / skip csv` 哪一类数量异常  
6. 登录和 `/api/v1/papers/ingest` 是否还能正常工作  
7. 线上帖子总量和去重状态是否异常

这种方式比直接 SSH 上去翻半天日志有效很多，因为它是在按流水线断点排查，而不是按“看到什么查什么”。

## 8. 对我们这个学生团队来说，内容系统的上线标准必须包含“持续产出能力”

在我们这个项目一路做下来的过程中，我们越来越不接受一种说法：

- 页面能开；
- 接口能调；
- 所以上线没问题。

对 PaperFlow 这种带每日内容更新能力的系统来说，这最多只能证明“系统没死”，不能证明“系统在工作”。

真正更像上线标准的，是下面这些问题能否被回答：

- 今天产了多少篇；
- 每个来源是否达标；
- 重复是否被拦住；
- 上传失败了多少；
- 失败是否有可回看的 CSV 或日志证据；
- 任务是不是会因为旧锁或异常中断而卡住。

只要这些问题没有答案，你的系统就还谈不上“稳定生产”。

## 9. 最后

如果是类似的大学生团队项目，并且带有定时内容生产或每日同步任务，建议尽早把“产出证据”这件事设计进去。

最起码要有这些东西：

- 锁文件或并发保护；
- 状态文件或去重记忆；
- 真实上传结果记录；
- 最近几天的覆盖巡检；
- 明确区分 `ok / fail / skip` 的输出。

对我们这个 PaperFlow 学生项目来说，这套东西并不重，但已经足够把“服务活着”和“系统真的在持续产出”分开看。  
而这种区分，恰恰是线上系统成熟度最容易被低估的一部分。
