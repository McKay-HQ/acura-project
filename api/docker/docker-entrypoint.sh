#!/bin/sh
set -e

# A bind-mounted uploads folder is created by Docker as root. Hand it to the node
# user so the API can write photos without running as root. Network shares (Azure
# Files) don't allow chown; there the owner comes from the mount options instead,
# so a failed chown is not fatal.
mkdir -p "$UPLOAD_DIR"
if [ "$(id -u)" = "0" ]; then
    chown -R node:node "$UPLOAD_DIR" 2>/dev/null ||
        echo "Note: could not change the owner of $UPLOAD_DIR (network share?); using it as mounted."
    exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
