# Polytopia AI Agent - Build Steps

## Prerequisites
- [ ] UTM + Windows 11 ARM installed
- [ ] Polytopia installed in Windows VM
- [ ] PolyMod installed in Polytopia

---

## Step 1: Create TypeScript Backend Project
Create `polytopia-agent/` folder with package.json, tsconfig, basic structure.

**Files to create:**
- `polytopia-agent/package.json`
- `polytopia-agent/tsconfig.json`
- `polytopia-agent/.env.example`
- `polytopia-agent/src/index.ts`

---

## Step 2: Define Game Types
Create TypeScript types for GameState and Actions.

**Files to create:**
- `polytopia-agent/src/game/types.ts`

---

## Step 3: Create Agent Loop
Adapt imessage-bridge agent loop for Polytopia.

**Files to create:**
- `polytopia-agent/src/agent/polytopiaBrain.ts`
- `polytopia-agent/src/config/models.ts` (copy from imessage-bridge)

---

## Step 4: Write Polytopia System Prompt
Create the prompt that teaches the LLM how to play.

**Files to create:**
- `polytopia-agent/src/agent/prompts/polytopia.ts`

---

## Step 5: Create Action Parser
Parse LLM responses into valid game actions.

**Files to create:**
- `polytopia-agent/src/agent/actionParser.ts`

---

## Step 6: Create API Endpoint
HTTP endpoint that PolyMod will call.

**Files to create:**
- `polytopia-agent/src/api/turn.ts`
- Update `polytopia-agent/src/index.ts` with Express server

---

## Step 7: Test Backend Standalone
Test with mock game states before PolyMod integration.

**Actions:**
- Create test script with sample GameState
- Verify LLM returns valid actions
- Debug prompt/parsing issues

---

## Step 8: Create PolyMod AI Folder
Add AI module to PolyMod C# project.

**Files to create:**
- `PolyMod/src/AI/StateExtractor.cs`
- `PolyMod/src/AI/AgentBridge.cs`
- `PolyMod/src/AI/ActionExecutor.cs`
- `PolyMod/src/AI/AIManager.cs`

---

## Step 9: Implement State Extractor
Serialize GameState to JSON (visible tiles only).

**File:** `PolyMod/src/AI/StateExtractor.cs`

---

## Step 10: Implement Agent Bridge
HTTP client to call TypeScript backend.

**File:** `PolyMod/src/AI/AgentBridge.cs`

---

## Step 11: Implement Action Executor
Parse action JSON and execute game commands.

**File:** `PolyMod/src/AI/ActionExecutor.cs`

---

## Step 12: Implement AI Manager + Hooks
Harmony patches to intercept turns and coordinate AI.

**File:** `PolyMod/src/AI/AIManager.cs`

---

## Step 13: Integration Test
Run full loop: game → PolyMod → backend → LLM → action → game.

**Actions:**
- Start backend server
- Start Polytopia with PolyMod
- Create game with AI player
- Watch AI make moves
- Debug issues

---

## Step 14: Add Game Logging
Store game states and actions for future learning.

**Files to create:**
- `polytopia-agent/src/storage/gameLog.ts`

---

## Step 15: Tune and Improve
Iterate on prompt, fix bugs, improve play quality.

---

## Current Status

| Step | Status | Notes |
|------|--------|-------|
| 1 | DONE | package.json, tsconfig, .gitignore, src/index.ts |
| 2 | DONE | src/game/types.ts |
| 3 | DONE | src/agent/polytopiaBrain.ts, src/config/models.ts |
| 4 | DONE | src/agent/prompts/polytopia.ts |
| 5 | DONE | src/agent/actionParser.ts |
| 6 | DONE | src/api/turn.ts |
| 7 | DONE | Tested with mock game state |
| 8 | DONE | src/AI/ folder created |
| 9 | DONE | src/AI/StateExtractor.cs |
| 10 | DONE | src/AI/AgentBridge.cs |
| 11 | DONE | src/AI/ActionExecutor.cs |
| 12 | DONE | src/AI/AIManager.cs + Plugin.cs updated |
| 13 | IN PROGRESS | Integration testing underway — debugging action execution loop |
| 14 | IN PROGRESS | gameLog.ts being created |
| 15 | Not started | |

---

## Quick Reference

**To start backend:**
```bash
cd polytopia-agent
npm install
npm run dev
```

**To build PolyMod:**
```bash
cd PolyMod
dotnet build
```

**Backend URL:** `http://localhost:3001/api/turn`

### Architecture Notes

- **Backend uses `GetTurnActions`**: Single call per turn that returns all actions (move, attack, train, etc.) in one response, rather than one action at a time.
- **C# side uses `CommandBase` pattern**: Actions are executed via command classes (`MoveCommand`, `AttackCommand`, `TrainCommand`, `ResearchCommand`, `BuildCommand`, `CaptureCommand`, etc.) instead of generic Action classes.
- **No `HealCommand`**: Healing is not exposed through the game API — units heal automatically at end of turn when not acting.




