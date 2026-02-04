#!/usr/bin/env bash
set -euo pipefail

VERSION="0.2.0"
TAG="v${VERSION}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before cutting ${TAG}."
  exit 1
fi

echo "Bumping versions to ${VERSION}..."
node <<'NODE'
const fs = require("fs");

const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = "0.2.0";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const tauriPath = "src-tauri/tauri.conf.json";
const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauri.version = "0.2.0";
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");
NODE

python3 <<'PY'
from pathlib import Path
import re

p = Path("src-tauri/Cargo.toml")
s = p.read_text()
if "[package]" not in s:
    raise SystemExit("src-tauri/Cargo.toml missing [package] section")

pattern = re.compile(r'(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")', re.MULTILINE)
updated, count = pattern.subn(r'\g<1>0.2.0\2', s, count=1)
if count != 1:
    raise SystemExit("Could not set Cargo package version to 0.2.0")
p.write_text(updated)
PY

echo "Running tests and build checks..."
npm test
npm run build
npm run desktop:build -- --bundles dmg

shopt -s nullglob
dmgs=(src-tauri/target/release/bundle/dmg/*.dmg)
if [[ ${#dmgs[@]} -eq 0 ]]; then
  echo "No DMG artifact found at src-tauri/target/release/bundle/dmg."
  exit 1
fi

echo "Committing release changes..."
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Release ${TAG}"
git tag "${TAG}"

branch="$(git branch --show-current)"
git push origin "${branch}"
git push origin "${TAG}"

remote="$(git remote get-url origin)"
if [[ "${remote}" =~ ^git@github.com:(.+)\.git$ ]]; then
  repo_url="https://github.com/${BASH_REMATCH[1]}"
elif [[ "${remote}" =~ ^https://github.com/(.+)\.git$ ]]; then
  repo_url="https://github.com/${BASH_REMATCH[1]}"
else
  repo_url="${remote}"
fi

echo "Release pushed."
echo "Find the run at: ${repo_url}/actions/workflows/release.yml"
echo "Find the release at: ${repo_url}/releases/tag/${TAG}"
