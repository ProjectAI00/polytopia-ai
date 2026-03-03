using System.Text.Json;
using Polytopia.Data;
using PolytopiaBackendBase.Game;

namespace PolyAI;

internal static class StateExtractor
{
    public static string ExtractGameState(GameState gameState, int playerId)
    {
        var playerIdByte = (byte)playerId;
        var map = gameState.Map;

        // Pre-index tiles by coordinate for fast lookup
        var tileIndex = new Dictionary<long, TileData>();
        foreach (var t in map.Tiles)
            if (t != null) tileIndex[CoordKey(t.coordinates.X, t.coordinates.Y)] = t;

        var unitsPerPlayer = new Dictionary<byte, int>();
        var tiles = new List<object>(map.Tiles.Length);

        foreach (var tile in map.Tiles)
        {
            if (tile == null) continue;

            object unitObj = null;
            try
            {
                var unit = tile.GetUnit(gameState, playerIdByte, true);
                if (unit != null)
                {
                    if (!unitsPerPlayer.TryAdd(unit.owner, 1)) unitsPerPlayer[unit.owner] += 1;
                    var validMoves = (int)unit.owner == playerId ? GetValidMoves(tile, tileIndex, unit) : new List<object>();
                    var attackTargets = (int)unit.owner == playerId ? GetAttackTargets(tile, tileIndex, unit, playerIdByte) : new List<object>();
                    unitObj = new
                    {
                        id = unit.id,
                        type = unit.type.ToString().ToLower(),
                        owner = (int)unit.owner,
                        health = (int)unit.health,
                        maxHealth = unit.UnitData != null ? unit.UnitData.health : 10,
                        attack = unit.UnitData != null ? unit.UnitData.attack : 2,
                        defense = unit.UnitData != null ? unit.UnitData.defence : 2,
                        movement = unit.UnitData != null ? unit.UnitData.movement : 1,
                        range = unit.UnitData != null ? unit.UnitData.range : 1,
                        isVeteran = unit.promotionLevel > 0,
                        canMove = unit.CanMove(),
                        canAttack = unit.CanAttack(),
                        kills = 0,
                        validMoves,
                        attackTargets
                    };
                }
            }
            catch { }

            tiles.Add(new
            {
                x = tile.coordinates.X,
                y = tile.coordinates.Y,
                terrain = tile.terrain.ToString().ToLower(),
                owner = tile.owner != byte.MaxValue ? (int?)tile.owner : null,
                visible = true,
                explored = SafeGetExplored(tile, playerIdByte),
                resource = tile.resource != null && tile.resource.type.ToString() != "None"
                    ? tile.resource.type.ToString().ToLower() : null,
                improvement = tile.improvement != null
                    ? tile.improvement.type.ToString().ToLower() : null,
                city = (tile.improvement != null &&
                        (tile.improvement.type == ImprovementData.Type.City ||
                         tile.improvement.type == ImprovementData.Type.Outpost))
                    ? (object)new
                    {
                        name        = tile.improvement.name ?? "City",
                        level       = (int)tile.improvement.level,
                        population  = (int)tile.improvement.population,
                        isCapital   = tile.capitalOf != byte.MaxValue,
                        capitalOf   = tile.capitalOf != byte.MaxValue ? (int?)tile.capitalOf : null,
                        x           = tile.coordinates.X,
                        y           = tile.coordinates.Y
                    }
                    : (object)null,
                unit = unitObj,
                hasRoad = tile.HasRoad
            });
        }

        var players = new List<object>();
        try
        {
            foreach (var p in gameState.PlayerStates)
            {
                if (p == null) continue;
                var techs = new List<string>();
                try { if (p.availableTech != null) foreach (var t in p.availableTech) techs.Add(t.ToString().ToLower()); }
                catch { }

                players.Add(new
                {
                    id = (int)p.Id,
                    tribe = p.tribe.ToString().ToLower(),
                    name = SafeGetName(p),
                    stars = p.Currency,
                    starsPerTurn = SafeGetIncome(gameState, p.Id),
                    techs,
                    score = (int)p.score,
                    cities = p.cities,
                    units = unitsPerPlayer.TryGetValue(p.Id, out var cnt) ? cnt : 0,
                    isAlive = p.killedTurn == 0,
                    isHuman = !p.AutoPlay
                });
            }
        }
        catch { }

        var state = new
        {
            turn = (int)gameState.CurrentTurn,
            maxTurns = 30,
            currentPlayerId = playerId,
            gameMode = SafeGetGameMode(gameState),
            players,
            map = new { width = (int)map.Width, height = (int)map.Height, tiles }
        };

        return JsonSerializer.Serialize(state, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
    }

    private static long CoordKey(int x, int y) => ((long)x << 16) | (uint)y;

    // Adjacency offsets for Polytopia's hex-like grid
    // Use WorldCoordinates.IsAdjacent to let the game decide
    private static List<object> GetValidMoves(TileData unitTile, Dictionary<long, TileData> tileIndex, UnitState unit)
    {
        var moves = new List<object>();
        try
        {
            if (!unit.CanMove()) return moves;
            int ux = unitTile.coordinates.X, uy = unitTile.coordinates.Y;
            // Check all tiles within ±2 of unit position for adjacency
            for (int dx = -2; dx <= 2; dx++)
            for (int dy = -2; dy <= 2; dy++)
            {
                if (dx == 0 && dy == 0) continue;
                if (!tileIndex.TryGetValue(CoordKey(ux + dx, uy + dy), out var t)) continue;
                if (!WorldCoordinates.IsAdjacent(unitTile.coordinates, t.coordinates)) continue;
                if (t.IsWater) continue;
                if (t.unit != null) continue; // occupied
                moves.Add(new { x = t.coordinates.X, y = t.coordinates.Y, terrain = t.terrain.ToString().ToLower() });
            }
        }
        catch { }
        return moves;
    }

    private static List<object> GetAttackTargets(TileData unitTile, Dictionary<long, TileData> tileIndex, UnitState unit, byte ownerId)
    {
        var targets = new List<object>();
        try
        {
            if (!unit.CanAttack()) return targets;
            int range = unit.UnitData?.range ?? 1;
            int ux = unitTile.coordinates.X, uy = unitTile.coordinates.Y;
            for (int dx = -range - 1; dx <= range + 1; dx++)
            for (int dy = -range - 1; dy <= range + 1; dy++)
            {
                if (!tileIndex.TryGetValue(CoordKey(ux + dx, uy + dy), out var t)) continue;
                if (t.unit == null || t.unit.owner == ownerId) continue;
                var dist = WorldCoordinates.Distance(unitTile.coordinates, t.coordinates);
                if (dist <= range)
                    targets.Add(new { x = t.coordinates.X, y = t.coordinates.Y, unitType = t.unit.type.ToString().ToLower(), health = (int)t.unit.health });
            }
        }
        catch { }
        return targets;
    }

    private static bool SafeGetExplored(TileData tile, byte playerId)
    {
        try { return tile.GetExplored(playerId); } catch { return true; }
    }

    private static string SafeGetName(PlayerState p)
    {
        try { return p.GetNameInternal() ?? $"Player{p.Id}"; } catch { return $"Player{p.Id}"; }
    }

    private static string SafeGetGameMode(GameState gs)
    {
        try { return gs.Settings?.BaseGameMode.ToString().ToLower() ?? "perfection"; } catch { return "perfection"; }
    }

    private static int SafeGetIncome(GameState gs, byte playerId)
    {
        try { return ResourceDataUtils.CalculateIncomeFor(gs, playerId); } catch { return 0; }
    }
}
