package com.paperflow.apidoc;

import java.io.IOException;
import java.nio.file.Path;

public interface DocUploader {
  void upload(Path file) throws IOException, InterruptedException;
}

