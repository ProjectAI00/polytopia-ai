using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using Polytopia.Data;
using PolytopiaBackendBase.Game;

namespace PolyAI;

/// <summary>
/// Reads AutoStart config from AIConfig.json and programmatically creates a new single-player
/// game on launch — no UI interaction required. Waits for GameManager to finish initializing,
/// then calls CreateSinglePlayerGame() with the configured tribes, map size, and game mode.
/// </summary>
public sealed class AutoGameLauncher
{
    private Thread _thread;
    private volatile bool _running;

    public void Start()
    {
        _running = true;
        _thread = new Thread(Run) { IsBackground = true, Name = "PolyAI.AutoLauncher" };
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
            Plugin.Logger.LogInfo("[AutoLauncher] Thread attached to IL2CPP runtime.");
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogError($"[AutoLauncher] IL2CPP attach failed: {ex.Message}");
            return;
        }

        var config = LoadConfig();
        if (config == null)
        {
            Plugin.Logger.LogInfo("[AutoLauncher] AutoStart=false or config missing — skipping.");
            return;
        }

        Plugin.Logger.LogInfo("[AutoLauncher] AutoStart=true — waiting for GameManager...");

        for (int attempt = 0; attempt < 90 && _running; attempt++)
        {
            Thread.Sleep(1000);
            try
            {
                var gm = GameManager.Instance;
                if (gm == null) { LogEvery(attempt, "GameManager.Instance is null"); continue; }

                var gs = GameManager.GameState;
                if (gs != null)
                {
                    Plugin.Logger.LogInfo("[AutoLauncher] A game is already in progress — skipping auto-start.");
                    return;
                }

                // Extra stability wait after GameManager appears
                Plugin.Logger.LogInfo("[AutoLauncher] GameManager ready. Waiting 4s for full initialization...");
                Thread.Sleep(4000);

                LaunchGame(config);
                return;
            }
            catch (Exception ex) { LogEvery(attempt, $"waiting: {ex.Message}"); }
        }

        Plugin.Logger.LogWarning("[AutoLauncher] Timed out waiting for GameManager. Start the game manually.");
    }

    private void LaunchGame(AutoStartConfig cfg)
    {
        try
        {
            Plugin.Logger.LogInfo($"[AutoLauncher] Building settings: {cfg.Players.Count} players | MapSize={cfg.MapSize} | Mode={cfg.GameMode} | Difficulty={cfg.Difficulty}");

            var settings = new GameSettings();
            settings.GameType = GameType.SinglePlayer;
            settings.BaseGameMode = ParseGameMode(cfg.GameMode);
            settings.MapSize = cfg.MapSize;
            settings.Difficulty = ParseDifficulty(cfg.Difficulty);
            settings.GameName = "PolyAI";

            TribeType startingTribe = TribeType.None;

            foreach (var p in cfg.Players)
            {
                var tribe = ParseTribe(p.Tribe);
                var pd = new PlayerData();
                pd.tribe = tribe;
                pd.knownTribe = true;

                if (string.Equals(p.Type, "Bot", StringComparison.OrdinalIgnoreCase))
                {
                    pd.type = PlayerDataType.Bot;
                    pd.botDifficulty = ParseDifficulty(cfg.Difficulty);
                }
                else
                {
                    // LocalUser — game waits for this player's actions, AIPoller intercepts them
                    pd.type = PlayerDataType.LocalUser;
                    if (startingTribe == TribeType.None)
                        startingTribe = tribe;
                }

                settings.AddPlayer(pd);
                Plugin.Logger.LogInfo($"[AutoLauncher]   + {p.Type}: {tribe}");
            }

            if (startingTribe == TribeType.None)
                startingTribe = TribeType.Xinxi;

            GameManager.StartingTribe = startingTribe;
            GameManager.PreliminaryGameSettings = settings;

            Plugin.Logger.LogInfo("[AutoLauncher] Calling GameManager.Instance.CreateSinglePlayerGame()...");
            GameManager.Instance.CreateSinglePlayerGame();
            Plugin.Logger.LogInfo("[AutoLauncher] Game creation triggered — AIPoller will take over.");
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogError($"[AutoLauncher] Failed to launch game: {ex}");
        }
    }

    private static AutoStartConfig LoadConfig()
    {
        try
        {
            if (!File.Exists(Poller.ConfigPath)) return null;
            var raw = JsonSerializer.Deserialize<AIConfig>(
                File.ReadAllText(Poller.ConfigPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );
            if (raw == null || !raw.AutoStart) return null;
            return raw.AutoStartConfig ?? new AutoStartConfig();
        }
        catch (Exception ex)
        {
            Plugin.Logger.LogError($"[AutoLauncher] Config read error: {ex.Message}");
            return null;
        }
    }

    private static void LogEvery(int attempt, string msg)
    {
        if (attempt % 10 == 0)
            Plugin.Logger.LogInfo($"[AutoLauncher] {msg} (attempt {attempt})");
    }

    private static GameMode ParseGameMode(string s) => s?.ToLowerInvariant() switch
    {
        "domination" => GameMode.Domination,
        "glory"      => GameMode.Glory,
        "might"      => GameMode.Might,
        "sandbox"    => GameMode.Sandbox,
        _            => GameMode.Perfection,
    };

    private static BotDifficulty ParseDifficulty(string s) => s?.ToLowerInvariant() switch
    {
        "easy"   => BotDifficulty.Easy,
        "hard"   => BotDifficulty.Hard,
        "crazy"  => BotDifficulty.Crazy,
        "frozen" => BotDifficulty.Frozen,
        _        => BotDifficulty.Normal,
    };

    private static TribeType ParseTribe(string s) => s?.ToLowerInvariant() switch
    {
        "xinxi"     => TribeType.Xinxi,
        "imperius"  => TribeType.Imperius,
        "bardur"    => TribeType.Bardur,
        "oumaji"    => TribeType.Oumaji,
        "kickoo"    => TribeType.Kickoo,
        "hoodrick"  => TribeType.Hoodrick,
        "luxidoor"  => TribeType.Luxidoor,
        "vengir"    => TribeType.Vengir,
        "zebasi"    => TribeType.Zebasi,
        "aquarion"  => TribeType.Aquarion,
        "elyrion"   => TribeType.Elyrion,
        "polaris"   => TribeType.Polaris,
        "cymanti"   => TribeType.Cymanti,
        "quetzali"  => TribeType.Quetzali,
        "yadakk"    => TribeType.Yadakk,
        _           => TribeType.Xinxi,
    };
}
