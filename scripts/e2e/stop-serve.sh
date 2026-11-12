#!/bin/bash
for pid in $(pgrep -x node); do
  if tr '\0' ' ' < /proc/$pid/cmdline | grep -q "serve.mjs"; then kill $pid; fi
done
exit 0
