package com.paperflow.apidoc.maven;

import com.paperflow.apidoc.ApiDocGenerator;
import com.paperflow.apidoc.DocConfig;
import com.paperflow.apidoc.DocUploader;
import com.paperflow.apidoc.HttpPutUploader;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;

@Mojo(name = "generate-and-upload", defaultPhase = LifecyclePhase.VERIFY, threadSafe = true)
public final class GenerateApiDocMojo extends AbstractMojo {
  @Parameter(defaultValue = "${project.name}", required = true)
  private String title;

  @Parameter(defaultValue = "v1", required = true)
  private String apiVersion;

  @Parameter(defaultValue = "${project.basedir}/src/main/java", required = true)
  private String sourceDir;

  @Parameter(defaultValue = "${project.build.directory}/generated-docs/api.md", required = true)
  private String outputFile;

  @Parameter(defaultValue = "/api/v1")
  private String basePath;

  @Parameter
  private List<String> includePackages;

  @Parameter
  private String uploadUrl;

  @Parameter(defaultValue = "PF_DOC_UPLOAD_TOKEN")
  private String uploadTokenEnv;

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

