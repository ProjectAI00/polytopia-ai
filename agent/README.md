# Polytopia Agent

Polytopia Agent is a TypeScript backend AI player that receives game state from PolyMod, uses an LLM to plan the turn, validates those actions, and returns them to the game.

## Architecture

```text
PolyMod game state
      |
      v
POST /api/turn (Express API)
      |
      v
Polytopia Brain (prompt + model selection)
      |
      v
LLM (OpenRouter model)
      |
      v
Action parser + validation (legal action filtering)
      |
      v
JSON actions -> PolyMod
```

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Configure `.env` before running:

```env
OPENROUTER_API_KEY=your-openrouter-api-key
OR_MODEL=anthropic/claude-sonnet-4-20250514
PORT=3001
DEBUG=false
```

## API Endpoints

- `POST /api/turn`: Accepts `{ gameState, playerId }`, returns validated action sequence and reasoning.
- `GET /api/reload-prompt`: Returns current prompt override state (hot-reload helper).
- `GET /health`: Health check (`{ status: "ok", service: "polytopia-agent" }`).

## Game State Schema (brief)

Incoming `gameState` includes:
- `turn`, `maxTurns`, `currentPlayerId`, `gameMode`
- `players[]` (stars, techs, score, cities, units, tribe, status)
- `map` with `width`, `height`, and `tiles[]`
- each tile has coordinates, terrain, visibility, ownership, optional resource/improvement/city/unit

## Action Format (brief)

The agent returns JSON actions like:

```json
{
  "reasoning": "Plan for this turn.",
  "actions": [
    { "type": "move", "unitX": 5, "unitY": 3, "toX": 6, "toY": 3 },
    { "type": "attack", "unitX": 6, "unitY": 3, "targetX": 7, "targetY": 4 },
    { "type": "end_turn" }
  ],
  "confidence": 0.82
}
```

Supported action types include `move`, `attack`, `train`, `research`, `build`, `capture`, `heal`, `convert`, `disembark`, and `end_turn`.

## How it Works

1. Game state is posted to `/api/turn`.
2. Agent builds a state-aware prompt and sends it to the configured LLM.
3. LLM returns reasoning + proposed actions.
4. Actions are parsed and validated against legal game rules.
5. Valid actions are returned to the game (always ending with `end_turn`).

## Configuration

- `OPENROUTER_API_KEY`: API key for OpenRouter.
- `OR_MODEL`: Model name (any OpenRouter-compatible model string).
- `PORT`: HTTP server port (default `3001`).
- `DEBUG`: Enables verbose decision logs when `true`.

You can switch models by changing `OR_MODEL` (for example, to cheaper/faster or stronger models depending on runtime goals).

## Development

```bash
npm run dev
npm run build
npx tsx src/test/mockGame.ts
```

- `npm run dev`: hot-reload development server.
- `npm run build`: TypeScript compile to `dist/`.
- test flow currently uses the mock game harness under `src/test/mockGame.ts`.

## Future Plans

- Add a full training/simulation environment for self-play evaluation.
- Expand game logging and replay analysis tooling.
- Introduce specialized models/prompts by phase (opening, combat, endgame).



