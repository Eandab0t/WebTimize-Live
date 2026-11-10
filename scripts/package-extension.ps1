[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('chrome', 'firefox')]
  [string]$Browser,

  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$source = Join-Path $root (Join-Path 'dist' $Browser)
$output = Join-Path $root (Join-Path 'dist' ("WebTimize-Live-v{0}-{1}.zip" -f $manifest.version, $Browser))

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "Missing $source. Run 'npm run build:$Browser' first."
}

if (Test-Path -LiteralPath (Join-Path $source 'CHROMEWEBSTORE.md')) {
  throw 'Store metadata must not be included in the extension package.'
}

if ((Test-Path -LiteralPath $output) -and -not $Force) {
  throw "Archive already exists: $output. Pass -Force to replace this generated archive."
}

if (Test-Path -LiteralPath $output) {
  Remove-Item -LiteralPath $output -Force
}

Compress-Archive -Path (Join-Path $source '*') -DestinationPath $output -CompressionLevel Optimal
Write-Output "Packaged $output"
