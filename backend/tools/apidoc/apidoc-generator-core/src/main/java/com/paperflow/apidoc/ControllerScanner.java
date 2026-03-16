package com.paperflow.apidoc;

import com.github.javaparser.JavaParser;
import com.github.javaparser.ParseResult;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.ArrayInitializerExpr;
import com.github.javaparser.ast.expr.BooleanLiteralExpr;
import com.github.javaparser.ast.expr.Expression;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.NameExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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

  private boolean isController(ClassOrInterfaceDeclaration cls) {
    return cls.getAnnotations().stream().anyMatch(a -> CONTROLLER_ANNOTATIONS.contains(a.getName().getIdentifier()));
  }

  private Optional<HttpMapping> extractHttpMapping(NodeList<AnnotationExpr> annotations) {
    for (AnnotationExpr a : annotations) {
      String name = a.getName().getIdentifier();
      switch (name) {
        case "GetMapping":
        case "PostMapping":
        case "PutMapping":
        case "PatchMapping":
        case "DeleteMapping": {
          String httpMethod = name.replace("Mapping", "").toUpperCase(Locale.ROOT);
          List<String> paths = extractPaths(annotations, name).orElse(List.of(""));
          return Optional.of(new HttpMapping(httpMethod, paths));
        }
        case "RequestMapping": {
          List<String> paths = extractPaths(annotations, "RequestMapping").orElse(List.of(""));
          Optional<String> method = extractRequestMappingMethod(a);
          if (method.isPresent()) {
            return Optional.of(new HttpMapping(method.get(), paths));
          }
          return Optional.of(new HttpMapping("GET", paths));
        }
        default:
          break;
      }
    }
    return Optional.empty();
  }

  private Optional<String> extractRequestMappingMethod(AnnotationExpr requestMapping) {
    if (requestMapping.isNormalAnnotationExpr()) {
      NormalAnnotationExpr normal = requestMapping.asNormalAnnotationExpr();
      for (MemberValuePair p : normal.getPairs()) {
        if (!p.getNameAsString().equals("method")) {
          continue;
        }
        Expression v = p.getValue();
        if (v.isFieldAccessExpr()) {
          return Optional.of(v.asFieldAccessExpr().getNameAsString());
        }
        if (v.isNameExpr()) {
          return Optional.of(v.asNameExpr().getNameAsString());
        }
      }
    }
    return Optional.empty();
  }

  private Optional<List<String>> extractPaths(NodeList<AnnotationExpr> annotations, String annotationName) {
    for (AnnotationExpr a : annotations) {
      if (!a.getName().getIdentifier().equals(annotationName)) {
        continue;
      }
      if (a.isSingleMemberAnnotationExpr()) {
        return Optional.of(extractStringList(a.asSingleMemberAnnotationExpr().getMemberValue()));
      }
      if (a.isNormalAnnotationExpr()) {
        NormalAnnotationExpr normal = a.asNormalAnnotationExpr();
        for (MemberValuePair p : normal.getPairs()) {
          if (p.getNameAsString().equals("value") || p.getNameAsString().equals("path")) {
            return Optional.of(extractStringList(p.getValue()));
          }
        }
      }
      return Optional.of(List.of(""));
    }
    return Optional.empty();
  }

  private List<String> extractStringList(Expression expr) {
    if (expr == null) {
      return List.of("");
    }
    if (expr.isStringLiteralExpr()) {
      return List.of(expr.asStringLiteralExpr().asString());
    }
    if (expr.isArrayInitializerExpr()) {
      ArrayInitializerExpr arr = expr.asArrayInitializerExpr();
      return arr.getValues().stream()
          .filter(Expression::isStringLiteralExpr)
          .map(e -> e.asStringLiteralExpr().asString())
          .toList();
    }
    return List.of("");
  }

  private String joinPath(String... parts) {
    String joined = Stream.of(parts)
        .filter(p -> p != null && !p.isBlank())
        .map(String::trim)
        .map(p -> p.startsWith("/") ? p : "/" + p)
        .map(p -> p.endsWith("/") ? p.substring(0, p.length() - 1) : p)
        .collect(Collectors.joining(""));
    if (joined.isBlank()) {
      return "/";
    }
    return joined.replaceAll("//+", "/");
  }

  private List<ApiParam> extractParams(MethodDeclaration method) {
    List<ApiParam> params = new ArrayList<>();
    for (Parameter p : method.getParameters()) {
      Optional<ApiParam> param = extractParam(p);
      param.ifPresent(params::add);
    }
    return params;
  }

  private Optional<ApiParam> extractParam(Parameter p) {
    for (AnnotationExpr a : p.getAnnotations()) {
      String ann = a.getName().getIdentifier();
      switch (ann) {
        case "PathVariable":
          return Optional.of(new ApiParam("path", extractName(a, p), p.getTypeAsString(), true, Optional.empty()));
        case "RequestParam":
          return Optional.of(new ApiParam("query", extractName(a, p), p.getTypeAsString(), extractRequired(a, true), Optional.empty()));
        case "RequestHeader":
          return Optional.of(new ApiParam("header", extractName(a, p), p.getTypeAsString(), extractRequired(a, false), Optional.empty()));
        case "RequestBody":
          return Optional.empty();
        default:
          break;
      }
    }
    return Optional.empty();
  }

  private Optional<String> extractRequestBodyType(MethodDeclaration method) {
    for (Parameter p : method.getParameters()) {
      if (p.getAnnotations().stream().anyMatch(a -> a.getName().getIdentifier().equals("RequestBody"))) {
        return Optional.of(p.getTypeAsString());
      }
    }
    return Optional.empty();
  }

  private Optional<String> extractResponseBodyType(MethodDeclaration method) {
    String t = method.getTypeAsString();
    if (method.getType().isVoidType()) {
      return Optional.empty();
    }
    if (method.getType().isClassOrInterfaceType()) {
      ClassOrInterfaceType cit = method.getType().asClassOrInterfaceType();
      String name = cit.getName().getIdentifier();
      if (name.equals("ResponseEntity") && cit.getTypeArguments().isPresent() && !cit.getTypeArguments().get().isEmpty()) {
        return Optional.of(cit.getTypeArguments().get().get(0).asString());
      }
    }
    return Optional.of(t);
  }

  private String extractName(AnnotationExpr a, Parameter p) {
    Optional<String> v = extractAnnotationStringValue(a);
    if (v.isPresent() && !v.get().isBlank()) {
      return v.get();
    }
    if (a.isNormalAnnotationExpr()) {
      NormalAnnotationExpr normal = a.asNormalAnnotationExpr();
      for (MemberValuePair pair : normal.getPairs()) {
        if (pair.getNameAsString().equals("name") && pair.getValue().isStringLiteralExpr()) {
          return pair.getValue().asStringLiteralExpr().asString();
        }
        if (pair.getNameAsString().equals("value") && pair.getValue().isStringLiteralExpr()) {
          return pair.getValue().asStringLiteralExpr().asString();
        }
      }
    }
    return p.getNameAsString();
  }

  private Optional<String> extractAnnotationStringValue(AnnotationExpr a) {
    if (a.isSingleMemberAnnotationExpr()) {
      SingleMemberAnnotationExpr single = a.asSingleMemberAnnotationExpr();
      if (single.getMemberValue().isStringLiteralExpr()) {
        return Optional.of(single.getMemberValue().asStringLiteralExpr().asString());
      }
    }
    return Optional.empty();
  }

  private boolean extractRequired(AnnotationExpr a, boolean defaultValue) {
    if (!a.isNormalAnnotationExpr()) {
      return defaultValue;
    }
    NormalAnnotationExpr normal = a.asNormalAnnotationExpr();
    for (MemberValuePair p : normal.getPairs()) {
      if (p.getNameAsString().equals("required") && p.getValue().isBooleanLiteralExpr()) {
        BooleanLiteralExpr b = p.getValue().asBooleanLiteralExpr();
        return b.getValue();
      }
    }
    return defaultValue;
  }

  private record HttpMapping(String httpMethod, List<String> paths) {
  }
}

