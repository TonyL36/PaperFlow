package com.paperflow.apidoc.gradle;

import com.paperflow.apidoc.ApiDocGenerator;
import com.paperflow.apidoc.DocConfig;
import com.paperflow.apidoc.DocUploader;
import com.paperflow.apidoc.HttpPutUploader;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import org.gradle.api.DefaultTask;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.Optional;
import org.gradle.api.tasks.TaskAction;

public abstract class GenerateApiDocTask extends DefaultTask {
  private String title;
  private String apiVersion;
  private String sourceDir;
  private String outputFile;
  private String basePath;
  private List<String> includePackages;
  private String uploadUrl;
  private String uploadTokenEnv;

  @Input
  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  @Input
  public String getApiVersion() {
    return apiVersion;
  }

  public void setApiVersion(String apiVersion) {
    this.apiVersion = apiVersion;
  }

  @Input
  public String getSourceDir() {
    return sourceDir;
  }

  public void setSourceDir(String sourceDir) {
    this.sourceDir = sourceDir;
  }

  @Input
  public String getOutputFile() {
    return outputFile;
  }

  public void setOutputFile(String outputFile) {
    this.outputFile = outputFile;
  }

  @Input
  public String getBasePath() {
    return basePath;
  }

  public void setBasePath(String basePath) {
    this.basePath = basePath;
  }

  @Input
  @Optional
  public List<String> getIncludePackages() {
    return includePackages;
  }

  public void setIncludePackages(List<String> includePackages) {
    this.includePackages = includePackages;
  }

  @Input
  @Optional
  public String getUploadUrl() {
    return uploadUrl;
  }

  public void setUploadUrl(String uploadUrl) {
    this.uploadUrl = uploadUrl;
  }

  @Input
  public String getUploadTokenEnv() {
    return uploadTokenEnv;
  }

  public void setUploadTokenEnv(String uploadTokenEnv) {
    this.uploadTokenEnv = uploadTokenEnv;
  }

  @TaskAction
  public void run() throws Exception {
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
    getLogger().lifecycle("generated api doc: {}", out);

    if (uploadUrl != null && !uploadUrl.isBlank()) {
      String token = uploadTokenEnv == null ? null : System.getenv(uploadTokenEnv);
      DocUploader uploader = new HttpPutUploader(URI.create(uploadUrl), java.util.Optional.ofNullable(token));
      uploader.upload(out);
      getLogger().lifecycle("uploaded api doc to: {}", uploadUrl);
    } else {
      getLogger().lifecycle("upload skipped (uploadUrl is empty)");
    }
  }
}

