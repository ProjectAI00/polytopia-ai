using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;

namespace PolyAI;

[BepInPlugin("com.polytopia-ai.polyai", "PolyAI", "0.1.0")]
public sealed class Plugin : BasePlugin
{
    internal static ManualLogSource Logger = null;
    private static Poller _poller;

    public override void Load()
    {
        Logger = Log;
        Logger.LogInfo("[PolyAI] Load() starting background poller...");
        try
        {
            _poller = new Poller();
            _poller.Start();
            Logger.LogInfo("[PolyAI] Load() returned — poller running in background.");
        }
        catch (Exception ex)
        {
            Logger.LogError($"[PolyAI] Failed to start poller: {ex}");
        }
    }

    public override bool Unload()
    {
        _poller?.Stop();
        return true;
    }
}
