#!/usr/bin/env bash
# build.sh — Build PolyAITrigger.dll and deploy to BepInEx/patchers/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_DIR="/Users/aimar/Library/Application Support/Steam/steamapps/common/The Battle of Polytopia"
PATCHERS_DIR="${GAME_DIR}/BepInEx/patchers"
OUTPUT_DLL="${SCRIPT_DIR}/bin/Release/net6.0/PolyAITrigger.dll"

echo "Building PolyAITrigger..."
# Use brew-installed dotnet if not in PATH
DOTNET=$(which dotnet 2>/dev/null || echo "/opt/homebrew/Cellar/dotnet@8/8.0.124/bin/dotnet")
$DOTNET build "${SCRIPT_DIR}/PolyAITrigger.csproj" -c Release --nologo 2>&1

mkdir -p "${PATCHERS_DIR}"
cp "${OUTPUT_DLL}" "${PATCHERS_DIR}/PolyAITrigger.dll"
echo ""
echo "✅ Deployed: ${PATCHERS_DIR}/PolyAITrigger.dll"
echo "Now run: ./start-polytopia.sh"
echo "Then check: BepInEx/LogOutput.log for '[PolyAITrigger] Execute() complete'"
