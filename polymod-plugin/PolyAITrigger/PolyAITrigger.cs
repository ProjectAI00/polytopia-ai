using System;
using System.Threading;
using BepInEx.Preloader.Core.Patching;
using BepInEx.Unity.IL2CPP;

namespace PolyAITrigger;

/// <summary>
/// BepInEx 6 Preloader Patcher — forces plugin loading on Unity 6 / macOS.
///
/// Unity 6 AOT-compiles Internal_ActiveSceneChanged, so BepInEx's il2cpp_runtime_invoke
/// hook never fires and IL2CPPChainloader.Execute() (which loads plugins) is never called.
/// This patcher forces Execute() from a background thread 8s after game start.
/// </summary>
[PatcherPluginInfo("com.polytopia-ai.polyaitrigger", "PolyAITrigger", "1.0.0")]
public class PolyAITrigger : BasePatcher
{
    public override void Initialize()
    {
        Log.LogInfo("[PolyAITrigger] Loaded. Will call Execute() in 8s...");
        new Thread(TriggerThread) { IsBackground = true, Name = "PolyAITrigger" }.Start();
    }

    private void TriggerThread()
    {
        Thread.Sleep(8000);

        IL2CPPChainloader? loader = null;
        for (int i = 0; i < 6; i++)
        {
            loader = IL2CPPChainloader.Instance;
            if (loader != null) break;
            Log.LogWarning($"[PolyAITrigger] Instance null attempt {i + 1}/6, retrying...");
            Thread.Sleep(2000);
        }

        if (loader == null)
        {
            Log.LogError("[PolyAITrigger] IL2CPPChainloader.Instance still null after 20s.");
            return;
        }

        try
        {
            Log.LogInfo("[PolyAITrigger] Calling Execute() now...");
            loader.Execute();
            Log.LogInfo("[PolyAITrigger] Execute() complete. PolyMod should be active.");
        }
        catch (Exception ex)
        {
            Log.LogError($"[PolyAITrigger] Execute() failed: {ex}");
        }
    }
}
