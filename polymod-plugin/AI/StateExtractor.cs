using System;
using System.Collections.Generic;
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
        var tileIndex = BuildTileIndex(map);
        var legalActions = EnumerateLegalActions(gameState, playerIdByte);

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

            var unitLegalActions = GetActionsForUnit(legalActions, tile.coordinates.X, tile.coordinates.Y);

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
                city = BuildCityPayload(tile),
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
                        promotionLevel = (int)unit.promotionLevel,
                        xp = (int)unit.xp,
                        canMove = unit.CanMove(),
                        canAttack = unit.CanAttack(),
                        moved = unit.moved,
                        attacked = unit.attacked,
                        effects = ToLowerStrings(unit.effects),
                        kills = 0,
                        validMoves = BuildValidMoves(unitLegalActions, tileIndex),
                        attackTargets = BuildAttackTargets(unitLegalActions, tileIndex)
                    },
                hasRoad = tile.HasRoad,
                hasRoute = tile.hasRoute,
                capitalOf = tile.capitalOf != byte.MaxValue ? (int?)tile.capitalOf : null,
                rulingCity = BuildRulingCityPayload(gameState, tile),
                effects = ToLowerStrings(tile.effects)
            });
        }

        var players = new List<object>();
        var gameLogic = gameState.GameLogicData;
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

            var unlockableTechs = new List<string>();
            var unlockedUnits = new List<string>();
            var unlockableImprovements = new List<string>();

            try
            {
                if (gameLogic != null)
                {
                    foreach (var tech in gameLogic.GetUnlockableTech(p, gameState))
                    {
                        unlockableTechs.Add(tech.type.ToString().ToLowerInvariant());
                    }

                    foreach (var unitData in gameLogic.GetUnlockedUnits(p, gameState, true))
                    {
                        unlockedUnits.Add(unitData.type.ToString().ToLowerInvariant());
                    }

                    foreach (var improvementData in gameLogic.GetUnlockableImprovements(p, gameState))
                    {
                        unlockableImprovements.Add(improvementData.type.ToString().ToLowerInvariant());
                    }
                }
            }
            catch (Exception ex)
            {
                Plugin.logger.LogDebug($"[AI] Unlockable extraction unavailable: {ex.Message}");
            }

            players.Add(new
            {
                id = p.Id,
                tribe = p.tribe.ToString().ToLowerInvariant(),
                name = p.GetNameInternal(),
                stars = p.Currency,
                starsPerTurn = SafeGetIncome(gameState, p.Id),
                techs,
                unlockableTechs,
                unlockedUnits,
                unlockableImprovements,
                score = (int)p.score,
                kills = (int)p.kills,
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
            legalActions,
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

    private static Dictionary<long, TileData> BuildTileIndex(MapData map)
    {
        var tileIndex = new Dictionary<long, TileData>(map.Tiles.Length);
        foreach (var tile in map.Tiles)
        {
            if (tile != null)
            {
                tileIndex[CoordKey(tile.coordinates.X, tile.coordinates.Y)] = tile;
            }
        }

        return tileIndex;
    }

    private static long CoordKey(int x, int y)
    {
        return ((long)x << 32) ^ (uint)y;
    }

    private static object? BuildCityPayload(TileData tile)
    {
        if (tile.improvement == null)
        {
            return null;
        }

        if (tile.improvement.type != ImprovementData.Type.City &&
            tile.improvement.type != ImprovementData.Type.Outpost)
        {
            return null;
        }

        var effects = ToLowerStrings(tile.improvement.effects);
        var hasWalls = false;
        foreach (var effect in effects)
        {
            if (effect.Contains("wall", StringComparison.OrdinalIgnoreCase))
            {
                hasWalls = true;
                break;
            }
        }

        return new
        {
            name = tile.improvement.name ?? "City",
            level = (int)tile.improvement.level,
            population = (int)tile.improvement.population,
            populationCap = (int?)null,
            isCapital = tile.capitalOf != byte.MaxValue,
            capitalOf = tile.capitalOf != byte.MaxValue ? (int?)tile.capitalOf : null,
            hasWalls,
            connectedToCapital = tile.improvement.connectedToCapitalOfPlayer != byte.MaxValue,
            connectedToCapitalOfPlayer = tile.improvement.connectedToCapitalOfPlayer != byte.MaxValue
                ? (int?)tile.improvement.connectedToCapitalOfPlayer
                : null,
            production = (int)tile.improvement.production,
            rewards = ToLowerStrings(tile.improvement.rewards),
            effects
        };
    }

    private static object? BuildRulingCityPayload(GameState gameState, TileData tile)
    {
        try
        {
            if (!CommandValidation.HasCity(gameState, tile.rulingCityCoordinates))
            {
                return null;
            }

            return new
            {
                x = tile.rulingCityCoordinates.X,
                y = tile.rulingCityCoordinates.Y
            };
        }
        catch
        {
            return null;
        }
    }

    private static List<ActionResponse> EnumerateLegalActions(GameState gameState, byte playerId)
    {
        var actions = new List<ActionResponse>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        PlayerState? player = null;

        foreach (var state in gameState.PlayerStates)
        {
            if (state != null && state.Id == playerId)
            {
                player = state;
                break;
            }
        }

        if (player == null)
        {
            return actions;
        }

        foreach (var tile in gameState.Map.Tiles)
        {
            if (tile == null)
            {
                continue;
            }

            foreach (var command in SafeGetUnitActions(gameState, player, tile))
            {
                AddAction(actions, seen, MapCommandToAction(command));
            }

            foreach (var command in SafeGetTrainCommands(gameState, player, tile))
            {
                AddAction(actions, seen, MapCommandToAction(command));
            }

            foreach (var command in SafeGetBuildCommands(gameState, player, tile))
            {
                AddAction(actions, seen, MapCommandToAction(command));
            }
        }

        try
        {
            var gameLogic = gameState.GameLogicData;
            if (gameLogic != null)
            {
                foreach (var tech in gameLogic.GetUnlockableTech(player, gameState))
                {
                    AddAction(actions, seen, new ActionResponse
                    {
                        Type = "research",
                        Tech = tech.type.ToString().ToLowerInvariant()
                    });
                }
            }
        }
        catch
        {
            // Research unlock helpers may not be available on every build.
        }

        AddAction(actions, seen, new ActionResponse { Type = "end_turn" });
        return actions;
    }

    private static IEnumerable<CommandBase> SafeGetUnitActions(GameState gameState, PlayerState player, TileData tile)
    {
        try
        {
            return CommandUtils.GetUnitActions(gameState, player, tile, false);
        }
        catch
        {
            return Array.Empty<CommandBase>();
        }
    }

    private static IEnumerable<TrainCommand> SafeGetTrainCommands(GameState gameState, PlayerState player, TileData tile)
    {
        try
        {
            return CommandUtils.GetTrainableUnits(gameState, player, tile, false);
        }
        catch
        {
            return Array.Empty<TrainCommand>();
        }
    }

    private static IEnumerable<CommandBase> SafeGetBuildCommands(GameState gameState, PlayerState player, TileData tile)
    {
        try
        {
            return CommandUtils.GetBuildableImprovements(gameState, player, tile, false);
        }
        catch
        {
            return Array.Empty<CommandBase>();
        }
    }

    private static ActionResponse? MapCommandToAction(CommandBase command)
    {
        switch (command)
        {
            case MoveCommand move:
                return new ActionResponse
                {
                    Type = "move",
                    UnitX = move.From.X,
                    UnitY = move.From.Y,
                    ToX = move.To.X,
                    ToY = move.To.Y
                };
            case AttackCommand attack:
                return new ActionResponse
                {
                    Type = "attack",
                    UnitX = attack.Origin.X,
                    UnitY = attack.Origin.Y,
                    TargetX = attack.Target.X,
                    TargetY = attack.Target.Y
                };
            case TrainCommand train:
                return new ActionResponse
                {
                    Type = "train",
                    CityX = train.Coordinates.X,
                    CityY = train.Coordinates.Y,
                    UnitType = train.Type.ToString().ToLowerInvariant()
                };
            case BuildCommand build:
                return new ActionResponse
                {
                    Type = "build",
                    TileX = build.Coordinates.X,
                    TileY = build.Coordinates.Y,
                    Improvement = build.Type.ToString().ToLowerInvariant()
                };
            case ResearchCommand research:
                return new ActionResponse
                {
                    Type = "research",
                    Tech = research.Type.ToString().ToLowerInvariant()
                };
            case CaptureCommand capture:
                return new ActionResponse
                {
                    Type = "capture",
                    UnitX = capture.Coordinates.X,
                    UnitY = capture.Coordinates.Y
                };
            default:
                return null;
        }
    }

    private static void AddAction(List<ActionResponse> actions, HashSet<string> seen, ActionResponse? action)
    {
        if (action == null)
        {
            return;
        }

        var key = BuildActionKey(action);
        if (seen.Add(key))
        {
            actions.Add(action);
        }
    }

    private static string BuildActionKey(ActionResponse action)
    {
        return string.Join("|",
            action.Type ?? "",
            action.UnitX?.ToString() ?? "",
            action.UnitY?.ToString() ?? "",
            action.ToX?.ToString() ?? "",
            action.ToY?.ToString() ?? "",
            action.TargetX?.ToString() ?? "",
            action.TargetY?.ToString() ?? "",
            action.CityX?.ToString() ?? "",
            action.CityY?.ToString() ?? "",
            action.TileX?.ToString() ?? "",
            action.TileY?.ToString() ?? "",
            action.UnitType ?? "",
            action.Tech ?? "",
            action.Improvement ?? "");
    }

    private static List<ActionResponse> GetActionsForUnit(List<ActionResponse> legalActions, int unitX, int unitY)
    {
        var actions = new List<ActionResponse>();
        foreach (var action in legalActions)
        {
            if (action.UnitX == unitX && action.UnitY == unitY)
            {
                actions.Add(action);
            }
        }

        return actions;
    }

    private static List<object> BuildValidMoves(List<ActionResponse> legalActions, Dictionary<long, TileData> tileIndex)
    {
        var moves = new List<object>();
        foreach (var action in legalActions)
        {
            if (action.Type != "move" || !action.ToX.HasValue || !action.ToY.HasValue)
            {
                continue;
            }

            tileIndex.TryGetValue(CoordKey(action.ToX.Value, action.ToY.Value), out var targetTile);
            moves.Add(new
            {
                x = action.ToX.Value,
                y = action.ToY.Value,
                terrain = targetTile != null
                    ? targetTile.terrain.ToString().ToLowerInvariant()
                    : "unknown"
            });
        }

        return moves;
    }

    private static List<object> BuildAttackTargets(List<ActionResponse> legalActions, Dictionary<long, TileData> tileIndex)
    {
        var targets = new List<object>();
        foreach (var action in legalActions)
        {
            if (action.Type != "attack" || !action.TargetX.HasValue || !action.TargetY.HasValue)
            {
                continue;
            }

            tileIndex.TryGetValue(CoordKey(action.TargetX.Value, action.TargetY.Value), out var targetTile);
            targets.Add(new
            {
                x = action.TargetX.Value,
                y = action.TargetY.Value,
                unitType = targetTile?.unit != null
                    ? targetTile.unit.type.ToString().ToLowerInvariant()
                    : "unknown",
                health = targetTile?.unit != null ? (int)targetTile.unit.health : 0
            });
        }

        return targets;
    }

    private static List<string> ToLowerStrings<T>(IEnumerable<T>? values)
    {
        var result = new List<string>();
        if (values == null)
        {
            return result;
        }

        foreach (var value in values)
        {
            if (value == null)
            {
                continue;
            }

            result.Add(value.ToString()!.ToLowerInvariant());
        }

        return result;
    }

    private static int SafeGetIncome(GameState gameState, byte playerId)
    {
        try
        {
            return ResourceDataUtils.CalculateIncomeFor(gameState, playerId);
        }
        catch
        {
            return 0;
        }
    }
}
