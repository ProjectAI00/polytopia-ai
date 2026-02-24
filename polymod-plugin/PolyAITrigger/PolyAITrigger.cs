using System;
using System.Collections.Generic;
using System.Threading;
using BepInEx.Logging;
using BepInEx.Preloader.Core.Patching;
using BepInEx.Unity.IL2CPP;
using Mono.Cecil;

namespace PolyAITrigger;

/// <summary>
/// BepInEx Preloader Patcher that bypasses the IL2CPPChainloader's broken
/// Internal_ActiveSceneChanged trigger on Unity 6 / macOS 26.
///
/// Root cause: Unity 6 AOT-compiles Internal_ActiveSceneChanged, so it never
/// passes through il2cpp_runtime_invoke, and IL2CPPChainloader.Execute() (which
/// loads plugins) is never called.
///
/// Fix: after a short delay to let Unity start up, force-call Execute() directly.
/// </summary>
[PatcherPluginInfo("com.polytopia-ai.polyaitrigger", "PolyAITrigger", "1.0.0")]
public static class PolyAITrigger
{
    private static readonly ManualLogSource Log = Logger.CreateLogSource("PolyAITrigger");

    // Must return empty — we don't patch any assemblies, we just add a trigger
    public static IEnumerable<string> TargetDLLs
    {
        get { return Array.Empty<string>(); }
    }

    /// <summary>
    /// Called during BepInEx preloader phase, after IL2CPPChainloader.Initialize().
    /// Starts a background thread that calls Execute() once Unity is running.
    /// </summary>
    public static void Initialize()
    {
        Log.LogInfo("[PolyAITrigger] Scheduling delayed IL2CPPChainloader.Execute() in 6s...");

        var thread = new Thread(() =>
        {
            Thread.Sleep(6000); // Give Unity time to fully start

            try
            {
                var loader = IL2CPPChainloader.Instance;
                if (loader == null)
                {
                    Log.LogWarning("[PolyAITrigger] IL2CPPChainloader.Instance is null — skipping.");
                    return;
                }

                Log.LogInfo("[PolyAITrigger] Calling Execute() to force plugin loading...");
                loader.Execute();
                Log.LogInfo("[PolyAITrigger] Execute() complete — plugins should now be loaded.");
            }
            catch (Exception ex)
            {
                // If Execute() was already called (scene hook worked), this will throw — that's OK
                Log.LogInfo($"[PolyAITrigger] Execute() skipped (may already have run): {ex.Message}");
            }
        })
        {
            IsBackground = true,
            Name = "PolyAITrigger"
        };

        thread.Start();
    }

    // Required by BepInEx patcher API — no assembly patching needed
    public static void Patch(AssemblyDefinition assembly) { }
}
