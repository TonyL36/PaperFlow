package com.paperflow.apidoc.gradle;

import org.gradle.api.Plugin;
import org.gradle.api.Project;

public final class ApiDocPlugin implements Plugin<Project> {
  @Override
  public void apply(Project project) {
    project.getTasks().register("generateApiDoc", GenerateApiDocTask.class, t -> {
      t.setGroup("documentation");
      t.setDescription("Scan Spring Controllers and generate API markdown, optionally upload.");
      t.setTitle(project.getName());
      t.setApiVersion("v1");
      t.setBasePath("/api/v1");
      t.setSourceDir(project.getProjectDir().toPath().resolve("src/main/java").toString());
      t.setOutputFile(project.getBuildDir().toPath().resolve("generated-docs/api.md").toString());
      t.setUploadTokenEnv("PF_DOC_UPLOAD_TOKEN");
    });
  }
}

