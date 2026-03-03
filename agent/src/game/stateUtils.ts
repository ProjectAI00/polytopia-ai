import type { GameState, Tile, Unit, ValidMove, AttackTarget } from "./types.js";

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

/**
 * Compute and annotate validMoves + attackTargets for all units owned by playerId.
 * For units with movement > 1 (e.g. riders), BFS up to movement steps.
 * Modifies state in-place and returns it.
 */
export function annotateValidMoves(state: GameState, playerId: number): GameState {
  const index = buildTileIndex(state);

  for (const tile of state.map.tiles) {
    const unit = tile.unit;
    if (!unit || unit.owner !== playerId) continue;

    // --- valid moves: BFS up to movement steps, no water, no occupied ---
    if (unit.canMove) {
      const visited = new Set<string>();
      const queue: Array<{ x: number; y: number; steps: number }> = [{ x: tile.x, y: tile.y, steps: 0 }];
      const moves: ValidMove[] = [];
      visited.add(`${tile.x},${tile.y}`);

      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur.steps >= (unit.movement || 1)) continue;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          visited.add(key);
          const t = index.get(key);
          if (!t || t.terrain === "water" || t.terrain === "ocean") continue;
          if (!t.unit) {
            moves.push({ x: nx, y: ny, terrain: t.terrain });
            queue.push({ x: nx, y: ny, steps: cur.steps + 1 });
          }
          // occupied tiles block further movement but don't count as valid moves
        }
      }
      unit.validMoves = moves;
    } else {
      unit.validMoves = [];
    }

    // --- attack targets: all enemy units within range ---
    if (unit.canAttack) {
      const range = unit.range || 1;
      const targets: AttackTarget[] = [];
      for (const t of state.map.tiles) {
        if (!t.unit || t.unit.owner === playerId) continue;
        if (manhattanDistance(tile.x, tile.y, t.x, t.y) <= range) {
          targets.push({ x: t.x, y: t.y, unitType: t.unit.type, health: t.unit.health });
        }
      }
      unit.attackTargets = targets;
    } else {
      unit.attackTargets = [];
    }
  }

  return state;
}
