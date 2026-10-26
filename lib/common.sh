# shellcheck shell=bash
# Shared helpers for the scripts in bin/. Source it first thing:
#   source "$(dirname "$(readlink -f "$0")")/../lib/common.sh"
# It turns on strict mode and sets ROOT (the repo root) and CMD (the script's name).

set -euo pipefail

# readlink -f resolves symlinks, so the scripts work when linked from elsewhere (e.g. ~/bin).
ROOT=$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")
CMD=$(basename "$0")

# Print an error and exit.
die() {
    echo "$CMD: $*" >&2
    exit 1
}

# Exit unless a command is installed. Usage: need jq "sudo apt install -y jq"
need() {
    command -v "$1" >/dev/null || die "$1 is missing. Install it with: $2"
}

# Show docs/<command>.md, or docs/<page>.md when given: rendered with glow when it's installed, plain markdown otherwise.
show_help() {
    local page=${1:-$CMD}
    local doc="$ROOT/docs/$page.md"
    [ -f "$doc" ] || die "no help page at docs/$page.md"
    if command -v glow >/dev/null; then
        # Use the terminal's width (glow defaults to 80), capped so lines stay readable.
        local width=${COLUMNS:-$(tput cols 2>/dev/null || echo 100)}
        [ "$width" -gt 120 ] && width=120
        glow -w "$width" "$doc" </dev/null
    else
        cat "$doc"
        echo >&2
        echo "(Install glow to see this formatted: see docs/README.md.)" >&2
    fi
}

# For getopts' fallback case: report an unknown option and exit 2.
bad_option() {
    echo "$CMD: unknown option -$1 (see $CMD -h)" >&2
    exit 2
}

# git pull, then restart this script with the given arguments so the rest of the run uses the
# freshly pulled version of it. Pass the original arguments minus the pull flag.
pull_and_restart() {
    echo "Pulling the latest code..."
    git -C "$ROOT" pull --ff-only
    exec "$0" "$@"
}
