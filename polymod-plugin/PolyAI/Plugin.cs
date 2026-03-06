using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;

namespace PolyAI;

[BepInPlugin("com.polytopia-ai.polyai", "PolyAI", "0.1.0")]
public sealed class Plugin : BasePlugin
{
    internal static ManualLogSource Logger = null;
    private static Poller _poller;
    private static AutoGameLauncher _launcher;

    public override void Load()
    {
        Logger = Log;
        Logger.LogInfo("[PolyAI] Load() — starting poller and auto-launcher...");
        try
        {
            _launcher = new AutoGameLauncher();
            _launcher.Start();

            _poller = new Poller();
            _poller.Start();

            Logger.LogInfo("[PolyAI] Load() returned — poller and auto-launcher running.");
        }
        catch (Exception ex)
        {
            Logger.LogError($"[PolyAI] Failed to start: {ex}");
        }
    }

    public override bool Unload()
    {
        _launcher?.Stop();
        _poller?.Stop();
        return true;
    }
}
