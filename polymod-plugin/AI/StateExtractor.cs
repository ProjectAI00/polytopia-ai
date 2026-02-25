using System.Text.Json;
using Polytopia.Data;
using PolytopiaBackendBase.Game;

namespace PolyMod.AI;

/// <summary>
/// Extracts game state and serializes it to JSON for the AI backend.
/// Uses API members available in the current game assembly.
/// </summary>
public static class StateExtractor
{
    public static string ExtractGameState(GameState gameState, int playerId)
    {
        var playerIdByte = (byte)playerId;
        var map = gameState.Map;

        var unitsPerPlayer = new Dictionary<byte, int>();
        var tiles = new List<object>(map.Tiles.Length);

        foreach (var tile in map.Tiles)
        {
            if (tile == null) continue;

            var unit = tile.GetUnit(gameState, playerIdByte, true);
            if (unit != null)
            {
                if (!unitsPerPlayer.TryAdd(unit.owner, 1))
                {
                    unitsPerPlayer[unit.owner] += 1;
                }
            }

            tiles.Add(new
            {
                x = tile.coordinates.X,
                y = tile.coordinates.Y,
                terrain = tile.terrain.ToString().ToLowerInvariant(),
                owner = tile.owner != byte.MaxValue ? (int?)tile.owner : null,
                visible = true,
                explored = tile.GetExplored(playerIdByte),
                resource = tile.resource != null && tile.resource.type != ResourceData.Type.None
                    ? tile.resource.type.ToString().ToLowerInvariant()
                    : null,
                improvement = tile.improvement != null
                    ? tile.improvement.type.ToString().ToLowerInvariant()
                    : null,
                city = (object?)null,
                unit = unit == null
                    ? null
                    : new
                    {
                        id = unit.id,
                        type = unit.type.ToString().ToLowerInvariant(),
                        owner = unit.owner,
                        health = (int)unit.health,
                        maxHealth = unit.UnitData != null ? unit.UnitData.health : 10,
                        attack = unit.UnitData != null ? unit.UnitData.attack : 2,
                        defense = unit.UnitData != null ? unit.UnitData.defence : 2,
                        movement = unit.UnitData != null ? unit.UnitData.movement : 1,
                        range = unit.UnitData != null ? unit.UnitData.range : 1,
                        isVeteran = unit.promotionLevel > 0,
                        canMove = unit.CanMove(),
                        canAttack = unit.CanAttack(),
                        kills = 0
                    },
                hasRoad = tile.HasRoad
            });
        }

        var players = new List<object>();
        foreach (var p in gameState.PlayerStates)
        {
            if (p == null) continue;

            var techs = new List<string>();
            if (p.availableTech != null)
            {
                foreach (var tech in p.availableTech)
                {
                    techs.Add(tech.ToString().ToLowerInvariant());
                }
            }

            players.Add(new
            {
                id = p.Id,
                tribe = p.tribe.ToString().ToLowerInvariant(),
                name = p.GetNameInternal(),
                stars = p.Currency,
                starsPerTurn = 0,
                techs,
                score = (int)p.score,
                cities = p.cities,
                units = unitsPerPlayer.TryGetValue(p.Id, out var count) ? count : 0,
                isAlive = p.killedTurn == 0,
                isHuman = !p.AutoPlay
            });
        }

        var state = new
        {
            turn = (int)gameState.CurrentTurn,
            maxTurns = 30,
            currentPlayerId = playerId,
            gameMode = gameState.Settings != null
                ? gameState.Settings.BaseGameMode.ToString().ToLowerInvariant()
                : "perfection",
            players,
            map = new
            {
                width = (int)map.Width,
                height = (int)map.Height,
                tiles
            }
        };

        return JsonSerializer.Serialize(state, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        });
    }
}
