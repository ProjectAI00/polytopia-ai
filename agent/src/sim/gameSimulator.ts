/**
 * Polytopia Game Simulator
 *
 * Deterministic state machine that applies actions to GameState.
 * Used for backend AI-vs-AI games without the real game client.
 */

import type {
  GameState,
  Action,
  Tile,
  Unit,
  Player,
  UnitType,
  TechType,
  ImprovementType,
} from "../game/types.js";
import { getTile, getAdjacentTiles, manhattanDistance } from "../game/stateUtils.js";

// ─── Unit stat table ──────────────────────────────────────────────────────────

interface UnitStats {
  maxHealth: number;
  attack: number;
  defense: number;
  movement: number;
  range: number;
  trainCost: number;
}

const UNIT_STATS: Partial<Record<UnitType, UnitStats>> = {
  warrior:  { maxHealth: 10, attack: 2, defense: 2, movement: 1, range: 1, trainCost: 2 },
  rider:    { maxHealth: 10, attack: 2, defense: 1, movement: 2, range: 1, trainCost: 3 },
  defender: { maxHealth: 15, attack: 1, defense: 3, movement: 1, range: 1, trainCost: 3 },
  archer:   { maxHealth: 10, attack: 2, defense: 1, movement: 1, range: 2, trainCost: 3 },
  swordsman:{ maxHealth: 15, attack: 3, defense: 3, movement: 1, range: 1, trainCost: 5 },
  knight:   { maxHealth: 10, attack: 3, defense: 1, movement: 3, range: 1, trainCost: 8 },
  giant:    { maxHealth: 40, attack: 5, defense: 4, movement: 1, range: 1, trainCost: 10 },
  catapult: { maxHealth: 10, attack: 4, defense: 0, movement: 1, range: 3, trainCost: 8 },
};

const RESEARCH_COST = 5;

const TECH_TRAIN_UNLOCKS: Partial<Record<TechType, UnitType[]>> = {
  hunting:      ["warrior"],
  riding:       ["rider"],
  archery:      ["archer"],
  shields:      ["defender", "swordsman"],
  chivalry:     ["knight"],
};

const IMPROVEMENT_COSTS: Partial<Record<ImprovementType, number>> = {
  farm:       5,
  mine:       5,
  lumber_hut: 2,
  port:       10,
  temple:     20,
};

// ─── Deep clone helper ────────────────────────────────────────────────────────

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

// ─── Combat ───────────────────────────────────────────────────────────────────

function computeDamage(attacker: Unit, defender: Unit, attackVeteran = false): number {
  const atkStat = attacker.attack;
  const defStat = defender.defense;
  // Polytopia damage formula (simplified): (atk / (atk + def)) * 4.5 * (hp/maxhp)
  const attackPower = atkStat / (atkStat + defStat);
  const raw = Math.floor(attackPower * 4.5 * (attacker.health / (attacker.maxHealth || 10)));
  return Math.max(1, raw);
}

// ─── Stars per turn ───────────────────────────────────────────────────────────

function computeStarsPerTurn(state: GameState, playerId: number): number {
  const cityCount = state.map.tiles.filter(
    (t) => t.city && t.owner === playerId
  ).length;
  // Base 1 star per city, +1 for capital, +1 per farm/mine/etc.
  const improvementBonus = state.map.tiles
    .filter((t) => t.owner === playerId && t.improvement)
    .filter((t) =>
      ["farm", "mine", "lumber_hut", "windmill", "forge", "sawmill"].includes(
        t.improvement as string
      )
    ).length;
  return Math.max(1, cityCount + Math.floor(improvementBonus * 0.5));
}

// ─── Action application ───────────────────────────────────────────────────────

export interface ApplyResult {
  success: boolean;
  error?: string;
  newState: GameState;
}

export function applyAction(state: GameState, playerId: number, action: Action): ApplyResult {
  const s = cloneState(state);

  try {
    switch (action.type) {
      case "move":     return applyMove(s, playerId, action as any);
      case "attack":   return applyAttack(s, playerId, action as any);
      case "train":    return applyTrain(s, playerId, action as any);
      case "research": return applyResearch(s, playerId, action as any);
      case "build":    return applyBuild(s, playerId, action as any);
      case "capture":  return applyCapture(s, playerId, action as any);
      case "end_turn": return applyEndTurn(s, playerId);
      default:
        return { success: false, error: `Unknown action type: ${(action as any).type}`, newState: state };
    }
  } catch (e: any) {
    return { success: false, error: e.message, newState: state };
  }
}

