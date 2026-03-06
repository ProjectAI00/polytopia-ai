import type { Action, GameState, TechType, Unit, UnitType } from "./types.js";
import {
  getAdjacentTiles,
  getEnemyUnits,
  getMyCities,
  getMyUnits,
  getPlayerStars,
  manhattanDistance,
} from "./stateUtils.js";

const TRAIN_COSTS: Partial<Record<UnitType, number>> = {
  warrior: 2,
  rider: 3,
  archer: 3,
  defender: 3,
};

const RESEARCH_BASE_COST = 5;

const ALL_TECHS: TechType[] = [
  "climbing",
  "fishing",
  "hunting",
  "organization",
  "riding",
  "archery",
  "farming",
  "forestry",
  "free_diving",
  "meditation",
  "mining",
  "roads",
  "shields",
  "whaling",
  "aquatism",
  "chivalry",
  "construction",
  "mathematics",
  "navigation",
  "smithery",
  "spiritualism",
  "trade",
  "philosophy",
];

function getAttackRange(unit: Unit): number {
  if (unit.type === "warrior") return 1;
  if (unit.type === "archer") return 2;
  if (unit.type === "catapult") return 3;
  return unit.range || 1;
}

function getRuntimeLegalActions(gameState: GameState): Action[] {
  return Array.isArray(gameState.legalActions) ? [...gameState.legalActions] : [];
}

export function getLegalActions(gameState: GameState, playerId: number): Action[] {
  const runtimeActions = getRuntimeLegalActions(gameState);
  if (runtimeActions.length > 0) {
    return runtimeActions;
  }

  const actions: Action[] = [];
  const stars = getPlayerStars(gameState, playerId);

  for (const unit of getMyUnits(gameState, playerId)) {
    if (unit.canMove) {
      for (const tile of getAdjacentTiles(gameState, unit.x, unit.y)) {
        if (!tile.unit) {
          actions.push({
            type: "move",
            unitX: unit.x,
            unitY: unit.y,
            toX: tile.x,
            toY: tile.y,
          });
        }
      }
    }
  }

  const enemies = getEnemyUnits(gameState, playerId);
  for (const unit of getMyUnits(gameState, playerId)) {
    if (!unit.canAttack) continue;
    const range = getAttackRange(unit);
    for (const enemy of enemies) {
      if (manhattanDistance(unit.x, unit.y, enemy.x, enemy.y) <= range) {
        actions.push({
          type: "attack",
          unitX: unit.x,
          unitY: unit.y,
          targetX: enemy.x,
          targetY: enemy.y,
        });
      }
    }
  }

  const player = gameState.players.find((p) => p.id === playerId);
  const researched = new Set(player?.techs ?? []);
  if (stars >= RESEARCH_BASE_COST) {
    for (const tech of ALL_TECHS) {
      if (!researched.has(tech)) {
        actions.push({ type: "research", tech });
      }
    }
  }

  const basicUnits: UnitType[] = ["warrior", "rider", "archer", "defender"];
  for (const cityTile of getMyCities(gameState, playerId)) {
    if (cityTile.unit) continue;
    for (const unitType of basicUnits) {
      const cost = TRAIN_COSTS[unitType];
      if (cost !== undefined && stars < cost) continue;
      actions.push({
        type: "train",
        cityX: cityTile.x,
        cityY: cityTile.y,
        unitType,
      });
    }
  }

  actions.push({ type: "end_turn" });
  return actions;
}
