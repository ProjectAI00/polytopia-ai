using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace PolyMod.AI;

/// <summary>
/// HTTP client that communicates with the TypeScript AI backend.
/// </summary>
public class AgentBridge
{
    private readonly HttpClient _client;
    private readonly string _baseUrl;
    
    public AgentBridge(string baseUrl = "http://localhost:3001")
    {
        _baseUrl = baseUrl;
        _client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(60) // LLM calls can be slow
        };
    }

    /// <summary>
    /// Send game state to the AI backend and receive turn actions.
    /// </summary>
    public async Task<TurnResponse?> GetTurnActions(string gameStateJson, int playerId)
    {
        try
        {
            var request = new TurnRequest
            {
                GameState = JsonSerializer.Deserialize<JsonElement>(gameStateJson),
                PlayerId = playerId
            };

            var json = JsonSerializer.Serialize(request, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var content = new StringContent(json, Encoding.UTF8, "application/json");
            
            Plugin.logger.LogInfo($"[AI] Sending turn request to {_baseUrl}/api/turn");
            
            var response = await _client.PostAsync($"{_baseUrl}/api/turn", content);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                Plugin.logger.LogError($"[AI] Backend returned error: {response.StatusCode} - {responseBody}");
                return null;
            }

            var result = JsonSerializer.Deserialize<TurnResponse>(responseBody, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (result == null || !result.Success)
            {
                Plugin.logger.LogError($"[AI] Backend returned failure: {result?.Error ?? "Unknown error"}");
                return null;
            }

            var actionCount = result.Actions?.Length ?? (result.Action != null ? 1 : 0);
            Plugin.logger.LogInfo($"[AI] Received turn response with {actionCount} action(s) - {result.Reasoning}");
            
            return result;
        }
        catch (HttpRequestException ex)
        {
            Plugin.logger.LogError($"[AI] HTTP error: {ex.Message}. Is the backend running?");
            return null;
        }
        catch (TaskCanceledException)
        {
            Plugin.logger.LogError("[AI] Request timed out. LLM might be taking too long.");
            return null;
        }
        catch (Exception ex)
        {
            Plugin.logger.LogError($"[AI] Unexpected error: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Check if the backend is reachable.
    /// </summary>
    public async Task<bool> HealthCheck()
    {
        try
        {
            var response = await _client.GetAsync($"{_baseUrl}/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}

#region Request/Response DTOs

public class TurnRequest
{
    public JsonElement GameState { get; set; }
    public int PlayerId { get; set; }
}

public class TurnResponse
{
    public bool Success { get; set; }
    public ActionResponse? Action { get; set; }
    public ActionResponse[]? Actions { get; set; }
    public string? Reasoning { get; set; }
    public string? Error { get; set; }
}

public class ActionResponse
{
    public string Type { get; set; } = "";
    
    // Move/Attack coordinates
    public int? UnitX { get; set; }
    public int? UnitY { get; set; }
    public int? ToX { get; set; }
    public int? ToY { get; set; }
    public int? TargetX { get; set; }
    public int? TargetY { get; set; }
    
    // Train action
    public int? CityX { get; set; }
    public int? CityY { get; set; }
    public string? UnitType { get; set; }
    
    // Research action
    public string? Tech { get; set; }
    
    // Build action
    public int? TileX { get; set; }
    public int? TileY { get; set; }
    public string? Improvement { get; set; }
}

#endregion



