using PolytopiaBackendBase.Game;
using System.Text.Json;
using System.Threading;
using UnityEngine;

namespace PolyMod.AI;

/// <summary>
/// Manages the AI player integration.
/// Coordinates polling, backend communication, and turn execution.
/// </summary>
public static class AIManager
{
    private static AgentBridge? _bridge;
    internal static AIConfig _config = new();
    private static bool _initialized = false;
    private static int _aiTurnInProgress = 0;
    internal static byte _lastSeenTurn = byte.MaxValue;
    internal static byte _lastSeenPlayer = byte.MaxValue;

    /// <summary>
    /// Initialize the AI manager.
    /// </summary>
    public static void Init()
    {
        if (_initialized) return;

        LoadConfig();
        
        if (!_config.Enabled)
        {
            Plugin.logger.LogInfo("[AI] AI Agent is disabled in config");
            return;
        }

        _bridge = new AgentBridge(_config.BackendUrl);

        Plugin.logger.LogInfo($"[AI] AI Manager initialized. Backend: {_config.BackendUrl}");
        Plugin.logger.LogInfo($"[AI] AI controls player slot: {_config.AIPlayerSlot}");

        _initialized = true;

        var pollerObject = new GameObject("AIPoller");
        UnityEngine.Object.DontDestroyOnLoad(pollerObject);
        pollerObject.AddComponent<AIPoller>();

        // Check backend health on startup
        _ = CheckBackendHealth();
    }

    private static void LoadConfig()
    {
        try
        {
            var configPath = Path.Combine(Plugin.BASE_PATH, "AIConfig.json");
            
            if (File.Exists(configPath))
            {
                var json = File.ReadAllText(configPath);
                _config = JsonSerializer.Deserialize<AIConfig>(json) ?? new AIConfig();
            }
            else
            {
                // Create default config
                _config = new AIConfig();
                var json = JsonSerializer.Serialize(_config, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(configPath, json);
                Plugin.logger.LogInfo($"[AI] Created default config at {configPath}");
            }
        }
        catch (Exception ex)
        {
            Plugin.logger.LogError($"[AI] Error loading config: {ex.Message}");
            _config = new AIConfig();
        }
    }

    private static async Task CheckBackendHealth()
    {
        if (_bridge == null) return;

        var healthy = await _bridge.HealthCheck();
        if (healthy)
        {
            Plugin.logger.LogInfo("[AI] Backend is reachable");
        }
        else
        {
            Plugin.logger.LogWarning("[AI] Backend is not reachable. Make sure to start the TypeScript server.");
        }
    }

    /// <summary>
    /// Check if the given player should be controlled by AI.
    /// </summary>
    public static bool IsAIControlled(int playerId)
    {
        return _config.Enabled && playerId == _config.AIPlayerSlot;
    }

    /// <summary>
    /// Process an AI turn - called when it's the AI player's turn.
    /// </summary>
    public static async Task ProcessAITurn(GameState gameState, byte playerId)
    {
        if (_bridge == null) return;
        if (Interlocked.CompareExchange(ref _aiTurnInProgress, 1, 0) != 0) return;
        
        try
        {
            Plugin.logger.LogInfo($"[AI] === AI Turn {gameState.CurrentTurn} ===");

            // Extract current game state once and request all turn actions in one call
            var stateJson = StateExtractor.ExtractGameState(gameState, playerId);
            
            if (_config.DebugLogging)
            {
                Plugin.logger.LogInfo($"[AI] Game state extracted ({stateJson.Length} bytes)");
            }

            var turnResponse = await _bridge.GetTurnActions(stateJson, playerId);
            if (turnResponse == null)
            {
                Plugin.logger.LogWarning("[AI] No turn response received from backend, ending turn");
                ActionExecutor.Execute(new ActionResponse { Type = "end_turn" }, gameState, playerId);
                return;
            }

            var actions = turnResponse.Actions;
            if ((actions == null || actions.Length == 0) && turnResponse.Action != null)
            {
                actions = new[] { turnResponse.Action };
            }

            if (actions == null || actions.Length == 0)
            {
                Plugin.logger.LogWarning("[AI] Backend returned no actions, ending turn");
                ActionExecutor.Execute(new ActionResponse { Type = "end_turn" }, gameState, playerId);
                return;
            }

            int actionCount = 0;
            const int maxActions = 50;

            foreach (var action in actions)
            {
                actionCount++;
                if (actionCount > maxActions)
                {
                    Plugin.logger.LogWarning("[AI] Hit max actions limit, forcing end turn");
                    ActionExecutor.Execute(new ActionResponse { Type = "end_turn" }, gameState, playerId);
                    return;
                }

                if (action.Type.Equals("end_turn", StringComparison.OrdinalIgnoreCase))
                {
                    Plugin.logger.LogInfo($"[AI] Turn complete after {actionCount} actions");
                    ActionExecutor.Execute(action, gameState, playerId);
                    return;
                }

                var success = ActionExecutor.Execute(action, gameState, playerId);
                if (!success)
                {
                    Plugin.logger.LogWarning($"[AI] Action {action.Type} failed, continuing...");
                }

                await Task.Delay(_config.ActionDelayMs);
            }

            Plugin.logger.LogWarning("[AI] No end_turn action received, forcing end turn");
            ActionExecutor.Execute(new ActionResponse { Type = "end_turn" }, gameState, playerId);
        }
        catch (Exception ex)
        {
            Plugin.logger.LogError($"[AI] Error during AI turn: {ex.Message}");
        }
        finally
        {
            Interlocked.Exchange(ref _aiTurnInProgress, 0);
        }
    }

}

/// <summary>
/// Configuration for the AI agent.
/// </summary>
public class AIConfig
{
    public bool Enabled { get; set; } = true;
    public int AIPlayerSlot { get; set; } = 1; // Which player slot the AI controls
    public string BackendUrl { get; set; } = "http://localhost:3001";
    public bool DebugLogging { get; set; } = true;
    public int ActionDelayMs { get; set; } = 200; // Delay between actions
}
