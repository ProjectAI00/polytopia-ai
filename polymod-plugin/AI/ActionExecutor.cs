using Polytopia.Data;
using PolytopiaBackendBase.Common;
using PolytopiaBackendBase.Game;

namespace PolyMod.AI;

/// <summary>
/// Executes AI actions in the game using command API.
/// </summary>
public static class ActionExecutor
{
    /// <summary>
    /// Execute an action received from the AI backend.
    /// </summary>
    public static bool Execute(ActionResponse action, GameState gameState, int playerId)
    {
        if (action == null)
        {
            Plugin.logger.LogError("[AI] Cannot execute null action");
            return false;
        }

        if (string.IsNullOrWhiteSpace(action.Type))
        {
            Plugin.logger.LogError("[AI] Action type is missing");
            return false;
        }

        var playerIdByte = (byte)playerId;
        Plugin.logger.LogInfo($"[AI] Executing action: {action.Type}");

        try
        {
            return action.Type.ToLowerInvariant() switch
            {
                "move" => ExecuteMove(action, gameState, playerIdByte),
                "attack" => ExecuteAttack(action, gameState, playerIdByte),
                "train" => ExecuteTrain(action, gameState, playerIdByte),
                "research" => ExecuteResearch(action, gameState, playerIdByte),
                "build" => ExecuteBuild(action, gameState, playerIdByte),
                "capture" => ExecuteCapture(action, gameState, playerIdByte),
                "heal" => HandleHealAction(),
                "end_turn" => ExecuteEndTurn(gameState, playerIdByte),
                _ => HandleUnknownAction(action.Type)
            };
        }
        catch (Exception ex)
        {
            Plugin.logger.LogError($"[AI] Error executing action {action.Type}: {ex.Message}");
            return false;
        }
    }

    private static bool ExecuteMove(ActionResponse action, GameState gameState, byte playerId)
    {
        if (!action.UnitX.HasValue || !action.UnitY.HasValue || !action.ToX.HasValue || !action.ToY.HasValue)
        {
            Plugin.logger.LogError("[AI] Move action missing coordinates");
            return false;
        }

        var from = new WorldCoordinates(action.UnitX.Value, action.UnitY.Value);
        var to = new WorldCoordinates(action.ToX.Value, action.ToY.Value);
        var unit = FindUnitAtCoordinates(gameState, from);
        if (unit == null)
        {
            Plugin.logger.LogError($"[AI] Move source tile has no unit at ({from.X}, {from.Y})");
            return false;
        }

        return ExecuteCommand(new MoveCommand(playerId, unit, to), gameState, "Move");
    }

    private static bool ExecuteAttack(ActionResponse action, GameState gameState, byte playerId)
    {
        if (!action.UnitX.HasValue || !action.UnitY.HasValue || !action.TargetX.HasValue || !action.TargetY.HasValue)
        {
            Plugin.logger.LogError("[AI] Attack action missing coordinates");
            return false;
        }

        var origin = new WorldCoordinates(action.UnitX.Value, action.UnitY.Value);
        var target = new WorldCoordinates(action.TargetX.Value, action.TargetY.Value);
        var unit = FindUnitAtCoordinates(gameState, origin);
        if (unit == null)
        {
            Plugin.logger.LogError($"[AI] Attack source tile has no unit at ({origin.X}, {origin.Y})");
            return false;
        }

        return ExecuteCommand(new AttackCommand(playerId, unit, target), gameState, "Attack");
    }

    private static bool ExecuteTrain(ActionResponse action, GameState gameState, byte playerId)
    {
        if (!action.CityX.HasValue || !action.CityY.HasValue || string.IsNullOrEmpty(action.UnitType))
        {
            Plugin.logger.LogError("[AI] Train action missing city coordinates or unit type");
            return false;
        }

        if (!Enum.TryParse<UnitData.Type>(action.UnitType, true, out var unitType) &&
            !EnumCache<UnitData.Type>.TryGetType(action.UnitType, out unitType))
        {
            Plugin.logger.LogError($"[AI] Unknown unit type: {action.UnitType}");
            return false;
        }

        var coordinates = new WorldCoordinates(action.CityX.Value, action.CityY.Value);
        return ExecuteCommand(new TrainCommand(playerId, unitType, coordinates), gameState, "Train");
    }

