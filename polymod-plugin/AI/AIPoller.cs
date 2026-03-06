using UnityEngine;

namespace PolyMod.AI;

// NOTE: GameManager API access may need adjustment based on the actual IL2CPP interop generated
// assembly. Verify GameManager.GameState, gs.CurrentTurn, and the CurrentPlayer accessor against
// BepInEx/interop/GameLogicAssembly.dll or PolytopiaBackendBase.dll using a .NET decompiler.
public class AIPoller : MonoBehaviour
{
    private float _pollInterval = 1f;
    private float _timer = 0f;

    private void Update()
    {
        _timer += Time.deltaTime;
        if (_timer < _pollInterval) return;

        _timer = 0f;

        try
        {
            // Access the game state via the backend client singleton.
            // GameManager.Client exposes ActionManager and potentially GameState.
            // Adjust the GameState accessor if the API differs in the actual interop assembly.
            var gs = GameManager.GameState;
            if (gs == null) return;

            // CurrentTurn and current player ID from the game state.
            var currentTurn = (int)gs.CurrentTurn;
            var currentPlayer = gs.CurrentPlayer; // may be PlayerState or int — cast as needed

            if (!AIManager.IsAIControlled((int)currentPlayer)) return;

            // Guard: only fire once per (player, turn) combination.
            if (currentPlayer == AIManager._lastSeenPlayer && currentTurn == AIManager._lastSeenTurn) return;
            AIManager._lastSeenPlayer = currentPlayer;
            AIManager._lastSeenTurn   = currentTurn;

            Plugin.logger.LogInfo($"[AI] Detected AI player's turn (Player {currentPlayer}, Turn {currentTurn})");
            StartCoroutine(AIManager.ProcessAITurn(currentPlayer, currentTurn));
        }
        catch (Exception ex)
        {
            Plugin.logger.LogError($"[AI] Poller error: {ex.Message}");
        }
    }
}
