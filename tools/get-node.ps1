# Downloads the current LTS release of Node.js into .\runtime\node (this folder only).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
  # Windows PowerShell 5.1 returns the whole JSON array as one object, so walk it explicitly.
  $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -UseBasicParsing
  $v = $null
  foreach ($r in $releases) {
    if ($r.lts -and ($r.files -contains 'win-x64-zip')) { $v = [string]$r.version; break }
  }
  if ($v -notmatch '^v\d+\.\d+\.\d+$') { throw "couldn't work out the latest Node.js version (got '$v')" }

  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $name = "node-$v-win-$arch"
  $url = "https://nodejs.org/dist/$v/$name.zip"
  Write-Host " Downloading Node.js $v ($arch)..."
  $zip = Join-Path $env:TEMP "$name.zip"
  Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
  Write-Host ' Unpacking...'
  if (Test-Path 'runtime') { Remove-Item 'runtime' -Recurse -Force }
  Expand-Archive $zip -DestinationPath 'runtime' -Force
  Rename-Item (Join-Path 'runtime' $name) 'node'
  Remove-Item $zip
  if (-not (Test-Path 'runtime\node\npm.cmd')) { throw 'the download unpacked, but npm is missing' }
} catch {
  Write-Host " Couldn't download Node.js: $($_.Exception.Message)"
  if ($url) { Write-Host " Address tried: $url" }
  exit 1
}
