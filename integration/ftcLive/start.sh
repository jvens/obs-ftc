#!/bin/sh
# Runs FTC Live without a display, on port 80. With --prepare, starts it once (which downloads and
# installs FTC Live), waits until it answers, and stops it.
set -e
cd /opt/ftclive
jar=$(ls ./*-runnable.jar)
run() { ./jre/bin/java -Djava.awt.headless=true -Dftc.launcher.ui_mode=CONSOLE -jar "$jar"; }
if [ "$1" != "--prepare" ]; then
  exec ./jre/bin/java -Djava.awt.headless=true -Dftc.launcher.ui_mode=CONSOLE -jar "$jar"
fi
run &
pid=$!
for _ in $(seq 1 600); do
  if curl -sf http://127.0.0.1/api/v1/version/ >/dev/null; then
    kill "$pid"
    wait "$pid" || true
    exit 0
  fi
  kill -0 "$pid" 2>/dev/null || { echo "FTC Live stopped while preparing" >&2; exit 1; }
  sleep 1
done
echo "FTC Live did not start while preparing" >&2
kill "$pid"
exit 1
