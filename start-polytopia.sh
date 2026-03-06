#!/usr/bin/env bash
# start-polytopia.sh — Start the AI backend, then launch Polytopia with BepInEx
#
# Usage:
#   ./start-polytopia.sh           # uses .env in agent/
#   ./start-polytopia.sh --no-game # start backend only (for testing)
#   ./start-polytopia.sh --sim     # run AI vs AI simulation instead of game

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$SCRIPT_DIR/agent"
GAME_DIR="/Users/aimar/Library/Application Support/Steam/steamapps/common/The Battle of Polytopia"
BACKEND_PID_FILE="/tmp/polytopia-ai-backend.pid"
BACKEND_PORT=3001

current_env_value() {
  local key="$1"
  if [ ! -f "$AGENT_DIR/.env" ]; then
    return 0
  fi
  grep -E "^${key}=" "$AGENT_DIR/.env" | tail -n 1 | cut -d= -f2-
}

start_backend() {
  # Check if already running
  if curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
    echo "✅ AI backend already running on port $BACKEND_PORT"
    return 0
  fi

  echo "🚀 Starting AI backend..."
  if [ ! -f "$AGENT_DIR/.env" ]; then
    echo "❌ Missing agent/.env — set LLM_PROVIDER (copilot|openrouter) and provider credentials if needed"
    exit 1
  fi

  cd "$AGENT_DIR"
  # Build if needed
  if [ ! -d "dist" ]; then
    echo "🔨 Building TypeScript..."
    npm run build
  fi

  # Start server in background with .env loaded
  env $(cat .env | grep -v '^#' | xargs) node dist/index.js &
  echo $! > "$BACKEND_PID_FILE"
  local pid=$!

  # Wait for health check (up to 15 seconds)
  echo -n "⏳ Waiting for backend..."
  for i in $(seq 1 15); do
    sleep 1
    if curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
      echo " ready!"
      local provider model
      provider="$(current_env_value LLM_PROVIDER)"
      model="$(current_env_value COPILOT_MODEL)"
      if [ -z "$provider" ]; then
        provider="copilot"
      fi
      if [ "$provider" = "openrouter" ]; then
        model="$(current_env_value OR_MODEL)"
      fi
      if [ -z "$model" ]; then
        model="provider default"
      fi
      echo "   PID: $pid  |  Provider: $provider  |  Model: $model"
      return 0
    fi
    echo -n "."
  done
  echo ""
  echo "❌ Backend failed to start — check agent/dist/index.js"
  kill "$pid" 2>/dev/null || true
  exit 1
}

stop_backend() {
  if [ -f "$BACKEND_PID_FILE" ]; then
    local pid
    pid=$(cat "$BACKEND_PID_FILE")
    echo "🛑 Stopping AI backend (PID $pid)..."
    kill "$pid" 2>/dev/null && rm "$BACKEND_PID_FILE" || true
  fi
}

# Handle --sim flag
if [[ "$1" == "--sim" ]]; then
  start_backend
  echo ""
  echo "🎮 Running AI vs AI simulation..."
  cd "$AGENT_DIR"
  npx tsx --env-file .env src/sim/runGame.ts --turns 30 "${@:2}"
  exit 0
fi

# Handle --no-game flag
if [[ "$1" == "--no-game" ]]; then
  start_backend
  echo ""
  echo "✅ Backend running. Test it:"
  echo "   curl http://localhost:$BACKEND_PORT/health"
  echo "   Stop with: kill \$(cat $BACKEND_PID_FILE)"
  exit 0
fi

# Handle --stop flag
if [[ "$1" == "--stop" ]]; then
  stop_backend
  exit 0
fi

# Default: start backend + launch game
start_backend
echo ""
echo "🎮 Launching Polytopia with BepInEx..."
echo "   BepInEx will hook the AI (slot 1) via AIPoller"
echo "   Turn logs: $AGENT_DIR/logs/"
echo ""

trap stop_backend EXIT

cd "$GAME_DIR"
exec ./run_bepinex.sh
