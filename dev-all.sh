#!/bin/bash
# dev-all.sh — Start frontend + Consumet API concurrently in one terminal

FRONTEND_DIR="/mnt/data/Github/prototype/anime"
CONSUMET_DIR="/mnt/data/Github/express/api.consumet.org"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

PIDFILE="/tmp/dev-all.pid"

# Kill previous instance if running
if [ -f "$PIDFILE" ]; then
    OLD_PIDS=$(cat "$PIDFILE")
    for pid in $OLD_PIDS; do
        kill -9 "$pid" 2>/dev/null
    done
    rm -f "$PIDFILE"
    echo "[dev-all] Killed previous instance."
fi

# Clean up leftover ports
EXISTING_3000=$(lsof -ti :3000 2>/dev/null)
if [ -n "$EXISTING_3000" ]; then
    echo "$EXISTING_3000" | xargs kill -9 2>/dev/null
    echo "[dev-all] Cleared port 3000."
fi

EXISTING_3001=$(lsof -ti :3001 2>/dev/null)
if [ -n "$EXISTING_3001" ]; then
    echo "$EXISTING_3001" | xargs kill -9 2>/dev/null
    echo "[dev-all] Cleared port 3001."
fi

cleanup() {
    echo ""
    echo "[dev-all] Stopping..."
    kill "$CONSUMET_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$CONSUMET_PID" "$FRONTEND_PID" 2>/dev/null
    rm -f "$PIDFILE"
    exit 0
}
trap cleanup INT TERM

# Prefix each line with a colored label
prefix() {
    local label="$1" color="$2"
    while IFS= read -r line; do
        printf "\033[${color}m[%s]\033[0m %s\n" "$label" "$line"
    done
}

cd "$CONSUMET_DIR" && PORT=3001 npm run dev 2>&1 | prefix "consumet" "36" &
CONSUMET_PID=$!

cd "$FRONTEND_DIR" && npm run dev 2>&1 | prefix "frontend" "32" &
FRONTEND_PID=$!

echo "$CONSUMET_PID $FRONTEND_PID" > "$PIDFILE"

wait "$CONSUMET_PID" "$FRONTEND_PID"
