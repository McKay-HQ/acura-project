# shellcheck shell=bash
# Runs commands in a package's Node dev container, for bin/api and bin/web. Source it after common.sh.

# Run a command in <package>-dev (docker-compose.yml) as you, from the same place in the repo as the current directory,
# or from the package when outside the repo. With no command, open a shell. Usage: node_run web npm run build
node_run() {
    local package=$1
    shift
    need docker "Docker Desktop with WSL integration, or Docker Engine with the compose plugin"
    local here
    here=$(pwd -P)
    local dir=/$package
    case "$here/" in
        "$ROOT"/*) dir=${here#"$ROOT"} ;;
    esac
    [ $# -gt 0 ] || set -- sh
    # A terminal only when there is one, so the scripts also work in pipes.
    local tty=-T
    [ -t 0 ] && [ -t 1 ] && tty=
    exec docker compose --project-directory "$ROOT" --progress quiet run --rm ${tty:+"$tty"} -u "$(id -u):$(id -g)" \
        -w "/repo$dir" "$package-dev" "$@"
}
