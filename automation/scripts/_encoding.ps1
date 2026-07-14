# Shared UTF-8 helpers for automation scripts (Windows PowerShell 5+).
# Dot-source: . "$PSScriptRoot\_encoding.ps1"

function Read-Utf8File {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }
    return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Content
    )
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Stop-DevServerPorts {
    param([int[]]$Ports = @(3000, 3001))
    foreach ($port in $Ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            $owningPid = $c.OwningProcess
            if ($owningPid -and $owningPid -ne $PID) {
                Write-Host "  Stopping PID $owningPid (port $port)"
                Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Assert-NoBareGetContentOnSource {
    <#
    Guardrail: agents must not pipe Get-Content (default ANSI) into source files.
    Call from review docs only — documents the rule for copy-paste scripts.
    #>
    Write-Verbose "Use Read-Utf8File or Node/Read tool for .ts/.tsx/.md — never Get-Content without -Encoding UTF8"
}
