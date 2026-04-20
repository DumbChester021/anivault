#!/bin/sh
# dev.sh — Start AniVault dev environment (frontend + consumet)

FRONTEND_PORT=3000
CONSUMET_PORT=3001
CONSUMET_DIR="/mnt/data/Github/express/api.consumet.org"

FRONTEND_PID_FILE=".dev.pid"
CONSUMET_PID_FILE=".dev.consumet.pid"
FRONTEND_LOG=".dev.log"
CONSUMET_LOG=".dev.consumet.log"

# ─── Helpers ─────────────────────────────────────────────────────────────────

kill_pid_file() {
  FILE=$1
  LABEL=$2
  if [ -f "$FILE" ]; then
    OLD_PID=$(cat "$FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[$LABEL] Stopping previous process (PID $OLD_PID)..."
      kill "$OLD_PID" 2>/dev/null
      sleep 0.5
      kill -0 "$OLD_PID" 2>/dev/null && kill -9 "$OLD_PID" 2>/dev/null
    fi
    rm -f "$FILE"
  fi
}

kill_port() {
  PORT=$1
  PIDS=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "  Port $PORT in use by PID(s) $PIDS — killing..."
    echo "$PIDS" | xargs kill 2>/dev/null
    sleep 0.3
  fi
}

wait_for_port() {
  PORT=$1
  LABEL=$2
  TIMEOUT=20
  i=0
  while [ $i -lt $TIMEOUT ]; do
    # Use /dev/tcp to check if port is open (bash built-in)
    (echo > /dev/tcp/127.0.0.1/$PORT) 2>/dev/null && return 0
    sleep 1
    i=$((i + 1))
  done
  echo "[$LABEL] ✗ Did not become ready after ${TIMEOUT}s"
  return 1
}

# ─── Cleanup previous runs ───────────────────────────────────────────────────

kill_pid_file "$FRONTEND_PID_FILE" "frontend"
kill_pid_file "$CONSUMET_PID_FILE" "consumet"
kill_port $FRONTEND_PORT
kill_port $CONSUMET_PORT

# ─── Start Consumet (LOCAL) ──────────────────────────────────────────────────

if [ ! -d "$CONSUMET_DIR" ]; then
  echo "[consumet] ✗ Directory not found: $CONSUMET_DIR"
  echo "[consumet]   Skipping — streaming features will be unavailable locally."
  CONSUMET_STARTED=0
else
  echo "[consumet] Starting LOCAL at http://localhost:$CONSUMET_PORT ..."
  cd "$CONSUMET_DIR"
  PORT=$CONSUMET_PORT yarn dev > "$OLDPWD/$CONSUMET_LOG" 2>&1 &
  CONSUMET_PID=$!
  cd "$OLDPWD"
  echo "$CONSUMET_PID" > "$CONSUMET_PID_FILE"
  CONSUMET_STARTED=1
fi

# ─── Start Frontend ───────────────────────────────────────────────────────────

echo "[frontend] Starting LOCAL at http://localhost:$FRONTEND_PORT ..."
npx -y serve . -l tcp://0.0.0.0:$FRONTEND_PORT -s > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

# ─── Health checks ───────────────────────────────────────────────────────────

echo ""
echo "Waiting for services..."

if [ "$CONSUMET_STARTED" = "1" ]; then
  if wait_for_port $CONSUMET_PORT "consumet"; then
    echo "[consumet] ✓ READY  →  http://localhost:$CONSUMET_PORT  (LOCAL)"
  else
    echo "[consumet] ✗ FAILED — check $CONSUMET_LOG"
  fi
else
  echo "[consumet] ✗ SKIPPED (dir missing)"
fi

if wait_for_port $FRONTEND_PORT "frontend"; then
  echo "[frontend] ✓ READY  →  http://localhost:$FRONTEND_PORT  (LOCAL)"
else
  echo "[frontend] ✗ FAILED — check $FRONTEND_LOG"
fi

echo ""
echo "─────────────────────────────────────────────────"
echo "  Jikan API  →  https://api.jikan.moe/v4  (REMOTE)"
echo "  Consumet   →  http://localhost:$CONSUMET_PORT  (LOCAL)"
echo "  Frontend   →  http://localhost:$FRONTEND_PORT  (LOCAL)"
echo "─────────────────────────────────────────────────"
echo ""
echo "Tailing frontend log (Ctrl+C to stop all)..."
echo ""

# ─── Cleanup on exit ─────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "[dev] Shutting down..."
  kill "$FRONTEND_PID" 2>/dev/null
  [ "$CONSUMET_STARTED" = "1" ] && kill "$CONSUMET_PID" 2>/dev/null
  rm -f "$FRONTEND_PID_FILE" "$CONSUMET_PID_FILE"
  echo "[dev] Done."
  exit 0
}
trap cleanup INT TERM

tail -f "$FRONTEND_LOG"
