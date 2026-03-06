using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace PolyAI;

public sealed class Poller
{
    internal const string ConfigPath = "/Users/aimar/Library/Application Support/Steam/steamapps/common/The Battle of Polytopia/AIConfig.json";

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(60) };
    private System.Threading.Thread _thread;
    private volatile bool _running;
    private AIConfig _config = new();
    private DateTime _lastHeartbeat = DateTime.MinValue;
    private int _lastTurn = -1;
    private int _lastPlayer = -1;
    private string _lastDiag = "";
    private HashSet<int> _managedBots = new();
    private readonly Queue<ActionDto> _pendingActions = new();
    private int _pendingTurn = -1;
    private int _pendingPlayer = -1;
    private DateTime _nextActionAt = DateTime.MinValue;

    public void Start()
    {
        if (_running) return;
        LoadConfig();
        _running = true;
        _thread = new System.Threading.Thread(Run) { IsBackground = true, Name = "PolyAI.Poller" };
        _thread.Start();
    }

    public void Stop()
    {
        _running = false;
        _thread?.Join(2000);
    }

    private void Run()
    {
        try
        {
            var domain = Il2CppInterop.Runtime.IL2CPP.il2cpp_domain_get();
            Il2CppInterop.Runtime.IL2CPP.il2cpp_thread_attach(domain);
            Plugin.Logger.LogInfo("[PolyAI] Poller thread attached to IL2CPP runtime.");
        }
        catch (Exception ex) { Plugin.Logger.LogError($"[PolyAI] IL2CPP attach failed: {ex.Message}"); }

        while (_running)
        {
            try { Tick(); }
            catch (Exception ex) { Plugin.Logger.LogError($"[PolyAI] Tick error: {ex.Message}"); }
            try { System.Threading.Thread.Sleep(1000); } catch { }
        }
    }

    private void LogDiag(string msg)
    {
        if (_lastDiag == msg) return;
        _lastDiag = msg;
        Plugin.Logger.LogInfo($"[PolyAI] {msg}");
    }

    private void Tick()
    {
        if ((DateTime.UtcNow - _lastHeartbeat).TotalSeconds >= 10)
        {
            _lastHeartbeat = DateTime.UtcNow;
            Plugin.Logger.LogInfo("[PolyAI] poll tick");
        }

        if (!_config.Enabled) return;

        GameManager gm;
        try { gm = GameManager.Instance; } catch { LogDiag("GameManager access error"); return; }
        if (gm == null) { LogDiag("Waiting for game to start..."); return; }

        GameState gs;
        try
        {
            var client = gm.client;
            if (client == null) { LogDiag("GameManager found, client null"); return; }
            gs = client.currentGameState;
        }
        catch (Exception ex) { LogDiag($"GameState error: {ex.Message}"); return; }
        if (gs == null) { LogDiag("GameManager found, no game state yet"); return; }

        int turn = (int)gs.CurrentTurn;
        int player = (int)gs.CurrentPlayer;

        // Every tick: re-check bot slots (handles new games where AutoPlay resets to true)
        EnsureBotsManaged(gs);


        if (!_managedBots.Contains(player))
        {
            LogDiag($"Human turn — Player {player} Turn {turn} (waiting for you to play...)");
            return;
        }

        // Drop stale queued actions if turn/player changed
        if (_pendingActions.Count > 0 && (_pendingTurn != turn || _pendingPlayer != player))
        {
            _pendingActions.Clear();
            _pendingTurn = -1;
            _pendingPlayer = -1;
        }

        // Execute queued actions one at a time to avoid command lockups (especially move -> end_turn)
        if (_pendingActions.Count > 0 && _pendingTurn == turn && _pendingPlayer == player)
        {
            ExecuteOnePendingAction(gs, gm, turn, player);
            return;
        }

        if (_lastTurn == turn && _lastPlayer == player) return;

        Plugin.Logger.LogInfo($"[PolyAI] Bot turn: Player {player} Turn {turn}");

        try
        {
            string stateJson;
            try { stateJson = StateExtractor.ExtractGameState(gs, player); }
            catch (Exception ex)
            {
                Plugin.Logger.LogWarning($"[PolyAI] StateExtractor failed ({ex.Message}), skipping tick");
                return;
            }
            var actions = FetchActions(stateJson, player);
            Plugin.Logger.LogInfo($"[PolyAI] Got {actions.Count} actions: {string.Join(", ", actions.Select(a => a.Type))}");

            // In early setup states backend may only return end_turn; avoid crashing before first real move state
            if (turn == 0
                && actions.Count > 0
                && actions.All(a => string.Equals((a.Type ?? string.Empty).Trim(), "end_turn", StringComparison.OrdinalIgnoreCase)))
            {
                LogDiag("Turn 0 bootstrap: end_turn only, waiting for first playable state...");
                return;
            }

            _pendingActions.Clear();
            foreach (var a in actions)
            {
                if (a == null) continue;
                a.Type = (a.Type ?? string.Empty).Trim().ToLowerInvariant();
                _pendingActions.Enqueue(a);
            }

            if (_pendingActions.Count == 0)
            {
                _lastTurn = turn;
                _lastPlayer = player;
                return;
            }

            _pendingTurn = turn;
            _pendingPlayer = player;
            ExecuteOnePendingAction(gs, gm, turn, player);
        }
        catch (Exception ex) { Plugin.Logger.LogError($"[PolyAI] Turn error: {ex.Message}"); }
    }

    private void ExecuteOnePendingAction(GameState gs, GameManager gm, int turn, int player)
    {
        if (_pendingActions.Count == 0) return;
        if (DateTime.UtcNow < _nextActionAt) return;

        var action = _pendingActions.Dequeue();
        var ok = ActionExecutor.Execute(action, gs, gm, (byte)player);
        if (!ok)
        {
            Plugin.Logger.LogWarning($"[PolyAI] Action failed: {action.Type}. Clearing pending turn actions.");
            _pendingActions.Clear();
        }

        // Give end_turn extra time to avoid lockups right after a move animation.
        var delayMs = _config.ActionDelayMs;
        if (string.Equals(action.Type, "end_turn", StringComparison.OrdinalIgnoreCase))
            delayMs = Math.Max(delayMs, 2500);
        _nextActionAt = DateTime.UtcNow.AddMilliseconds(delayMs);

        if (_pendingActions.Count == 0)
        {
            _lastTurn = turn;
            _lastPlayer = player;
            _pendingTurn = -1;
            _pendingPlayer = -1;
        }
    }

    private void EnsureBotsManaged(GameState gs)
    {
        try
        {
            var psList = gs.PlayerStates;
            if (psList == null) return;
            foreach (var ps in psList)
            {
                if (ps == null) continue;
                int id = (int)ps.Id;
                if (!_config.AIPlayerSlots.Contains(id)) continue;

                if (ps.AutoPlay)
                {
                    // Game bot slot — disable AutoPlay so we control it
                    try { ps.AutoPlay = false; } catch { continue; }
                    if (_managedBots.Add(id))
                        Plugin.Logger.LogInfo($"[PolyAI] Took over slot {id} (bot → GPT)");
                }
                else if (_config.FullAI && _managedBots.Add(id))
                {
                    // FullAI mode: also control human/local player slots
                    Plugin.Logger.LogInfo($"[PolyAI] FullAI: controlling slot {id} (human slot → GPT)");
                }
            }
        }
        catch { }
    }

    private void ApplyActions(List<ActionDto> actions, GameManager gm, byte playerId)
    {
        foreach (var a in actions)
        {
            if (a.Type == "end_turn")
            {
                Plugin.Logger.LogInfo($"[PolyAI] Executing EndTurnCommand for player {playerId}");
                try
                {
                    var cmd = new EndTurnCommand(playerId);
                    string error = null;
                    var am = gm.client?.ActionManager;
                    am?.ExecuteCommand(cmd, out error);
                    if (!string.IsNullOrEmpty(error))
                        Plugin.Logger.LogWarning($"[PolyAI] EndTurn error: {error}");
                    else
                        Plugin.Logger.LogInfo("[PolyAI] EndTurn executed OK");
                }
                catch (Exception ex) { Plugin.Logger.LogError($"[PolyAI] EndTurn failed: {ex.Message}"); }
            }
            System.Threading.Thread.Sleep(_config.ActionDelayMs);
        }
    }

    private string BuildMinimalState(GameState gs, int playerId, int turn)
    {
        int stars = 5;
        string tribe = "imperius";
        try
        {
            var psList = gs.PlayerStates;
            if (psList != null)
                foreach (var ps in psList)
                    if (ps != null && (int)ps.Id == playerId) { stars = ps.Currency; tribe = ps.tribe.ToString().ToLower(); break; }
        }
        catch { }

        return JsonSerializer.Serialize(new
        {
            turn,
            currentPlayer = playerId,
            mapWidth = 11, mapHeight = 11,
            map = new { tiles = Array.Empty<object>() },
            players = new[] { new { id = playerId, name = $"AI{playerId}", tribe, stars, isHuman = false } },
            units = Array.Empty<object>(),
            cities = Array.Empty<object>(),
        }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    }

    private List<ActionDto> FetchActions(string stateJson, int playerId)
    {
        var url = $"{_config.BackendUrl.TrimEnd('/')}/api/turn";
        var body = $"{{\"gameState\":{stateJson},\"playerId\":{playerId}}}";
        using var content = new StringContent(body, Encoding.UTF8, "application/json");
        var resp = _http.PostAsync(url, content).GetAwaiter().GetResult();
        var text = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
        if (!resp.IsSuccessStatusCode)
        {
            Plugin.Logger.LogWarning($"[PolyAI] Backend {(int)resp.StatusCode}: {text}");
            return new List<ActionDto> { new ActionDto { Type = "end_turn" } }; // fallback
        }
        var parsed = JsonSerializer.Deserialize<BackendResponse>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        if (parsed == null || !parsed.Success) return new List<ActionDto> { new ActionDto { Type = "end_turn" } };
        if (parsed.Actions?.Length > 0) return parsed.Actions.ToList();
        if (parsed.Action != null) return new List<ActionDto> { parsed.Action };
        return new List<ActionDto> { new ActionDto { Type = "end_turn" } };
    }

    private void LoadConfig()
    {
        try
        {
            if (!File.Exists(ConfigPath)) { _config = new AIConfig(); return; }
            _config = JsonSerializer.Deserialize<AIConfig>(File.ReadAllText(ConfigPath)) ?? new AIConfig();
            Plugin.Logger.LogInfo($"[PolyAI] Config: Backend={_config.BackendUrl} Slots=[{string.Join(",", _config.AIPlayerSlots)}]");
        }
        catch (Exception ex) { Plugin.Logger.LogError($"[PolyAI] Config error: {ex.Message}"); _config = new AIConfig(); }
    }
}

