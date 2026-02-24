#!/bin/sh
# dev.sh — Start dev server with PID management
# Ensures only one instance runs at a time.

PORT=3000
PID_FILE=".dev.pid"
LOG_FILE=".dev.log"

# Kill previous server if PID file exists
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[dev] Killing previous server (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null
    # Wait a moment for clean shutdown
    sleep 0.5
    # Force kill if still alive
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null
    fi
    echo "[dev] Previous server stopped."
  else
    echo "[dev] Stale PID file found (process $OLD_PID not running). Cleaning up."
  fi
  rm -f "$PID_FILE"
fi

# Also check if something is already bound to the port
EXISTING=$(lsof -ti :$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "[dev] Port $PORT in use by PID(s): $EXISTING. Killing..."
  echo "$EXISTING" | xargs kill 2>/dev/null
  sleep 0.5
fi

# Start server in background
echo "[dev] Starting server on http://localhost:$PORT ..."
npx -y serve . -l $PORT -s > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Save PID
echo "$SERVER_PID" > "$PID_FILE"
echo "[dev] Server started (PID $SERVER_PID). Logs → $LOG_FILE"

# Trap to clean up on script exit (Ctrl+C)
cleanup() {
  echo ""
  echo "[dev] Shutting down server (PID $SERVER_PID)..."
  kill "$SERVER_PID" 2>/dev/null
  rm -f "$PID_FILE"
  echo "[dev] Done."
  exit 0
}
trap cleanup INT TERM

# Tail the log so user sees output
tail -f "$LOG_FILE"
