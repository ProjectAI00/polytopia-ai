# Polytopia AI Agent - Build Plan

## Overview

Build an AI agent that plays Polytopia using PolyMod hooks + TypeScript backend (Convex-style, adapted from imessage-bridge).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  GAME LAYER (C#)                                            │
│  PolyMod/src/AI/                                            │
│  ├── StateExtractor.cs    → Serialize GameState to JSON    │
│  ├── ActionExecutor.cs    → Execute actions in game        │
│  └── AgentBridge.cs       → HTTP client to backend         │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP
┌─────────────────────────────────────────────────────────────┐
│  AI BACKEND (TypeScript)                                    │
│  polytopia-agent/                                           │
│  ├── src/                                                   │
│  │   ├── agent/                                             │
│  │   │   ├── polytopiaBrain.ts      → Agent loop           │
│  │   │   ├── prompts/                                       │
│  │   │   │   └── polytopia.ts       → System prompt        │
│  │   │   └── actionParser.ts        → Parse LLM response   │
│  │   ├── game/                                              │
│  │   │   ├── types.ts               → GameState types      │
│  │   │   ├── legalActions.ts        → Enumerate actions    │
│  │   │   └── stateUtils.ts          → Helper functions     │
│  │   ├── api/                                               │
│  │   │   └── turn.ts                → HTTP endpoint        │
│  │   ├── storage/                                           │
│  │   │   └── gameLog.ts             → Store games          │
│  │   └── config/                                            │
│  │       └── models.ts              → LLM config           │
│  └── convex/ (or simple express server)                     │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Basic Agent (MVP)

### Goal
AI receives game state, returns an action. No learning yet.

### C# Side (PolyMod)

**File: `src/AI/StateExtractor.cs`**
- Hook into `StartTurnAction.Execute` via Harmony
- When it's AI player's turn, serialize GameState to JSON
- Include: map tiles (visible only), units, cities, techs, stars, turn number
- Send to backend

**File: `src/AI/ActionExecutor.cs`**
- Receive action JSON from backend
- Parse action type (move, attack, train, research, build, end_turn)
- Execute via `GameManager.Client.ActionManager.ExecuteCommand`

**File: `src/AI/AgentBridge.cs`**
- HTTP client to call backend
- POST /api/turn with game state
- Receive action response

### TypeScript Side (Backend)

**Adapt from imessage-bridge:**
- Copy `streamingAgentLoop.ts` pattern → `polytopiaBrain.ts`
- Copy `models.ts` → same
- New `prompts/polytopia.ts` → Polytopia-specific system prompt

**New files:**
- `game/types.ts` - TypeScript types matching C# GameState
- `game/legalActions.ts` - List valid actions for current state
- `api/turn.ts` - HTTP endpoint that runs agent loop

### Data Flow

```
1. Game starts, human plays normally
2. AI player's turn begins
3. PolyMod intercepts StartTurnAction
4. StateExtractor serializes visible game state
5. AgentBridge POSTs to backend /api/turn
6. Backend runs agent loop:
   a. Build prompt with game state
   b. Call LLM (Claude/GPT)
   c. Parse response into action
   d. Validate action is legal
   e. Return action JSON
7. PolyMod receives action
8. ActionExecutor executes in game
9. Repeat until end_turn action
```

## Phase 2: Game Logging

### Goal
Store every game for future learning.

### What to Log
- Full game state at each turn
- Action taken
- Outcome (win/loss/score)
- Opponent type (Crazy bot, human, etc.)

### Storage Options
- Convex database (like imessage-bridge)
- Simple JSON files
- SQLite

## Phase 3: Memory/Learning

### Goal
AI references past games to improve.

### Implementation
- Before deciding, query similar past positions
- Include relevant past experiences in LLM prompt
- "In a similar position, I won by doing X"

## Phase 4: Lookahead (Future)

### Goal
Simulate future states before deciding.

### Implementation
- Implement game rules in TypeScript (or Rust for speed)
- For each legal action, simulate result
- Evaluate positions, pick best path
- Could use MCTS if performance allows

---

## File Structure

### PolyMod (C#) - New files to add

```
PolyMod/
└── src/
    └── AI/
        ├── StateExtractor.cs
        ├── ActionExecutor.cs
        ├── AgentBridge.cs
        └── AIManager.cs         # Coordinates everything
```

### Backend (TypeScript) - New project

```
polytopia-agent/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts                 # Entry point
│   ├── agent/
│   │   ├── polytopiaBrain.ts    # Agent loop (from imessage-bridge)
│   │   ├── actionParser.ts      # Parse LLM → Action
│   │   └── prompts/
│   │       └── polytopia.ts     # System prompt
│   ├── game/
│   │   ├── types.ts             # GameState, Action types
│   │   ├── legalActions.ts      # Get valid moves
│   │   └── stateUtils.ts        # Helpers
│   ├── api/
│   │   └── turn.ts              # POST /api/turn endpoint
│   ├── storage/
│   │   └── gameLog.ts           # Save/load games
│   └── config/
│       └── models.ts            # LLM config (copy from imessage-bridge)
└── convex/                      # If using Convex
    └── schema.ts
```

---

## GameState Schema (JSON)

```typescript
interface GameState {
  turn: number;
  currentPlayerId: number;
  
  players: {
    id: number;
    tribe: string;
    stars: number;
    starsPerTurn: number;
    techs: string[];
    score: number;
    isAI: boolean;
  }[];
  
  map: {
    width: number;
    height: number;
    tiles: {
      x: number;
      y: number;
      terrain: string;           // "field" | "forest" | "mountain" | "water" | etc.
      owner: number | null;
      visible: boolean;
      resource: string | null;   // "fruit" | "game" | "fish" | etc.
      improvement: string | null; // "farm" | "mine" | "port" | etc.
      city: {
        name: string;
        level: number;
        population: number;
        production: string[];
      } | null;
      unit: {
        type: string;            // "warrior" | "rider" | "defender" | etc.
        owner: number;
        health: number;
        veteranStatus: boolean;
        canMove: boolean;
        canAttack: boolean;
      } | null;
    }[];
  };
}
```

---

## Action Schema (JSON)

```typescript
type Action =
  | { type: "move"; unitX: number; unitY: number; toX: number; toY: number }
  | { type: "attack"; unitX: number; unitY: number; targetX: number; targetY: number }
  | { type: "train"; cityX: number; cityY: number; unitType: string }
  | { type: "research"; tech: string }
  | { type: "build"; tileX: number; tileY: number; improvement: string }
  | { type: "capture"; unitX: number; unitY: number }  // Capture village/city
  | { type: "end_turn" };
```

---

## System Prompt (Draft)

```
You are an expert Polytopia player. You analyze game states and decide optimal moves.

GAME RULES SUMMARY:
- Turn-based 4X strategy game
- Goal: Highest score by turn 30 (or eliminate opponents)
- Resources: Stars (currency), population (city growth)
- Actions per turn: Move/attack with units, train units, research tech, build improvements

CURRENT GAME STATE:
{gameState}

LEGAL ACTIONS:
{legalActions}

STRATEGY GUIDELINES:
- Early game: Expand, capture villages, research useful techs
- Mid game: Build economy, train army, prepare for conflict
- Late game: Maximize score through cities, temples, monuments

Respond with a single action in JSON format. Think step by step about why this is the best move.

Response format:
{
  "reasoning": "Brief explanation of strategy",
  "action": { ... action object ... }
}
```

---

## Implementation Order

### Phase 1: Basic Agent (MVP) — ✅ DONE
All files implemented and functional.

#### Week 1: Foundation
1. [x] Create `polytopia-agent/` TypeScript project
2. [x] Copy agent loop from imessage-bridge, adapt for Polytopia
   - *Implemented as `polytopiaBrain.ts` using `GetTurnActions` — returns all actions per turn in a single LLM call*
3. [x] Define GameState and Action types
   - *`game/types.ts` created; C# side uses `CommandBase` subclasses (`MoveCommand`, `AttackCommand`, etc.) rather than Action classes*
4. [x] Create basic /api/turn endpoint
5. [x] Write Polytopia system prompt

#### Week 2: PolyMod Integration
6. [x] Add `src/AI/` folder to PolyMod
7. [x] Implement StateExtractor.cs
8. [x] Implement AgentBridge.cs (HTTP client)
9. [x] Implement ActionExecutor.cs
   - *Note: HealCommand does not exist in the game API — units heal automatically*
10. [x] Hook into StartTurnAction
    - *AIManager.cs + Plugin.cs updated with Harmony patches*

#### Week 3: Testing & Iteration
11. [x] Test with Easy bot opponent
12. [x] Debug action execution
13. [ ] Tune prompt based on behavior — *ongoing*
14. [x] Add error handling

### Phase 2: Game Logging — 🟡 IN PROGRESS
`gameLog.ts` being created.

#### Week 4: Game Logging
15. [ ] Add storage for game states
16. [ ] Log actions and outcomes
17. [ ] Basic game history query

### Phase 3: Memory/Learning — ⬜ NOT STARTED
- Query similar past positions before deciding
- Include relevant past experiences in LLM prompt

### Phase 4: Lookahead — ⬜ NOT STARTED
- Implement game rules in TypeScript (or Rust for speed)
- Simulate future states, evaluate positions
- Possible MCTS integration

---

## Configuration

### Environment Variables (Backend)
```
OPENROUTER_API_KEY=xxx
OR_MODEL=anthropic/claude-sonnet-4-20250514
PORT=3001
```

### PolyMod Config
```json
{
  "ai_enabled": true,
  "ai_player_slot": 1,
  "backend_url": "http://localhost:3001",
  "debug_logging": true
}
```

---

## Notes

- Start simple: One action per LLM call, validate, execute
- AI only controls one player slot (configurable)
- Human can play alongside AI or watch AI vs AI
- Visible tiles only (fair play, no fog of war cheating)
- Can upgrade to lookahead/MCTS later without rewriting core




