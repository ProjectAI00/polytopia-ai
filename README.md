# Polytopia AI

An AI agent system that plays [The Battle of Polytopia](https://polytopia.io/) using LLM-powered strategic reasoning. Built as a training environment for AI strategy game research.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  GAME (Polytopia + PolyMod)                         │
│                                                     │
│  polymod-plugin/AI/                                 │
│  ├── AIManager.cs        → Hooks into game turns    │
│  ├── StateExtractor.cs   → Serializes game state    │
│  ├── ActionExecutor.cs   → Executes commands        │
│  └── AgentBridge.cs      → HTTP client to backend   │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (localhost:3001)
┌──────────────────▼──────────────────────────────────┐
│  AI BACKEND (TypeScript)                            │
│                                                     │
│  agent/src/                                         │
│  ├── agent/                                         │
│  │   ├── polytopiaBrain.ts  → LLM reasoning loop    │
│  │   ├── actionParser.ts    → Validates actions      │
│  │   └── prompts/           → Game strategy prompts  │
│  ├── game/                                          │
│  │   ├── types.ts           → Game state types       │
│  │   ├── stateUtils.ts      → Tile/unit helpers      │
│  │   └── legalActions.ts    → Legal move enumeration │
│  ├── api/                                           │
│  │   └── turn.ts            → POST /api/turn         │
│  └── storage/                                       │
│      └── gameLog.ts         → Game logging           │
└─────────────────────────────────────────────────────┘
```

## How It Works

1. **Game turn starts** → PolyMod hooks `StartTurnAction.Execute` via Harmony
2. **State extraction** → Serializes visible game state (map, units, cities, techs) to JSON
3. **AI decides** → Sends state to TypeScript backend → LLM analyzes and returns action sequence
4. **Execution** → Actions are validated and executed as game commands (`MoveCommand`, `AttackCommand`, etc.)
5. **Repeat** → Until `end_turn` action

## Project Structure

| Directory | Description |
|-----------|-------------|
| `agent/` | TypeScript AI backend (Express + LLM via OpenRouter) |
| `polymod-plugin/` | C# PolyMod plugin module (BepInEx/Harmony) |
| `docs/` | Architecture plans, build steps, research notes |

## Quick Start

### 1. Start the AI Backend
```bash
cd agent
npm install
cp .env.example .env  # Add your OpenRouter API key
npm run dev
```

### 2. Install PolyMod Plugin
Copy the `polymod-plugin/AI/` files into your PolyMod `src/AI/` directory, rebuild PolyMod, and add `AI.AIManager.Init()` to `Plugin.cs`.

### 3. Configure
An `AIConfig.json` is auto-created in the BepInEx config path:
```json
{
  "Enabled": true,
  "AIPlayerSlot": 0,
  "BackendUrl": "http://localhost:3001",
  "DebugLogging": true,
  "ActionDelayMs": 200
}
```

### 4. Play
Start Polytopia with PolyMod loaded. The AI will take over the configured player slot.

## Vision

This project aims to become a **training environment for AI in strategy games**:

- **Phase 1** ✅ Basic LLM agent that can play turns
- **Phase 2** 🟡 Game logging for training data collection
- **Phase 3** ⬜ Memory/learning from past games
- **Phase 4** ⬜ World model / game simulation for continuous learning (MCTS, RL)

The long-term goal is to build a world model where the game simulation serves as the environment for training AI agents on strategic reasoning — moving beyond prompt engineering toward actual learned strategy.

## Tech Stack

- **Game Integration**: C# / .NET 6 / BepInEx / Harmony (IL2CPP)
- **AI Backend**: TypeScript / Node.js / Express
- **LLM**: OpenRouter API (Claude Sonnet 4 default, configurable)
- **AI SDK**: Vercel AI SDK

## License

MIT