function getTileOrFail(state: GameState, x: number, y: number): Tile {
  const t = getTile(state, x, y);
  if (!t) throw new Error(`No tile at (${x},${y})`);
  return t;
}

function applyMove(state: GameState, playerId: number, action: { unitX: number; unitY: number; toX: number; toY: number }): ApplyResult {
  const from = getTileOrFail(state, action.unitX, action.unitY);
  const to   = getTileOrFail(state, action.toX,   action.toY);

  if (!from.unit)                        return fail("No unit at source tile", state);
  if (from.unit.owner !== playerId)      return fail("Unit does not belong to player", state);
  if (!from.unit.canMove)                return fail("Unit cannot move", state);
  if (to.unit)                           return fail("Target tile occupied", state);
  if (to.terrain === "water" || to.terrain === "ocean") return fail("Cannot move onto water", state);

  to.unit = { ...from.unit, canMove: false };
  from.unit = null;

  return { success: true, newState: state };
}

function applyAttack(state: GameState, playerId: number, action: { unitX: number; unitY: number; targetX: number; targetY: number }): ApplyResult {
  const atkTile = getTileOrFail(state, action.unitX,  action.unitY);
  const defTile = getTileOrFail(state, action.targetX, action.targetY);

  if (!atkTile.unit)                       return fail("No attacking unit", state);
  if (atkTile.unit.owner !== playerId)     return fail("Attacker not owned by player", state);
  if (!atkTile.unit.canAttack)             return fail("Unit cannot attack", state);
  if (!defTile.unit)                       return fail("No unit to attack", state);
  if (defTile.unit.owner === playerId)     return fail("Cannot attack own unit", state);

  const atk = atkTile.unit;
  const def = defTile.unit;
  const dist = manhattanDistance(action.unitX, action.unitY, action.targetX, action.targetY);
  const range = atk.range || 1;
  if (dist > range)                        return fail(`Out of range (dist=${dist}, range=${range})`, state);

  const dmgToDefender = computeDamage(atk, def);
  const dmgToAttacker = range === 1 ? computeDamage(def, atk) : 0; // melee counter-attack

  defTile.unit = { ...def, health: def.health - dmgToDefender };
  atkTile.unit = { ...atk, health: atk.health - dmgToAttacker, canAttack: false, canMove: false };

  // Kill units at 0 HP
  if (defTile.unit.health <= 0) {
    defTile.unit = null;
    // Melee attacker advances into the vacated tile
    if (range === 1 && atkTile.unit && atkTile.unit.health > 0) {
      defTile.unit = { ...atkTile.unit };
      atkTile.unit = null;
    }
  }
  if (atkTile.unit && atkTile.unit.health <= 0) atkTile.unit = null;

  return { success: true, newState: state };
}

function applyTrain(state: GameState, playerId: number, action: { cityX: number; cityY: number; unitType: UnitType }): ApplyResult {
  const cityTile = getTileOrFail(state, action.cityX, action.cityY);
  if (!cityTile.city)              return fail("No city at tile", state);
  if (cityTile.owner !== playerId) return fail("City not owned by player", state);
  if (cityTile.unit)               return fail("City tile occupied", state);

  const stats = UNIT_STATS[action.unitType];
  const cost  = stats?.trainCost ?? 2;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Player not found", state);
  if (player.stars < cost) return fail(`Not enough stars (need ${cost}, have ${player.stars})`, state);

  player.stars -= cost;
  let nextUnitId = 1;
  state.map.tiles.forEach((t) => { if (t.unit && t.unit.id >= nextUnitId) nextUnitId = t.unit.id + 1; });

  cityTile.unit = {
    id: nextUnitId,
    type: action.unitType,
    owner: playerId,
    health: stats?.maxHealth ?? 10,
    maxHealth: stats?.maxHealth ?? 10,
    attack: stats?.attack ?? 2,
    defense: stats?.defense ?? 2,
    movement: stats?.movement ?? 1,
    range: stats?.range ?? 1,
    isVeteran: false,
    canMove: true,
    canAttack: true,
    kills: 0,
  };

  return { success: true, newState: state };
}

