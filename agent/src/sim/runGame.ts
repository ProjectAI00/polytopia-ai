#!/usr/bin/env tsx
/**
 * AI vs AI Game Runner
 *
 * Runs a complete Polytopia game between two AI agents entirely in the
 * backend — no real game client required.
 *
 * Usage:
 *   npx tsx src/sim/runGame.ts
 *   npx tsx src/sim/runGame.ts --turns 30 --model anthropic/claude-sonnet-4
 *   npx tsx src/sim/runGame.ts --p1 anthropic/claude-sonnet-4 --p2 openai/gpt-4o
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GameState, Tile } from "../game/types.js";
import { processGameTurn } from "../agent/polytopiaBrain.js";
import { applyAction, isGameOver, cloneState } from "./gameSimulator.js";
import { startGameLog, logTurn, endGameLog } from "../storage/gameLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag: string, def: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
  };
  return {
    maxTurns: parseInt(get("--turns", "30"), 10),
    p1Model:  get("--p1", process.env.OR_MODEL ?? "anthropic/claude-sonnet-4-20250514"),
    p2Model:  get("--p2", process.env.OR_MODEL ?? "anthropic/claude-sonnet-4-20250514"),
    debug:    args.includes("--debug"),
  };
}

// ─── Initial game state ───────────────────────────────────────────────────────

function createInitialState(maxTurns: number): GameState {
  const tiles: Tile[] = [];

  // 11×11 map — two capitals in opposite corners, random terrain
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const isP1Capital = x === 1 && y === 1;
      const isP2Capital = x === 9 && y === 9;
      const isP1Warrior = x === 2 && y === 1;
      const isP2Warrior = x === 8 && y === 9;
      const isWater     = (x === 5 && y <= 4) || (x === 5 && y >= 6);
      const isMountain  = (x + y) % 7 === 0 && !isP1Capital && !isP2Capital;
      const hasResource = (x + y) % 5 === 1 && !isP1Capital && !isP2Capital ? "fruit" as const : null;
      const terrain     = (isWater ? "water" : isMountain ? "mountain" : "field") as import("../game/types.js").TerrainType;

      tiles.push({
        x,
        y,
        terrain,
        owner:   isP1Capital || isP1Warrior ? 0 : isP2Capital || isP2Warrior ? 1 : null,
        visible: true,
        explored: true,
        resource: hasResource,
        improvement: isP1Capital && y === 2 ? "farm" : null,
        city: isP1Capital
          ? { name: "Imperius", level: 1, population: 1, populationCap: 2, isCapital: true, hasWalls: false, connectedToCapital: true }
          : isP2Capital
          ? { name: "Barduria", level: 1, population: 1, populationCap: 2, isCapital: true, hasWalls: false, connectedToCapital: true }
          : null,
        unit: isP1Warrior
          ? { id: 1, type: "warrior" as const, owner: 0, health: 10, maxHealth: 10, attack: 2, defense: 2, movement: 1, range: 1, isVeteran: false, canMove: true, canAttack: true, kills: 0 }
          : isP2Warrior
          ? { id: 2, type: "warrior" as const, owner: 1, health: 10, maxHealth: 10, attack: 2, defense: 2, movement: 1, range: 1, isVeteran: false, canMove: true, canAttack: true, kills: 0 }
          : null,
        hasRoad: false,
      });
    }
  }

  return {
    turn: 1,
    maxTurns,
    currentPlayerId: 0,
    gameMode: "perfection",
    players: [
      { id: 0, tribe: "imperius", name: "AI-1 (Imperius)", stars: 5, starsPerTurn: 2, techs: ["organization"], score: 0, cities: 1, units: 1, isAlive: true, isHuman: false },
      { id: 1, tribe: "bardur",   name: "AI-2 (Bardur)",   stars: 5, starsPerTurn: 2, techs: ["hunting"],      score: 0, cities: 1, units: 1, isAlive: true, isHuman: false },
    ],
    map: { width: 11, height: 11, tiles },
  };
}

// ─── Main game loop ───────────────────────────────────────────────────────────

async function runGame() {
  const { maxTurns, p1Model, p2Model, debug } = parseArgs();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Polytopia AI vs AI Simulation         ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  Player 1: AI (${p1Model})`);
  console.log(`  Player 2: AI (${p2Model})`);
  console.log(`  Max turns: ${maxTurns}\n`);

  let state = createInitialState(maxTurns);
  const models = [p1Model, p2Model];

  const gameId = `sim-${Date.now()}`;
  const logPath = path.join(__dirname, "../../logs", `${gameId}.json`);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const turnLog: any[] = [];
  let turnNumber = 0;

  while (true) {
    const gameOver = isGameOver(state);
    if (gameOver.over) {
      const winner = state.players.find((p) => p.id === gameOver.winnerId);
      console.log("\n🏆 GAME OVER");
      console.log(`   Winner: ${winner?.name ?? "Unknown"} (Player ${gameOver.winnerId})`);
      console.log(`   Reason: ${gameOver.reason}`);
      console.log(`   Final scores: ${state.players.map((p) => `${p.name}: ${p.score}`).join(" | ")}`);

      fs.writeFileSync(logPath, JSON.stringify({
        gameId,
        settings: { maxTurns, p1Model, p2Model },
        result:   { winnerId: gameOver.winnerId, reason: gameOver.reason },
        players:  state.players,
        turns:    turnLog,
      }, null, 2));
      console.log(`\n   Log saved: ${logPath}`);
      break;
    }

    const playerId = state.currentPlayerId;
    const model    = models[playerId];
    const player   = state.players.find((p) => p.id === playerId);
    turnNumber++;

    console.log(`\n── Turn ${state.turn} │ ${player?.name} (Player ${playerId}) │ Stars: ${player?.stars} ──`);

    try {
      const result = await processGameTurn(state, playerId, { model, debug });

      // Apply each action returned by the agent
      const actionsToApply = Array.isArray(result.actions) && result.actions.length > 0
        ? result.actions
        : result.action
        ? [result.action]
        : [{ type: "end_turn" as const }];

      let currentState = cloneState(state);
      const appliedActions: string[] = [];

      for (const action of actionsToApply) {
        if (action.type === "end_turn") {
          const r = applyAction(currentState, playerId, action);
          currentState = r.newState;
          appliedActions.push("end_turn");
          break;
        }

        const r = applyAction(currentState, playerId, action);
        if (r.success) {
          currentState = r.newState;
          appliedActions.push(action.type);
          if (debug) console.log(`   ✓ ${action.type}`);
        } else {
          if (debug) console.log(`   ✗ ${action.type}: ${r.error}`);
        }
      }

      // Ensure turn always ends
      if (!appliedActions.includes("end_turn")) {
        const r = applyAction(currentState, playerId, { type: "end_turn" });
        currentState = r.newState;
        appliedActions.push("end_turn");
      }

      console.log(`   Actions: ${appliedActions.join(" → ")}`);
      if (result.reasoning) {
        const short = result.reasoning.slice(0, 120).replace(/\n/g, " ");
        console.log(`   Reasoning: ${short}${result.reasoning.length > 120 ? "…" : ""}`);
      }

      turnLog.push({
        turn:     state.turn,
        playerId,
        actions:  appliedActions,
        reasoning: result.reasoning,
        stateSnapshot: {
          players: state.players.map((p) => ({ id: p.id, stars: p.stars, score: p.score, cities: p.cities })),
        },
      });

      state = currentState;

    } catch (err: any) {
      console.error(`   Error processing turn: ${err.message}`);
      // Force end turn on error
      const r = applyAction(state, playerId, { type: "end_turn" });
      state = r.newState;
    }

    // Safety: cap at maxTurns * 2 loop iterations to prevent infinite loops
    if (turnNumber > maxTurns * 4) {
      console.log("\n⚠ Safety limit hit — ending simulation");
      break;
    }
  }
}

runGame().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
