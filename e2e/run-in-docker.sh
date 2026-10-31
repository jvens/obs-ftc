#!/bin/sh
# Runs the e2e tests in Docker with every browser the projects test: Playwright's image, plus Chrome,
# Chrome Beta and Edge (e2e/Dockerfile, built the first time for each Playwright version). Linux
# x86-64 only: it uses this checkout's node_modules, and the host network so WebRTC sees real
# interfaces, as it would on an event network. Build first.
#
#   npm run build && e2e/run-in-docker.sh                     # every browser
#   npm run build && e2e/run-in-docker.sh --project=webkit
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./node_modules/@playwright/test/package.json').version")
image="obs-ftc-e2e:$version"
docker image inspect "$image" >/dev/null 2>&1 \
  || docker build --build-arg PLAYWRIGHT_VERSION="$version" -t "$image" e2e
exec docker run --rm --ipc=host --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI \
  -v "$PWD":/work -w /work "$image" npx playwright test "$@"
