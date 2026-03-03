using Polytopia.Data;
using PolytopiaBackendBase.Game;

namespace PolyAI;

internal static class ActionExecutor
{
    public static bool Execute(ActionDto action, GameState gs, GameManager gm, byte playerId)
    {
        try
        {
            return action.Type.ToLower() switch
            {
                "move"     => ExecuteMove(action, gs, gm, playerId),
                "attack"   => ExecuteAttack(action, gs, gm, playerId),
                "research" => ExecuteResearch(action, gm, playerId),
                "train"    => ExecuteTrain(action, gm, playerId),
                "build"    => ExecuteBuild(action, gm, playerId),
                "capture"  => ExecuteCapture(action, gs, gm, playerId),
                "end_turn" => RunCommand(new EndTurnCommand(playerId), gm, "EndTurn"),
                _          => false
            };
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogError($"[PolyAI] Action {action.Type} error: {ex.Message}");
            return false;
        }
    }

    private static bool ExecuteMove(ActionDto a, GameState gs, GameManager gm, byte pid)
    {
        if (!a.UnitX.HasValue || !a.UnitY.HasValue || !a.ToX.HasValue || !a.ToY.HasValue) return false;
        var unit = FindUnit(gs, a.UnitX.Value, a.UnitY.Value);
        if (unit == null) { Plugin.Logger.LogWarning($"[PolyAI] No unit at ({a.UnitX},{a.UnitY})"); return false; }
        Plugin.Logger.LogInfo($"[PolyAI] >> MOVE {unit.type} ({a.UnitX},{a.UnitY}) → ({a.ToX},{a.ToY})");
        return RunCommand(new MoveCommand(pid, unit, new WorldCoordinates(a.ToX.Value, a.ToY.Value)), gm, "Move");
    }

    private static bool ExecuteAttack(ActionDto a, GameState gs, GameManager gm, byte pid)
    {
        if (!a.UnitX.HasValue || !a.UnitY.HasValue || !a.TargetX.HasValue || !a.TargetY.HasValue) return false;
        var unit = FindUnit(gs, a.UnitX.Value, a.UnitY.Value);
        if (unit == null) { Plugin.Logger.LogWarning($"[PolyAI] No unit at ({a.UnitX},{a.UnitY})"); return false; }
        Plugin.Logger.LogInfo($"[PolyAI] >> ATTACK with {unit.type} ({a.UnitX},{a.UnitY}) → target ({a.TargetX},{a.TargetY})");
        return RunCommand(new AttackCommand(pid, unit, new WorldCoordinates(a.TargetX.Value, a.TargetY.Value)), gm, "Attack");
    }

    private static bool ExecuteResearch(ActionDto a, GameManager gm, byte pid)
    {
        if (string.IsNullOrEmpty(a.Tech)) return false;
        if (!Enum.TryParse<TechData.Type>(a.Tech, true, out var tech))
        { Plugin.Logger.LogWarning($"[PolyAI] Unknown tech: {a.Tech}"); return false; }
        Plugin.Logger.LogInfo($"[PolyAI] >> RESEARCH {a.Tech}");
        return RunCommand(new ResearchCommand(pid, tech), gm, "Research");
    }

    private static bool ExecuteTrain(ActionDto a, GameManager gm, byte pid)
    {
        if (!a.CityX.HasValue || !a.CityY.HasValue || string.IsNullOrEmpty(a.UnitType)) return false;
        if (!Enum.TryParse<UnitData.Type>(a.UnitType, true, out var unitType))
        { Plugin.Logger.LogWarning($"[PolyAI] Unknown unit type: {a.UnitType}"); return false; }
        Plugin.Logger.LogInfo($"[PolyAI] >> TRAIN {a.UnitType} at ({a.CityX},{a.CityY})");
        return RunCommand(new TrainCommand(pid, unitType, new WorldCoordinates(a.CityX.Value, a.CityY.Value)), gm, "Train");
    }

    private static bool ExecuteBuild(ActionDto a, GameManager gm, byte pid)
    {
        if (!a.TileX.HasValue || !a.TileY.HasValue || string.IsNullOrEmpty(a.Improvement)) return false;
        if (!Enum.TryParse<ImprovementData.Type>(a.Improvement, true, out var impType))
        { Plugin.Logger.LogWarning($"[PolyAI] Unknown improvement: {a.Improvement}"); return false; }
        Plugin.Logger.LogInfo($"[PolyAI] >> BUILD {a.Improvement} at ({a.TileX},{a.TileY})");
        return RunCommand(new BuildCommand(pid, impType, new WorldCoordinates(a.TileX.Value, a.TileY.Value)), gm, "Build");
    }

    private static bool ExecuteCapture(ActionDto a, GameState gs, GameManager gm, byte pid)
    {
        if (!a.UnitX.HasValue || !a.UnitY.HasValue) return false;
        var unit = FindUnit(gs, a.UnitX.Value, a.UnitY.Value);
        if (unit == null) return false;
        return RunCommand(new CaptureCommand(pid, unit.id, new WorldCoordinates(a.UnitX.Value, a.UnitY.Value)), gm, "Capture");
    }

    private static bool RunCommand(CommandBase cmd, GameManager gm, string name)
    {
        string error = null;
        var am = gm.client?.ActionManager;
        if (am == null) { Plugin.Logger.LogWarning("[PolyAI] ActionManager null"); return false; }
        am.ExecuteCommand(cmd, out error);
        if (!string.IsNullOrEmpty(error))
        { Plugin.Logger.LogWarning($"[PolyAI] {name} error: {error}"); return false; }
        Plugin.Logger.LogInfo($"[PolyAI] {name} OK");
        return true;
    }

    private static UnitState FindUnit(GameState gs, int x, int y)
    {
        try
        {
            var tiles = gs?.Map?.Tiles;
            if (tiles == null) return null;
            foreach (var tile in tiles)
                if (tile != null && tile.coordinates.X == x && tile.coordinates.Y == y)
                    return tile.unit;
        }
        catch { }
        return null;
    }
}
