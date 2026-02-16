using System.Text.Json;
using Polytopia.Data;
using PolytopiaBackendBase.Game;

namespace PolyMod.AI;

/// <summary>
/// Extracts game state and serializes it to JSON for the AI backend.
/// Only includes visible information (respects fog of war).
/// </summary>
public static class StateExtractor
{
    /// <summary>
    /// Extract the full game state for a specific player (respecting fog of war).
    /// </summary>
    public static string ExtractGameState(GameState gameState, int playerId)
    {
        var state = new GameStateDto
        {
            Turn = (int)gameState.CurrentTurn,
            MaxTurns = 30, // Default perfection mode
            CurrentPlayerId = playerId,
            GameMode = gameState.Settings?.gameMode.ToString() ?? "perfection",
            Players = ExtractPlayers(gameState),
            Map = ExtractMap(gameState, playerId)
        };

        return JsonSerializer.Serialize(state, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        });
    }

    private static List<PlayerDto> ExtractPlayers(GameState gameState)
    {
        var players = new List<PlayerDto>();
        
        foreach (var playerState in gameState.PlayerStates)
        {
            if (playerState == null) continue;
            
            players.Add(new PlayerDto
            {
                Id = playerState.Id,
                Tribe = playerState.tribe.ToString().ToLower(),
                Name = playerState.Name ?? $"Player {playerState.Id}",
                Stars = playerState.Stars,
                StarsPerTurn = playerState.StarsPerTurn,
                Techs = ExtractTechs(playerState),
                Score = playerState.Score,
                Cities = playerState.CityCount,
                Units = playerState.UnitCount,
                IsAlive = !playerState.IsDead,
                IsHuman = !playerState.IsBot
            });
        }
        
        return players;
    }

    private static List<string> ExtractTechs(PlayerState playerState)
    {
        var techs = new List<string>();
        
        if (playerState.techs != null)
        {
            foreach (var tech in playerState.techs)
            {
                techs.Add(tech.ToString().ToLower());
            }
        }
        
        return techs;
    }

    private static MapDto ExtractMap(GameState gameState, int playerId)
    {
        var map = gameState.Map;
        var tiles = new List<TileDto>();
        
        // Get player's visibility data
        PlayerState? player = null;
        foreach (var p in gameState.PlayerStates)
        {
            if (p?.Id == playerId)
            {
                player = p;
                break;
            }
        }

        for (int i = 0; i < map.Tiles.Length; i++)
        {
            var tile = map.Tiles[i];
            var coords = map.GetCoordinates(i);
            
            // Check visibility for this player
            bool isVisible = player?.IsVisible(coords) ?? false;
            bool isExplored = player?.HasExplored(coords) ?? false;
            
            var tileDto = new TileDto
            {
                X = coords.x,
                Y = coords.y,
                Terrain = tile.terrain.ToString().ToLower(),
                Owner = tile.owner != byte.MaxValue ? tile.owner : null,
                Visible = isVisible,
                Explored = isExplored,
                Resource = tile.resource != ResourceData.Type.None ? tile.resource.ToString().ToLower() : null,
                Improvement = tile.improvement?.type.ToString().ToLower(),
                HasRoad = tile.HasRoad,
                City = null,
                Unit = null
            };

            // Only include detailed info if visible
            if (isVisible || isExplored)
            {
                // Extract city info
                if (tile.city != null)
                {
                    tileDto.City = new CityDto
                    {
                        Name = tile.city.name ?? "City",
                        Level = tile.city.level,
                        Population = tile.city.population,
                        PopulationCap = tile.city.populationCap,
                        IsCapital = tile.city.isCapital,
                        HasWalls = tile.city.hasWalls,
                        ConnectedToCapital = tile.city.connectedToCapital
                    };
                }

                // Extract unit info (only if currently visible)
                if (isVisible && tile.unit != null)
                {
                    var unitData = gameState.GameLogicData.GetUnitData(tile.unit.type);
                    
                    tileDto.Unit = new UnitDto
                    {
                        Id = tile.unit.id,
                        Type = tile.unit.type.ToString().ToLower(),
                        Owner = tile.unit.owner,
                        Health = tile.unit.health,
                        MaxHealth = unitData?.maxHealth ?? 10,
                        Attack = unitData?.attack ?? 2,
                        Defense = unitData?.defence ?? 2,
                        Movement = unitData?.movement ?? 1,
                        Range = unitData?.range ?? 1,
                        IsVeteran = tile.unit.veteranStatus > 0,
                        CanMove = tile.unit.movementLeft > 0,
                        CanAttack = !tile.unit.hasAttacked,
                        Kills = tile.unit.kills
                    };
                }
            }

            tiles.Add(tileDto);
        }

        return new MapDto
        {
            Width = map.Width,
            Height = map.Height,
            Tiles = tiles
        };
    }
}

#region DTOs

public class GameStateDto
{
    public int Turn { get; set; }
    public int MaxTurns { get; set; }
    public int CurrentPlayerId { get; set; }
    public string GameMode { get; set; } = "";
    public List<PlayerDto> Players { get; set; } = new();
    public MapDto Map { get; set; } = new();
}

public class PlayerDto
{
    public byte Id { get; set; }
    public string Tribe { get; set; } = "";
    public string Name { get; set; } = "";
    public int Stars { get; set; }
    public int StarsPerTurn { get; set; }
    public List<string> Techs { get; set; } = new();
    public int Score { get; set; }
    public int Cities { get; set; }
    public int Units { get; set; }
    public bool IsAlive { get; set; }
    public bool IsHuman { get; set; }
}

public class MapDto
{
    public int Width { get; set; }
    public int Height { get; set; }
    public List<TileDto> Tiles { get; set; } = new();
}

public class TileDto
{
    public int X { get; set; }
    public int Y { get; set; }
    public string Terrain { get; set; } = "";
    public byte? Owner { get; set; }
    public bool Visible { get; set; }
    public bool Explored { get; set; }
    public string? Resource { get; set; }
    public string? Improvement { get; set; }
    public CityDto? City { get; set; }
    public UnitDto? Unit { get; set; }
    public bool HasRoad { get; set; }
}

public class CityDto
{
    public string Name { get; set; } = "";
    public int Level { get; set; }
    public int Population { get; set; }
    public int PopulationCap { get; set; }
    public bool IsCapital { get; set; }
    public bool HasWalls { get; set; }
    public bool ConnectedToCapital { get; set; }
}

public class UnitDto
{
    public uint Id { get; set; }
    public string Type { get; set; } = "";
    public byte Owner { get; set; }
    public int Health { get; set; }
    public int MaxHealth { get; set; }
    public int Attack { get; set; }
    public int Defense { get; set; }
    public int Movement { get; set; }
    public int Range { get; set; }
    public bool IsVeteran { get; set; }
    public bool CanMove { get; set; }
    public bool CanAttack { get; set; }
    public int Kills { get; set; }
}

#endregion



