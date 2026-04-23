# Apollo Configuration Pull Script
# Automatically pull service configurations from Apollo Config Center

param(
    [Parameter(Mandatory=$true)]
    [string]$WorkspacePath,
    [string]$OutputDir = "apollo_config",
    [string[]]$AppIds = @(),
    [switch]$IncludePublic = $true
)

$PublicAppId = "public"
$PublicNamespaces = @("public_ec", "public_central", "public_job", "public_web")

$ApolloBaseUrl = "https://apollo-configservice.yamibuy.net"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-WorkspaceFolders {
    param([string]$WsPath)
    
    $folders = @()
    $wsFile = Get-ChildItem -Path $WsPath -Filter "*.code-workspace" -ErrorAction SilentlyContinue | Select-Object -First 1
    
    if ($wsFile) {
        Write-Host "Found workspace file: $($wsFile.Name)" -ForegroundColor Cyan
        $content = Get-Content $wsFile.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $ws = $content | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($ws -and $ws.folders) {
                foreach ($f in $ws.folders) {
                    $fp = $f.path
                    if (-not [System.IO.Path]::IsPathRooted($fp)) {
                        $fp = Join-Path $WsPath $fp
                    }
                    $fp = [System.IO.Path]::GetFullPath($fp)
                    if (Test-Path $fp) {
                        $folders += $fp
                        Write-Host "  Workspace folder: $fp" -ForegroundColor Gray
                    }
                }
            }
        }
    }
    
    if ($folders.Count -eq 0) {
        $folders += $WsPath
    }
    
    return $folders
}

function Find-AppIds {
    param([string]$Path)
    $appIds = @()
    $propFiles = Get-ChildItem -Path $Path -Recurse -Filter "application.properties" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*src\main\resources*" }
    foreach ($file in $propFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match "app\.id\s*=\s*(.+)") {
            $appId = $Matches[1].Trim()
            if ($appId -and $appIds -notcontains $appId) {
                $appIds += $appId
                Write-Host "Found app.id: $appId" -ForegroundColor Cyan
            }
        }
    }
    return $appIds
}

function ConvertTo-Properties {
    param($ConfigMap)
    $properties = @()
    if ($ConfigMap -is [PSCustomObject]) {
        $ConfigMap | Get-Member -MemberType NoteProperty | ForEach-Object {
            $key = $_.Name
            $value = $ConfigMap.$key
            if ($null -ne $value) {
                $value = [string]$value
                $value = $value -replace '\\', '\\'
                $value = $value -replace '\n', '\n'
                $value = $value -replace '\r', '\r'
            } else {
                $value = ""
            }
            $properties += "$key=$value"
        }
    } elseif ($ConfigMap -is [Hashtable]) {
        foreach ($key in $ConfigMap.Keys | Sort-Object) {
            $value = $ConfigMap[$key]
            if ($null -ne $value) {
                $value = [string]$value
                $value = $value -replace '\\', '\\'
                $value = $value -replace '\n', '\n'
                $value = $value -replace '\r', '\r'
            } else {
                $value = ""
            }
            $properties += "$key=$value"
        }
    }
    return $properties -join "`n"
}

function Get-ApolloConfig {
    param(
        [string]$AppId,
        [string]$Namespace = "application"
    )
    $url = "$ApolloBaseUrl/configfiles/json/$AppId/default/$Namespace"
    try {
        Write-Host "Fetching: $AppId/$Namespace" -ForegroundColor Yellow
        $response = Invoke-RestMethod -Uri $url -Method Get -ContentType "application/json" -TimeoutSec 10
        if ($response) {
            if ($response -is [PSCustomObject]) {
                $count = ($response | Get-Member -MemberType NoteProperty).Count
                Write-Host "  -> $count config items" -ForegroundColor Green
                return $response
            } elseif ($response.Count -gt 0) {
                Write-Host "  -> $($response.Count) config items" -ForegroundColor Green
                return $response
            }
        }
        Write-Host "  -> Empty" -ForegroundColor DarkYellow
        return $null
    }
    catch {
        Write-Host "  -> Failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Main
Write-Host "Apollo Configuration Sync" -ForegroundColor Cyan
Write-Host "Workspace: $WorkspacePath"
Write-Host "Apollo URL: $ApolloBaseUrl"

$appIdList = @()

if ($AppIds.Count -gt 0) {
    Write-Host "Using provided app.id list: $($AppIds -join ', ')" -ForegroundColor Yellow
    $appIdList = $AppIds
} else {
    Write-Host "Scanning workspace folders..." -ForegroundColor Yellow
    $workspaceFolders = Get-WorkspaceFolders -WsPath $WorkspacePath
    
    foreach ($folder in $workspaceFolders) {
        Write-Host "Scanning: $folder" -ForegroundColor Yellow
        $found = Find-AppIds -Path $folder
        $appIdList += $found
    }
}

if ($appIdList.Count -eq 0) {
    Write-Host "No app.id found" -ForegroundColor Red
    exit 1
}

$appIdList = $appIdList | Select-Object -Unique
Write-Host "Found $($appIdList.Count) app.id(s)" -ForegroundColor Green

if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $outputPath = $OutputDir
} else {
    $outputPath = Join-Path $WorkspacePath $OutputDir
}
if (!(Test-Path $outputPath)) {
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
}
Write-Host "Output: $outputPath" -ForegroundColor Cyan

$successCount = 0
$failCount = 0

# Pull public namespaces first
if ($IncludePublic) {
    Write-Host "`nPulling public namespaces..." -ForegroundColor Cyan
    foreach ($ns in $PublicNamespaces) {
        $config = Get-ApolloConfig -AppId $PublicAppId -Namespace $ns
        if ($config) {
            $properties = ConvertTo-Properties -ConfigMap $config
            $filePath = Join-Path $outputPath "$ns.properties"
            $properties | Out-File -FilePath $filePath -Encoding UTF8
            Write-Host "Saved: $ns.properties" -ForegroundColor Green
            $successCount++
        } else {
            $failCount++
        }
        Start-Sleep -Milliseconds 200
    }
}

# Pull app-specific configs
Write-Host "`nPulling app configs..." -ForegroundColor Cyan
foreach ($appId in $appIdList) {
    $config = Get-ApolloConfig -AppId $appId
    if ($config) {
        $properties = ConvertTo-Properties -ConfigMap $config
        $filePath = Join-Path $outputPath "$appId.properties"
        $properties | Out-File -FilePath $filePath -Encoding UTF8
        Write-Host "Saved: $appId.properties" -ForegroundColor Green
        $successCount++
    } else {
        $failCount++
    }
    Start-Sleep -Milliseconds 200
}

Write-Host ""
Write-Host "Completed! Success: $successCount, Failed: $failCount" -ForegroundColor Green
Write-Host "Config files:" -ForegroundColor Yellow
Get-ChildItem -Path $outputPath -Filter "*.properties" | ForEach-Object {
    $size = [math]::Round($_.Length / 1KB, 2)
    Write-Host "  $($_.Name) ($size KB)" -ForegroundColor White
}
