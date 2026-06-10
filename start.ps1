# Cross-platform launcher (PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python start.py @args
exit $LASTEXITCODE
