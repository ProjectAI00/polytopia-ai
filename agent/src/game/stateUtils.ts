import type { GameState, Tile, Unit } from "./types.js";

const tileIndexCache = new WeakMap<GameState, Map<string, Tile>>();

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function buildTileIndex(gameState: GameState): Map<string, Tile> {
  const index = new Map<string, Tile>();
  for (const tile of gameState.map.tiles) {
    index.set(tileKey(tile.x, tile.y), tile);
  }
  return index;
}

function getCachedTileIndex(gameState: GameState): Map<string, Tile> {
  const cached = tileIndexCache.get(gameState);
  if (cached) {
    return cached;
  }
  const index = buildTileIndex(gameState);
  tileIndexCache.set(gameState, index);
  return index;
}

export function getTile(gameState: GameState, x: number, y: number): Tile | undefined {
  return getCachedTileIndex(gameState).get(tileKey(x, y));
}

export function getAdjacentTiles(gameState: GameState, x: number, y: number): Tile[] {
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return deltas
    .map(([dx, dy]) => getTile(gameState, x + dx, y + dy))
    .filter((tile): tile is Tile => Boolean(tile));
}

export function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
  return manhattanDistance(x1, y1, x2, y2) === 1;
}

export function getMyUnits(gameState: GameState, playerId: number): (Unit & { x: number; y: number })[] {
  return gameState.map.tiles
    .filter((tile) => tile.unit?.owner === playerId)
    .map((tile) => ({ ...tile.unit!, x: tile.x, y: tile.y }));
}

export function getEnemyUnits(gameState: GameState, playerId: number): (Unit & { x: number; y: number })[] {
  return gameState.map.tiles
    .filter((tile) => tile.unit && tile.unit.owner !== playerId)
    .map((tile) => ({ ...tile.unit!, x: tile.x, y: tile.y }));
}

export function getUnitAtTile(gameState: GameState, x: number, y: number): Unit | undefined {
  return getTile(gameState, x, y)?.unit ?? undefined;
}

export function getMyCities(gameState: GameState, playerId: number): Tile[] {
  return gameState.map.tiles.filter((tile) => tile.city && tile.owner === playerId);
}

export function getPlayerStars(gameState: GameState, playerId: number): number {
  return gameState.players.find((player) => player.id === playerId)?.stars ?? 0;
}
