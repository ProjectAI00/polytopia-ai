using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using PolyMod.AI;

namespace PolyMod;

[BepInPlugin("com.polytopia-ai.polymod", "PolyMod", "1.0.0")]
public class Plugin : BasePlugin
{
    public static readonly string BASE_PATH = Paths.ConfigPath;
    public static ManualLogSource logger = null!;

    public override void Load()
    {
        logger = Log;
        AIManager.Init();
    }
}
