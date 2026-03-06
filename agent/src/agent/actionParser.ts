/**
 * Action Parser
 *
 * Validates and parses LLM-generated actions against the current game state.
 */

import type {
  Action,
  GameState,
  ImprovementType,
  TechType,
  Unit,
  UnitType,
} from "../game/types.js";
import { getPlayerStars, getTile, isAdjacent, manhattanDistance } from "../game/stateUtils.js";

const TRAIN_COSTS: Partial<Record<UnitType, number>> = {
  warrior: 2,
  rider: 3,
  defender: 3,
  archer: 3,
  catapult: 8,
  swordsman: 5,
  knight: 8,
  mind_bender: 5,
  giant: 20,
};

const IMPROVEMENT_COSTS: Partial<Record<ImprovementType, number>> = {
  farm: 5,
  mine: 5,
  lumber_hut: 2,
  port: 10,
  temple: 10,
};

const RESEARCH_BASE_COST = 5;

/**
 * Parse and validate an action from the LLM response
 */
export function parseAction(rawAction: any, gameState: GameState, playerId: number): Action {
  if (!rawAction || typeof rawAction !== "object") {
    throw new Error("Invalid action: not an object");
  }

  const actionType = rawAction.type;
  switch (actionType) {
    case "move":
      return validateMoveAction(rawAction, gameState, playerId);
    case "attack":
      return validateAttackAction(rawAction, gameState, playerId);
    case "train":
      return validateTrainAction(rawAction, gameState, playerId);
    case "research":
      return validateResearchAction(rawAction, gameState, playerId);
    case "build":
      return validateBuildAction(rawAction, gameState, playerId);
    case "capture":
      return validateCaptureAction(rawAction, gameState, playerId);
    case "heal":
      return validateHealAction(rawAction, gameState, playerId);
    case "convert":
      return validateConvertAction(rawAction, gameState, playerId);
    case "disembark":
      return validateDisembarkAction(rawAction, gameState, playerId);
    case "end_turn":
      return { type: "end_turn" };
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

function getRuntimeLegalActions(gameState: GameState): Action[] {
  return Array.isArray(gameState.legalActions) ? gameState.legalActions : [];
}

function hasRuntimeLegalAction(gameState: GameState, matcher: (action: Action) => boolean): boolean {
  return getRuntimeLegalActions(gameState).some(matcher);
}

function validateMoveAction(raw: any, gameState: GameState, playerId: number): Action {
  let unitX = raw.unitX;
  let unitY = raw.unitY;
  let toX = raw.toX;
  let toY = raw.toY;

  if (raw.to && typeof raw.to === "object") {
    toX = raw.to.x;
    toY = raw.to.y;
  }

  if (!isValidCoord(unitX) || !isValidCoord(unitY) || !isValidCoord(toX) || !isValidCoord(toY)) {
    throw new Error("Move action: invalid coordinates");
  }

  const unitTile = getTile(gameState, unitX, unitY);
  if (!unitTile?.unit || unitTile.unit.owner !== playerId) {
    throw new Error("Move action: no friendly unit at source");
  }
  if (!unitTile.unit.canMove) {
    throw new Error("Move action: unit cannot move");
  }

  const targetTile = getTile(gameState, toX, toY);
  if (!targetTile) {
    throw new Error("Move action: invalid target tile");
  }
  if (targetTile.unit) {
    throw new Error("Move action: target tile is occupied");
  }

  if (unitTile.unit.validMoves && unitTile.unit.validMoves.length > 0) {
    const isListedMove = unitTile.unit.validMoves.some((move) => move.x === toX && move.y === toY);
    if (!isListedMove) {
      throw new Error("Move action: target tile not present in runtime validMoves");
    }
  }

  const distance = manhattanDistance(unitX, unitY, toX, toY);
  const maxDistance = unitTile.unit.type === "rider" ? 2 : 1;
  if (distance === 0 || distance > maxDistance) {
    throw new Error(`Move action: unit cannot move ${distance} tiles`);
  }

  return { type: "move", unitX, unitY, toX, toY };
}

function validateAttackAction(raw: any, gameState: GameState, playerId: number): Action {
  let unitX = raw.unitX;
  let unitY = raw.unitY;
  let targetX = raw.targetX;
  let targetY = raw.targetY;

  if (raw.target && typeof raw.target === "object") {
    targetX = raw.target.x;
    targetY = raw.target.y;
  }

  if (!isValidCoord(unitX) || !isValidCoord(unitY) || !isValidCoord(targetX) || !isValidCoord(targetY)) {
    throw new Error("Attack action: invalid coordinates");
  }

  const unitTile = getTile(gameState, unitX, unitY);
  if (!unitTile?.unit || unitTile.unit.owner !== playerId) {
    throw new Error("Attack action: no friendly unit at source");
  }
  if (!unitTile.unit.canAttack) {
    throw new Error("Attack action: unit cannot attack");
  }

  const targetTile = getTile(gameState, targetX, targetY);
  if (!targetTile?.unit || targetTile.unit.owner === playerId) {
    throw new Error("Attack action: no enemy unit at target");
  }

  if (unitTile.unit.attackTargets && unitTile.unit.attackTargets.length > 0) {
    const isListedTarget = unitTile.unit.attackTargets.some((target) => target.x === targetX && target.y === targetY);
    if (!isListedTarget) {
      throw new Error("Attack action: target not present in runtime attackTargets");
    }
  }

  const distance = manhattanDistance(unitX, unitY, targetX, targetY);
  const range = getUnitAttackRange(unitTile.unit);
  if (distance === 0 || distance > range) {
    throw new Error(`Attack action: target out of range (range ${range})`);
  }

  return { type: "attack", unitX, unitY, targetX, targetY };
}

function validateTrainAction(raw: any, gameState: GameState, playerId: number): Action {
  let cityX = raw.cityX;
  let cityY = raw.cityY;
  let unitType = raw.unitType || raw.unit_type;

  if (raw.coord && typeof raw.coord === "object") {
    cityX = raw.coord.x;
    cityY = raw.coord.y;
  }

  if (!isValidCoord(cityX) || !isValidCoord(cityY)) {
    throw new Error("Train action: invalid coordinates");
  }

  const cityTile = getTile(gameState, cityX, cityY);
  if (!cityTile?.city || cityTile.owner !== playerId) {
    throw new Error("Train action: no friendly city at location");
  }
  if (cityTile.unit) {
    throw new Error("Train action: city tile is occupied");
  }

  const validUnits: UnitType[] = [
    "warrior",
    "rider",
    "defender",
    "swordsman",
    "archer",
    "catapult",
    "knight",
    "giant",
    "mind_bender",
  ];
  if (!validUnits.includes(unitType as UnitType)) {
    throw new Error(`Train action: invalid unit type '${unitType}'`);
  }

  if (
    getRuntimeLegalActions(gameState).length > 0 &&
    !hasRuntimeLegalAction(
      gameState,
      (action) =>
        action.type === "train" &&
        action.cityX === cityX &&
        action.cityY === cityY &&
        action.unitType === unitType
    )
  ) {
      throw new Error("Train action: not present in runtime legalActions");
  }

  const cost = TRAIN_COSTS[unitType as UnitType];
  if (cost !== undefined && getPlayerStars(gameState, playerId) < cost) {
    throw new Error(`Train action: not enough stars (need ${cost})`);
  }

  return { type: "train", cityX, cityY, unitType: unitType as UnitType };
}

function validateResearchAction(raw: any, gameState: GameState, playerId: number): Action {
  const { tech } = raw;

  const validTechs: TechType[] = [
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
  if (!validTechs.includes(tech as TechType)) {
    throw new Error(`Research action: invalid tech '${tech}'`);
  }

  if (
    getRuntimeLegalActions(gameState).length > 0 &&
    !hasRuntimeLegalAction(
      gameState,
      (action) => action.type === "research" && action.tech === tech
    )
  ) {
      throw new Error(`Research action: tech '${tech}' not present in runtime legalActions`);
  }

  const player = gameState.players.find((p) => p.id === playerId);
  if (player?.techs?.includes(tech as TechType)) {
    throw new Error(`Research action: tech '${tech}' already researched`);
  }
  if (getPlayerStars(gameState, playerId) < RESEARCH_BASE_COST) {
    throw new Error(`Research action: not enough stars (need ${RESEARCH_BASE_COST})`);
  }

  return { type: "research", tech: tech as TechType };
}

function validateBuildAction(raw: any, gameState: GameState, playerId: number): Action {
  let tileX = raw.tileX;
  let tileY = raw.tileY;
  let improvement = raw.improvement || raw.improvement_type;

  if (raw.coord && typeof raw.coord === "object") {
    tileX = raw.coord.x;
    tileY = raw.coord.y;
  }

  if (!isValidCoord(tileX) || !isValidCoord(tileY)) {
    throw new Error("Build action: invalid coordinates");
  }

  const tile = getTile(gameState, tileX, tileY);
  if (!tile || tile.owner !== playerId) {
    throw new Error("Build action: tile not owned");
  }
  if (tile.improvement) {
    throw new Error("Build action: tile already has improvement");
  }

  const validImprovements: ImprovementType[] = [
    "farm",
    "mine",
    "lumber_hut",
    "windmill",
    "forge",
    "sawmill",
    "port",
    "customs_house",
    "temple",
    "forest_temple",
    "water_temple",
    "mountain_temple",
    "monument",
    "ice_temple",
    "mycelium",
  ];
  if (!validImprovements.includes(improvement as ImprovementType)) {
    throw new Error(`Build action: invalid improvement '${improvement}'`);
  }

  if (
    getRuntimeLegalActions(gameState).length > 0 &&
    !hasRuntimeLegalAction(
      gameState,
      (action) =>
        action.type === "build" &&
        action.tileX === tileX &&
        action.tileY === tileY &&
        action.improvement === improvement
    )
  ) {
      throw new Error("Build action: not present in runtime legalActions");
  }

  const cost = IMPROVEMENT_COSTS[improvement as ImprovementType];
  if (cost !== undefined && getPlayerStars(gameState, playerId) < cost) {
    throw new Error(`Build action: not enough stars (need ${cost})`);
  }

  return { type: "build", tileX, tileY, improvement: improvement as ImprovementType };
}

function validateCaptureAction(raw: any, gameState: GameState, playerId: number): Action {
  const { unitX, unitY } = raw;

  if (!isValidCoord(unitX) || !isValidCoord(unitY)) {
    throw new Error("Capture action: invalid coordinates");
  }

  const tile = getTile(gameState, unitX, unitY);
  if (!tile?.unit || tile.unit.owner !== playerId) {
    throw new Error("Capture action: no friendly unit at location");
  }
  if (!tile.city) {
    throw new Error("Capture action: no city/village at unit location");
  }

  if (getRuntimeLegalActions(gameState).length > 0 &&
      !hasRuntimeLegalAction(
        gameState,
        (action) => action.type === "capture" && action.unitX === unitX && action.unitY === unitY
      )) {
    throw new Error("Capture action: not present in runtime legalActions");
  }

  return { type: "capture", unitX, unitY };
}

function validateHealAction(raw: any, gameState: GameState, playerId: number): Action {
  const { unitX, unitY } = raw;

  if (!isValidCoord(unitX) || !isValidCoord(unitY)) {
    throw new Error("Heal action: invalid coordinates");
  }

  const tile = getTile(gameState, unitX, unitY);
  if (!tile?.unit || tile.unit.owner !== playerId) {
    throw new Error("Heal action: no friendly unit at location");
  }

  return { type: "heal", unitX, unitY };
}

function validateConvertAction(raw: any, gameState: GameState, playerId: number): Action {
  let unitX = raw.unitX;
  let unitY = raw.unitY;
  let targetX = raw.targetX;
  let targetY = raw.targetY;

  if (raw.target && typeof raw.target === "object") {
    targetX = raw.target.x;
    targetY = raw.target.y;
  }

  if (!isValidCoord(unitX) || !isValidCoord(unitY) || !isValidCoord(targetX) || !isValidCoord(targetY)) {
    throw new Error("Convert action: invalid coordinates");
  }

  const unitTile = getTile(gameState, unitX, unitY);
  if (!unitTile?.unit || unitTile.unit.owner !== playerId) {
    throw new Error("Convert action: no friendly unit at source");
  }

  const targetTile = getTile(gameState, targetX, targetY);
  if (!targetTile?.unit || targetTile.unit.owner === playerId) {
    throw new Error("Convert action: no enemy unit at target");
  }

  if (manhattanDistance(unitX, unitY, targetX, targetY) > 1) {
    throw new Error("Convert action: target out of range");
  }

  return { type: "convert", unitX, unitY, targetX, targetY };
}

function validateDisembarkAction(raw: any, gameState: GameState, playerId: number): Action {
  let unitX = raw.unitX;
  let unitY = raw.unitY;
  let toX = raw.toX;
  let toY = raw.toY;

  if (raw.to && typeof raw.to === "object") {
    toX = raw.to.x;
    toY = raw.to.y;
  }

  if (!isValidCoord(unitX) || !isValidCoord(unitY) || !isValidCoord(toX) || !isValidCoord(toY)) {
    throw new Error("Disembark action: invalid coordinates");
  }

  const unitTile = getTile(gameState, unitX, unitY);
  if (!unitTile?.unit || unitTile.unit.owner !== playerId) {
    throw new Error("Disembark action: no friendly unit at source");
  }
  if (!unitTile.unit.canMove) {
    throw new Error("Disembark action: unit cannot move");
  }

  const targetTile = getTile(gameState, toX, toY);
  if (!targetTile) {
    throw new Error("Disembark action: invalid target tile");
  }
  if (targetTile.unit) {
    throw new Error("Disembark action: target tile is occupied");
  }
  if (!isAdjacent(unitX, unitY, toX, toY)) {
    throw new Error("Disembark action: target must be adjacent");
  }

  return { type: "disembark", unitX, unitY, toX, toY };
}

function getUnitAttackRange(unit: Unit): number {
  if (unit.type === "warrior") return 1;
  if (unit.type === "archer") return 2;
  if (unit.type === "catapult") return 3;
  return unit.range || 1;
}

function isValidCoord(coord: any): boolean {
  return typeof coord === "number" && coord >= 0 && Number.isInteger(coord);
}
