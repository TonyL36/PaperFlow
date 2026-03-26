# 11 文档生成插件：扫描 Controller 注解 → 生成 Markdown → 可选上传

## 功能目标

- “文档与实现同源”：不手写接口文档，避免文档漂移
- 构建时自动生成 Markdown（可入库到 `docs/generated/`）
- 可选上传到文档服务（HTTP PUT，token 走环境变量）

## 端到端工作流

1. 构建（Maven/Gradle）触发任务
2. 扫描 `src/main/java` 下的 Java 文件
3. 找到 `@RestController/@Controller` 类
4. 解析类/方法上的 Mapping 注解（`@GetMapping`、`@PostMapping`…）
5. 合成完整 path（basePath + classMapping + methodMapping）
6. 生成 Markdown：
   - endpoints 总表
   - 按 Controller 分组的详细表
7. 如果配置了 `uploadUrl`：
   - 读取 token 环境变量
   - HTTP PUT 上传文档

## 关键代码原文 + 解读

### 11.1 扫描器：ControllerScanner（核心）

代码位置：[ControllerScanner.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-generator-core/src/main/java/com/paperflow/apidoc/ControllerScanner.java)

下面是核心扫描逻辑（节选）：

```java
public final class ControllerScanner {
  private static final List<String> CONTROLLER_ANNOTATIONS = List.of("RestController", "Controller");
  private final JavaParser parser = new JavaParser();

  public List<Endpoint> scan(DocConfig config) throws IOException {
    try (Stream<Path> paths = Files.walk(config.sourceDir())) {
      List<Path> javaFiles = paths
          .filter(p -> p.toString().endsWith(".java"))
          .sorted(Comparator.naturalOrder())
          .toList();
      List<Endpoint> endpoints = new ArrayList<>();
      for (Path file : javaFiles) {
        ParseResult<CompilationUnit> result = parser.parse(file);
        if (result.getResult().isEmpty()) {
          continue;
        }
        CompilationUnit cu = result.getResult().get();

        Optional<String> pkg = cu.getPackageDeclaration().map(d -> d.getNameAsString());
        if (!config.includePackages().isEmpty()) {
          if (pkg.isEmpty() || config.includePackages().stream().noneMatch(p -> pkg.get().startsWith(p))) {
            continue;
          }
        }

        for (ClassOrInterfaceDeclaration cls : cu.findAll(ClassOrInterfaceDeclaration.class)) {
          if (!isController(cls)) {
            continue;
          }

          String controllerName = cls.getNameAsString();
          List<String> classPaths = extractPaths(cls.getAnnotations(), "RequestMapping").orElse(List.of(""));

          for (MethodDeclaration method : cls.getMethods()) {
            Optional<HttpMapping> mapping = extractHttpMapping(method.getAnnotations());
            if (mapping.isEmpty()) {
              continue;
            }
            HttpMapping m = mapping.get();

            for (String classPath : classPaths) {
              for (String methodPath : m.paths()) {
                String fullPath = joinPath(config.basePath().orElse(""), classPath, methodPath);
                Endpoint endpoint = new Endpoint(
                    controllerName,
                    method.getNameAsString(),
                    m.httpMethod(),
                    fullPath,
                    Optional.empty(),
                    extractParams(method),
                    extractRequestBodyType(method),
                    extractResponseBodyType(method)
                );
                endpoints.add(endpoint);
              }
            }
          }
        }
      }
      return endpoints.stream()
          .sorted(Comparator
              .comparing(Endpoint::path)
              .thenComparing(Endpoint::httpMethod)
              .thenComparing(Endpoint::controller)
              .thenComparing(Endpoint::methodName))
          .toList();
    }
  }
}
```

解释（扫描设计要点）：