    private static bool ExecuteResearch(ActionResponse action, GameState gameState, byte playerId)
    {
        if (string.IsNullOrEmpty(action.Tech))
        {
            Plugin.logger.LogError("[AI] Research action missing tech name");
            return false;
        }

        if (!Enum.TryParse<TechData.Type>(action.Tech, true, out var techType) &&
            !EnumCache<TechData.Type>.TryGetType(action.Tech, out techType))
        {
            Plugin.logger.LogError($"[AI] Unknown tech: {action.Tech}");
            return false;
        }

        return ExecuteCommand(new ResearchCommand(playerId, techType), gameState, "Research");
    }

    private static bool ExecuteBuild(ActionResponse action, GameState gameState, byte playerId)
    {
        if (!action.TileX.HasValue || !action.TileY.HasValue || string.IsNullOrEmpty(action.Improvement))
        {
            Plugin.logger.LogError("[AI] Build action missing coordinates or improvement type");
            return false;
        }

        if (!Enum.TryParse<ImprovementData.Type>(action.Improvement, true, out var improvementType) &&
            !EnumCache<ImprovementData.Type>.TryGetType(action.Improvement, out improvementType))
        {
            Plugin.logger.LogError($"[AI] Unknown improvement: {action.Improvement}");
            return false;
        }

        var coordinates = new WorldCoordinates(action.TileX.Value, action.TileY.Value);
        return ExecuteCommand(new BuildCommand(playerId, improvementType, coordinates), gameState, "Build");
    }

    private static bool ExecuteCapture(ActionResponse action, GameState gameState, byte playerId)
    {
        if (!action.UnitX.HasValue || !action.UnitY.HasValue)
        {
            Plugin.logger.LogError("[AI] Capture action missing coordinates");
            return false;
        }

        var coordinates = new WorldCoordinates(action.UnitX.Value, action.UnitY.Value);
        var unit = FindUnitAtCoordinates(gameState, coordinates);
        if (unit == null)
        {
            Plugin.logger.LogError($"[AI] Capture source tile has no unit at ({coordinates.X}, {coordinates.Y})");
            return false;
        }

        return ExecuteCommand(new CaptureCommand(playerId, unit.id, coordinates), gameState, "Capture");
    }

    private static bool ExecuteEndTurn(GameState gameState, byte playerId)
    {
        return ExecuteCommand(new EndTurnCommand(playerId), gameState, "EndTurn");
    }

    private static bool ExecuteCommand(CommandBase command, GameState gameState, string actionName)
    {
        if (!command.IsValid(gameState, out var validationError))
        {
            Plugin.logger.LogError($"[AI] {actionName} command invalid: {validationError}");
            return false;
        }

        var actionManager = GameManager.Client?.ActionManager;
        if (actionManager == null)
        {
            Plugin.logger.LogError("[AI] ActionManager is not available");
            return false;
        }

        var succeeded = actionManager.ExecuteCommand(command, out var error);
        if (!succeeded || !string.IsNullOrEmpty(error))
        {
            Plugin.logger.LogError($"[AI] {actionName} execution error: {error}");
            return false;
        }

        Plugin.logger.LogInfo($"[AI] {actionName} executed successfully");
        return true;
    }

    private static UnitState? FindUnitAtCoordinates(GameState gameState, WorldCoordinates coordinates)
    {
        var tiles = gameState?.Map?.Tiles;
        if (tiles == null)
        {
            return null;
        }

        foreach (var tile in tiles)
        {
            if (tile == null)
            {
                continue;
            }

            var tileCoordinates = tile.coordinates;
            if (tileCoordinates.X == coordinates.X && tileCoordinates.Y == coordinates.Y)
            {
                return tile.unit;
            }
        }

        return null;
    }

    private static bool HandleHealAction()
    {
        Plugin.logger.LogWarning("[AI] Heal action is not supported by the current command API; skipping");
        return false;
    }

    private static bool HandleUnknownAction(string actionType)
    {
        Plugin.logger.LogError($"[AI] Unknown action type: {actionType}");
        return false;
    }
}
