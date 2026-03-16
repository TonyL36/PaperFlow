#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-3.9.9}"
CMD="${2:-verify}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/.tools"
MAVEN_HOME="${TOOLS_DIR}/apache-maven-${VERSION}"
MVN_BIN="${MAVEN_HOME}/bin/mvn"

if [[ ! -f "$MVN_BIN" ]]; then
  mkdir -p "$TOOLS_DIR"
  ZIP="${TOOLS_DIR}/apache-maven-${VERSION}-bin.zip"
  URL="https://archive.apache.org/dist/maven/maven-3/${VERSION}/binaries/apache-maven-${VERSION}-bin.zip"
  curl -fsSL "$URL" -o "$ZIP"
  unzip -q -o "$ZIP" -d "$TOOLS_DIR"
fi

cd "$ROOT_DIR"
"$MVN_BIN" -DskipTests "$CMD"