- `Files.walk(sourceDir)`：按目录遍历全部 Java 文件，适合“代码即文档”的工程形态。
- `includePackages`：允许只扫描 `com.paperflow.user.api` 之类的包，避免把非对外 Controller 混进文档。
- `isController(cls)`：以注解名识别 Controller（`RestController/Controller`）。
- 合并 path：
  - 类级 `@RequestMapping("/posts")`
  - 方法级 `@GetMapping("/{id}")`
  - basePath（例如 `/api/v1`）
  - 通过 `joinPath(...)` 合成标准化路径。
- 参数解析：
  - 识别 `@PathVariable/@RequestParam/@RequestHeader`
  - `@RequestBody` 用 `extractRequestBodyType` 记录 body 类型
- 返回类型推断：
  - 如果是 `ResponseEntity<T>`，提取 T

### 11.2 渲染器：MarkdownRenderer

代码位置：[MarkdownRenderer.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-generator-core/src/main/java/com/paperflow/apidoc/MarkdownRenderer.java)

```java
public final class MarkdownRenderer {
  public String render(DocConfig config, List<Endpoint> endpoints) {
    Map<String, List<Endpoint>> byController = endpoints.stream()
        .collect(Collectors.groupingBy(Endpoint::controller, LinkedHashMap::new, Collectors.toList()));

    StringBuilder sb = new StringBuilder();
    sb.append("# ").append(config.title()).append("\n\n");
    sb.append("- API Version: ").append(config.apiVersion()).append("\n");
    sb.append("- Generated At: ").append(OffsetDateTime.now().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)).append("\n\n");

    sb.append("## Endpoints\n\n");
    sb.append("| Method | Path | Controller#Method |\n");
    sb.append("|---|---|---|\n");
    for (Endpoint e : endpoints) {
      sb.append("| ").append(e.httpMethod()).append(" | ").append(escapePipes(e.path())).append(" | ")
          .append(escapePipes(e.controller())).append("#").append(escapePipes(e.methodName()))
          .append(" |\n");
    }
    sb.append("\n");
    ...
    return sb.toString();
  }
}
```

解释：

- “先总表、再分组细节”的结构更适合人读
- `escapePipes` 处理 `|` 防止破坏 Markdown 表格

### 11.3 Maven 插件入口：GenerateApiDocMojo

代码位置：[GenerateApiDocMojo.java](file:///f:/Gitee/PaperFlow/PaperFlow/backend/tools/apidoc/apidoc-maven-plugin/src/main/java/com/paperflow/apidoc/maven/GenerateApiDocMojo.java)

```java
@Mojo(name = "generate-and-upload", defaultPhase = LifecyclePhase.VERIFY, threadSafe = true)
public final class GenerateApiDocMojo extends AbstractMojo {
  @Override
  public void execute() throws MojoExecutionException {
    try {
      DocConfig config = new DocConfig(
          title,
          apiVersion,
          Path.of(sourceDir),
          Path.of(outputFile),
          Optional.ofNullable(basePath).filter(s -> !s.isBlank()),
          includePackages == null ? List.of() : includePackages
      );

      ApiDocGenerator generator = new ApiDocGenerator();
      Path out = generator.generate(config);
      getLog().info("generated api doc: " + out);

      if (uploadUrl != null && !uploadUrl.isBlank()) {
        String token = Optional.ofNullable(uploadTokenEnv)
            .map(System::getenv)
            .orElse(null);
        DocUploader uploader = new HttpPutUploader(URI.create(uploadUrl), Optional.ofNullable(token));
        uploader.upload(out);
        getLog().info("uploaded api doc to: " + uploadUrl);
      } else {
        getLog().info("upload skipped (uploadUrl is empty)");
      }
    } catch (Exception e) {
      throw new MojoExecutionException("generate-and-upload failed", e);
    }
  }
}
```

解释：

- 默认绑定到 `verify` 阶段：不会影响编译，但会在“质量门禁”阶段生成文档
- 上传 token 不写死在配置里，走环境变量（避免泄露）

## 如何在服务模块启用

示例已在以下 pom 中配置：

- [user-service pom.xml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/user-service/pom.xml)
- [content-service pom.xml](file:///f:/Gitee/PaperFlow/PaperFlow/backend/services/content-service/pom.xml)