function applyResearch(state: GameState, playerId: number, action: { tech: TechType }): ApplyResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Player not found", state);
  if (player.stars < RESEARCH_COST) return fail(`Not enough stars for research`, state);
  if (player.techs.includes(action.tech)) return fail(`Tech already researched`, state);

  player.stars -= RESEARCH_COST;
  player.techs = [...player.techs, action.tech];

  return { success: true, newState: state };
}

function applyBuild(state: GameState, playerId: number, action: { tileX: number; tileY: number; improvement: ImprovementType }): ApplyResult {
  const tile = getTileOrFail(state, action.tileX, action.tileY);
  if (tile.owner !== playerId) return fail("Tile not owned by player", state);
  if (tile.improvement)        return fail("Tile already has improvement", state);

  const cost = IMPROVEMENT_COSTS[action.improvement] ?? 5;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return fail("Player not found", state);
  if (player.stars < cost) return fail(`Not enough stars (need ${cost})`, state);

  player.stars -= cost;
  tile.improvement = action.improvement;

  return { success: true, newState: state };
}

function applyCapture(state: GameState, playerId: number, action: { unitX: number; unitY: number }): ApplyResult {
  const tile = getTileOrFail(state, action.unitX, action.unitY);
  if (!tile.unit)                     return fail("No unit on tile", state);
  if (tile.unit.owner !== playerId)   return fail("Unit not owned by player", state);
  if (!tile.city)                     return fail("No city to capture", state);
  if (tile.owner === playerId)        return fail("Already own this city", state);

  const prevOwner = tile.owner;
  tile.owner = playerId;

  // Award stars and update scores
  const player = state.players.find((p) => p.id === playerId);
  if (player) {
    player.stars += 5; // Capture bonus
    player.cities = (player.cities || 0) + 1;
    player.score  = (player.score  || 0) + 100;
  }
  const loser = state.players.find((p) => p.id === prevOwner);
  if (loser) loser.cities = Math.max(0, (loser.cities || 1) - 1);

  return { success: true, newState: state };
}

function applyEndTurn(state: GameState, playerId: number): ApplyResult {
  // Reset canMove/canAttack for all units of current player
  for (const tile of state.map.tiles) {
    if (tile.unit?.owner === playerId) {
      tile.unit = { ...tile.unit, canMove: true, canAttack: true };
    }
  }

  // Award stars for next turn + accumulate score (1 pt per star earned)
  const player = state.players.find((p) => p.id === playerId);
  if (player) {
    const spt = computeStarsPerTurn(state, playerId);
    player.stars += spt;
    player.starsPerTurn = spt;
    player.score = (player.score || 0) + spt; // score tracks total stars earned
  }

  // Advance to next player
  const activePlayers = state.players.filter((p) => p.isAlive);
  const currentIdx = activePlayers.findIndex((p) => p.id === playerId);
  const nextPlayer = activePlayers[(currentIdx + 1) % activePlayers.length];

  if (nextPlayer.id <= playerId || activePlayers.length === 1) {
    // Wrapped around — new game turn
    state.turn = (state.turn || 0) + 1;
  }
  state.currentPlayerId = nextPlayer.id;

  return { success: true, newState: state };
}

// ─── Game-over detection ──────────────────────────────────────────────────────

export function isGameOver(state: GameState): { over: boolean; winnerId?: number; reason?: string } {
  const alive = state.players.filter((p) => p.isAlive);
  if (alive.length === 1) return { over: true, winnerId: alive[0].id, reason: "last_player" };
  if (state.turn >= (state.maxTurns || 30)) {
    const winner = state.players.reduce((a, b) => (a.score ?? 0) >= (b.score ?? 0) ? a : b);
    return { over: true, winnerId: winner.id, reason: "turns_exhausted" };
  }
  return { over: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(error: string, state: GameState): ApplyResult {
  return { success: false, error, newState: state };
}