public class AIConfig
{
    public bool Enabled { get; set; } = true;
    public bool FullAI { get; set; } = false; // true = ALL slots in AIPlayerSlots controlled by backend
    public List<int> AIPlayerSlots { get; set; } = new() { 1, 2, 3, 4, 5, 6, 7 };
    public string BackendUrl { get; set; } = "http://localhost:3001";
    public int ActionDelayMs { get; set; } = 200;

    // AutoStart: create and start a game automatically on launch without touching the UI.
    // Players with Type=LocalUser are controlled by the backend AI via AIPoller.
    // Players with Type=Bot use the game's built-in AI.
    // For pure backend AI vs AI, set both players to Type=LocalUser and include both indices in AIPlayerSlots.
    public bool AutoStart { get; set; } = false;
    public AutoStartConfig AutoStartConfig { get; set; } = new();
}

public class AutoStartConfig
{
    // 11=small(2p), 14=medium(4p), 16=large(6p)
    public int MapSize { get; set; } = 11;
    // Domination, Perfection, Glory, Might, Sandbox
    public string GameMode { get; set; } = "Domination";
    // Easy, Normal, Hard, Crazy
    public string Difficulty { get; set; } = "Normal";
    public List<PlayerConfig> Players { get; set; } = new()
    {
        new PlayerConfig { Tribe = "Xinxi", Type = "LocalUser" },
        new PlayerConfig { Tribe = "Bardur", Type = "Bot" },
    };
}

public class PlayerConfig
{
    // Tribes: Xinxi, Imperius, Bardur, Oumaji, Kickoo, Hoodrick, Luxidoor, Vengir,
    //         Zebasi, Aquarion, Elyrion, Polaris, Cymanti, Quetzali, Yadakk
    public string Tribe { get; set; } = "Xinxi";
    // LocalUser = backend AI via AIPoller; Bot = game's built-in AI
    public string Type { get; set; } = "LocalUser";
}

public class BackendResponse
{
    public bool Success { get; set; }
    public ActionDto Action { get; set; }
    public ActionDto[] Actions { get; set; }
}

public class ActionDto
{
    public string Type { get; set; } = "";
    public int? UnitX { get; set; }
    public int? UnitY { get; set; }
    public int? ToX { get; set; }
    public int? ToY { get; set; }
    public int? TargetX { get; set; }
    public int? TargetY { get; set; }
    public int? CityX { get; set; }
    public int? CityY { get; set; }
    public int? TileX { get; set; }
    public int? TileY { get; set; }
    public string Tech { get; set; }
    public string UnitType { get; set; }
    public string Improvement { get; set; }
}
