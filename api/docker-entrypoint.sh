#!/bin/sh
set -e

# A bind-mounted uploads folder is created by Docker as root. Hand it to the node
# user so the API can write photos without running as root.
mkdir -p "$UPLOAD_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$UPLOAD_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
