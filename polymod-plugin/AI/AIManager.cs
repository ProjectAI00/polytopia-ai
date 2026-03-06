using PolytopiaBackendBase.Game;
using System.Collections;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace PolyMod.AI;

/// <summary>
/// Manages the AI player integration.
/// Coordinates polling, backend communication, and turn execution.
/// </summary>
public static class AIManager
{
    private const float TurnSettleDelaySeconds = 0.5f;
    private const int MaxActionsPerTurn = 50;
    private static AgentBridge? _bridge;
    internal static AIConfig _config = new();
    private static bool _initialized = false;
    private static int _aiTurnInProgress = 0;
    internal static int _lastSeenTurn = -1;
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
        if (!_config.Enabled) return false;
        // Use AIPlayerSlots list if populated, otherwise fall back to single AIPlayerSlot
        if (_config.AIPlayerSlots.Count > 0)
            return _config.AIPlayerSlots.Contains(playerId);
        return playerId == _config.AIPlayerSlot;
    }

    internal static IEnumerator ProcessAITurn(byte playerId, int expectedTurn)
    {
        var bridge = _bridge;
        if (bridge == null) yield break;
        if (Interlocked.CompareExchange(ref _aiTurnInProgress, 1, 0) != 0) yield break;

        try
        {
            yield return new WaitForSecondsRealtime(TurnSettleDelaySeconds);

            if (!TryGetCurrentTurnState(playerId, expectedTurn, out _, out var stateJson))
            {
                yield break;
            }

            Plugin.logger.LogInfo($"[AI] === AI Turn {expectedTurn} ===");

            if (_config.DebugLogging)
            {
                Plugin.logger.LogInfo($"[AI] Game state extracted ({stateJson.Length} bytes)");
            }

            var turnTask = Task.Run(() => bridge.GetTurnActions(stateJson, playerId));
            while (!turnTask.IsCompleted)
            {
                yield return null;
            }

            if (turnTask.IsCanceled)
            {
                Plugin.logger.LogWarning("[AI] Backend request was canceled");
                yield break;
            }

            if (turnTask.IsFaulted)
            {
                var backendException = turnTask.Exception?.GetBaseException();
                Plugin.logger.LogError($"[AI] Error during backend turn request: {backendException?.Message ?? "Unknown error"}");
                yield break;
            }

            var turnResponse = turnTask.Result;
            var actions = GetActions(turnResponse);

            if (actions.Length == 0)
            {
                Plugin.logger.LogWarning("[AI] Backend returned no actions, ending turn");
                _ = TryExecuteOnCurrentState(new ActionResponse { Type = "end_turn" }, playerId, expectedTurn);
                yield break;
            }

            for (var actionIndex = 0; actionIndex < actions.Length; actionIndex++)
            {
                var actionCount = actionIndex + 1;
                if (actionCount > MaxActionsPerTurn)
                {
                    Plugin.logger.LogWarning("[AI] Hit max actions limit, forcing end turn");
                    _ = TryExecuteOnCurrentState(new ActionResponse { Type = "end_turn" }, playerId, expectedTurn);
                    yield break;
                }

                var action = actions[actionIndex];
                var isEndTurn = string.Equals(action.Type, "end_turn", StringComparison.OrdinalIgnoreCase);
                var success = TryExecuteOnCurrentState(action, playerId, expectedTurn);
                if (!success.HasValue)
                {
                    yield break;
                }

                if (!success.Value)
                {
                    Plugin.logger.LogWarning($"[AI] Action {action.Type} failed, continuing...");
                }

                if (isEndTurn)
                {
                    Plugin.logger.LogInfo($"[AI] Turn complete after {actionCount} actions");
                    yield break;
                }

                if (_config.ActionDelayMs > 0)
                {
                    yield return new WaitForSecondsRealtime(_config.ActionDelayMs / 1000f);
                }
            }

            Plugin.logger.LogWarning("[AI] No end_turn action received, forcing end turn");
            _ = TryExecuteOnCurrentState(new ActionResponse { Type = "end_turn" }, playerId, expectedTurn);
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

    private static ActionResponse[] GetActions(TurnResponse? turnResponse)
    {
        if (turnResponse?.Actions is { Length: > 0 })
        {
            return turnResponse.Actions;
        }

        if (turnResponse?.Action != null)
        {
            return new[] { turnResponse.Action };
        }

        return Array.Empty<ActionResponse>();
    }

    private static bool TryGetCurrentTurnState(byte playerId, int expectedTurn, out GameState gameState, out string stateJson)
    {
        gameState = null!;
        stateJson = string.Empty;

        if (!TryGetCurrentGameState(playerId, expectedTurn, out gameState))
        {
            return false;
        }

        stateJson = StateExtractor.ExtractGameState(gameState, playerId);
        return true;
    }

    private static bool? TryExecuteOnCurrentState(ActionResponse action, byte playerId, int expectedTurn)
    {
        if (!TryGetCurrentGameState(playerId, expectedTurn, out var gameState))
        {
            return null;
        }

        return ActionExecutor.Execute(action, gameState, playerId);
    }

    private static bool TryGetCurrentGameState(byte playerId, int expectedTurn, out GameState gameState)
    {
        gameState = GameManager.GameState;
        if (gameState == null)
        {
            Plugin.logger.LogWarning("[AI] Game state unavailable, aborting AI turn");
            return false;
        }

        var currentTurn = (int)gameState.CurrentTurn;
        var currentPlayer = (byte)gameState.CurrentPlayer;
        if (currentTurn != expectedTurn || currentPlayer != playerId || !IsAIControlled(currentPlayer))
        {
            Plugin.logger.LogWarning($"[AI] Turn changed before AI work could finish (expected Player {playerId}, Turn {expectedTurn}; got Player {currentPlayer}, Turn {currentTurn})");
            return false;
        }

        return true;
    }

}

/// <summary>
/// Configuration for the AI agent.
/// </summary>
public class AIConfig
{
    public bool Enabled { get; set; } = true;
    public int AIPlayerSlot { get; set; } = 1;           // Single slot (legacy)
    public List<int> AIPlayerSlots { get; set; } = new(); // All slots GPT controls (empty = use AIPlayerSlot)
    public string BackendUrl { get; set; } = "http://localhost:3001";
    public bool DebugLogging { get; set; } = true;
    public int ActionDelayMs { get; set; } = 200; // Delay between actions
}
