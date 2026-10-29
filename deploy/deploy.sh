#!/usr/bin/env bash
#
# Blue/green deployment of the gateway on the VM (see README.md next to this file).
#
#   ./deploy.sh v1.6.0             deploy v1.6.0 on the inactive slot, switch nginx to it,
#                                  bake, update the worker, then stop the previous slot
#   ./deploy.sh v1.6.0 --keep-old  same, but leave the previous slot running
#   ./deploy.sh --switch blue      send the traffic to a slot (instant rollback while it runs)
#   ./deploy.sh --stop-old         stop the inactive slot
#   ./deploy.sh --status           show the slots, their tags and the active one
#
# Environment: READY_TIMEOUT_IN_SECONDS (300), BAKE_IN_SECONDS (300).
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env
UPSTREAM_FILE=nginx/upstream.conf
READY_TIMEOUT_IN_SECONDS=${READY_TIMEOUT_IN_SECONDS:-300}
BAKE_IN_SECONDS=${BAKE_IN_SECONDS:-300}

log() { printf '\n==> %s\n' "$*"; }
die() {
  printf 'deploy: %s\n' "$*" >&2
  exit 1
}
upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }
other_color() { if [ "$1" = blue ]; then echo green; else echo blue; fi; }
check_color() { [ "$1" = blue ] || [ "$1" = green ] || die "unknown slot \"$1\" (blue or green)"; }

env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }
env_set() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}
active_color() {
  local color
  color=$(env_get ACTIVE_COLOR)
  check_color "$color"
  echo "$color"
}
slot_tag() { env_get "$(upper "$1")_TAG"; }

# /ping checks Postgres and Redis, and answers 503 while a slot is draining
ping_slot() { docker compose exec -T "gateway-$1" wget -qO- http://127.0.0.1:3000/ping >/dev/null 2>&1; }
ping_proxy() { docker compose exec -T proxy wget -qO- http://127.0.0.1/ping >/dev/null 2>&1; }
slot_running() { [ -n "$(docker compose ps -q --status running "gateway-$1")" ]; }

wait_ready() {
  local color=$1 deadline
  deadline=$(($(date +%s) + READY_TIMEOUT_IN_SECONDS))
  until ping_slot "$color"; do
    slot_running "$color" || return 1
    [ "$(date +%s)" -lt "$deadline" ] || return 1
    sleep 3
  done
}

write_upstream() {
  cat >"$UPSTREAM_FILE.tmp" <<CONF
# The slot nginx sends the traffic to: gateway-blue or gateway-green.
# Rewritten by deploy.sh (then \`nginx -s reload\`), do not edit by hand on the VM.
map \$host \$gateway_upstream {
    default gateway-$1:3000;
}
CONF
  # atomic replacement: nginx never sees a half-written file
  mv "$UPSTREAM_FILE.tmp" "$UPSTREAM_FILE"
}

apply_upstream() {
  write_upstream "$1"
  docker compose exec -T proxy nginx -t
  # graceful: the connections already open stay on the previous slot until they close
  docker compose exec -T proxy nginx -s reload
  env_set ACTIVE_COLOR "$1"
}

switch_to() {
  local color=$1 previous
  check_color "$color"
  slot_running "$color" || die "gateway-$color is not running, nothing to switch to"
  previous=$(active_color)
  log "Switching nginx to gateway-$color ($(slot_tag "$color"))"
  apply_upstream "$color"
  sleep 2
  if ! ping_proxy; then
    if [ "$previous" != "$color" ] && slot_running "$previous"; then
      log "/ping fails through the proxy: switching back to gateway-$previous"
      apply_upstream "$previous"
      die "gateway-$color does not answer through the proxy, gateway-$previous serves the traffic again. Check: docker compose logs proxy gateway-$color"
    fi
    die "the proxy does not answer /ping, check: docker compose logs proxy gateway-$color"
  fi
  log "gateway-$color now serves the traffic"
}

stop_old() {
  local active old
  active=$(active_color)
  old=$(other_color "$active")
  if slot_running "$old"; then
    log "Stopping gateway-$old (graceful: drain, websockets closed by batches, in-flight requests)"
    docker compose stop "gateway-$old"
  else
    log "gateway-$old is already stopped"
  fi
}

bake() {
  local target=$1 previous=$2 deadline
  log "Baking for ${BAKE_IN_SECONDS}s: both slots run, Ctrl-C leaves them as they are"
  trap 'printf "\nBake interrupted: gateway-%s serves the traffic, gateway-%s still runs.\n  rollback: ./deploy.sh --switch %s\n  finish:   ./deploy.sh --stop-old\n" "$target" "$previous" "$previous"; exit 130' INT
  deadline=$(($(date +%s) + BAKE_IN_SECONDS))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if ! ping_proxy; then
      log "/ping failed through the proxy during the bake: switching back to gateway-$previous"
      apply_upstream "$previous"
      sleep 2
      ping_proxy || printf 'deploy: /ping still fails through the proxy on gateway-%s, check the proxy itself: docker compose logs proxy\n' "$previous" >&2
      die "deployment of gateway-$target rolled back, it is still running for inspection: docker compose logs gateway-$target"
    fi
    sleep 10
  done
  trap - INT
}

deploy() {
  local tag=$1 keep_old=$2 active target
  active=$(active_color)
  target=$(other_color "$active")
  if slot_running "$target"; then
    die "gateway-$target is still running (a previous deployment left both slots up?): ./deploy.sh --stop-old first"
  fi
  log "gateway-$active ($(slot_tag "$active")) serves the traffic, deploying $tag on gateway-$target"
  env_set "$(upper "$target")_TAG" "$tag"
  docker compose pull "gateway-$target"
  docker compose up -d "gateway-$target"

  log "Waiting for gateway-$target to be ready (migrations, Redis, Postgres), ${READY_TIMEOUT_IN_SECONDS}s at most"
  if ! wait_ready "$target"; then
    docker compose logs --tail 100 "gateway-$target"
    docker compose stop "gateway-$target"
    die "gateway-$target never answered /ping, stopped. Nothing changed: gateway-$active still serves the traffic"
  fi

  switch_to "$target"
  if [ "$keep_old" = true ]; then
    log "gateway-$active left running. Rollback: ./deploy.sh --switch $active, finish: ./deploy.sh --stop-old"
    return
  fi
  bake "$target" "$active"

  log "Updating the worker to $tag"
  env_set WORKER_TAG "$tag"
  docker compose up -d worker

  stop_old
  log "Done: gateway-$target ($tag) serves the traffic. Rollback: ./deploy.sh $(slot_tag "$active")"
}

status() {
  local active
  active=$(active_color)
  printf 'active slot: gateway-%s\nblue:   %s\ngreen:  %s\nworker: %s\n\n' \
    "$active" "$(slot_tag blue)" "$(slot_tag green)" "$(env_get WORKER_TAG)"
  docker compose ps
}

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found: copy .env.example to .env first"
[ -f gateway.env ] || die "gateway.env not found: the environment of the gateway (database, Redis, secrets...)"

case "${1:-}" in
  --status) status ;;
  --switch)
    [ -n "${2:-}" ] || die "usage: ./deploy.sh --switch blue|green"
    switch_to "$2"
    ;;
  --stop-old) stop_old ;;
  '' | --help | -h) sed -n '3,12p' "$0" ;;
  --*) die "unknown option $1" ;;
  *)
    keep_old=false
    [ "${2:-}" = --keep-old ] && keep_old=true
    deploy "$1" "$keep_old"
    ;;
esac
