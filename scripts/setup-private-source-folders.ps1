# QCOD private source-document folder setup
# Reads all buildings from data/buildings.json and creates a standard
# private folder structure for each one.
#
# This script does not delete, move, or overwrite existing files.

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BuildingsFile = Join-Path $ProjectRoot "data\buildings.json"

$FacilityFolderName = "martinsburg-va-medical-center"
$PrivateRoot = Join-Path $ProjectRoot "private-source-documents"
$FacilityRoot = Join-Path $PrivateRoot $FacilityFolderName

if (-not (Test-Path $BuildingsFile)) {
    Write-Error "Buildings file not found: $BuildingsFile"
    exit 1
}

try {
    $Buildings = Get-Content $BuildingsFile -Raw | ConvertFrom-Json
}
catch {
    Write-Error "Could not read buildings.json: $($_.Exception.Message)"
    exit 1
}

function New-SafeDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        New-Item -Path $Path -ItemType Directory -Force | Out-Null
        Write-Host "Created: $Path"
    }
    else {
        Write-Host "Exists:  $Path"
    }
}

# Create facility-level folders
$FacilityFolders = @(
    "campus",
    "campus\maps",
    "campus\directory",
    "campus\reference",
    "campus-reports",
    "campus-reports\executive-summary",
    "campus-reports\progress",
    "campus-reports\building-progress",
    "campus-reports\qc",
    "campus-reports\research",
    "campus-reports\outstanding-work",
    "campus-reports\return-needed",
    "campus-reports\no-access",
    "campus-reports\asset-reports",
    "campus-reports\technician-productivity",
    "reference",
    "imports",
    "exports",
    "notes"
)

New-SafeDirectory -Path $PrivateRoot
New-SafeDirectory -Path $FacilityRoot

foreach ($Folder in $FacilityFolders) {
    New-SafeDirectory -Path (Join-Path $FacilityRoot $Folder)
}

# Standard folders created inside every building
$BuildingFolders = @(
    "architecture",
    "department-maps",
    "room-reference",
    "rooms",
    "extraction-output",
    "building-reports",
    "floor-reports",
    "section-reports",
    "room-reports",
    "asset-reports",
    "qc-reports",
    "research-reports",
    "outstanding-work-reports",
    "imports",
    "exports",
    "notes"
)

$CreatedBuildings = 0

foreach ($Building in $Buildings) {
    $BuildingId = [string]$Building.id

    if ([string]::IsNullOrWhiteSpace($BuildingId)) {
        Write-Warning "Skipped building with missing ID."
        continue
    }

    # Convert characters that are unsafe or awkward in folder names.
    $SafeBuildingId = $BuildingId.Trim() `
        -replace '[\\/:*?"<>|]', '-' `
        -replace '\s+', '-'

    $BuildingFolderName = "building-$($SafeBuildingId.ToLower())"
    $BuildingRoot = Join-Path $FacilityRoot $BuildingFolderName

    New-SafeDirectory -Path $BuildingRoot

    foreach ($Folder in $BuildingFolders) {
        New-SafeDirectory -Path (Join-Path $BuildingRoot $Folder)
    }

    # Add a simple local building information file if none exists.
    $InfoFile = Join-Path $BuildingRoot "building-info.txt"

    if (-not (Test-Path $InfoFile)) {
        $BuildingName = if ($Building.name) {
            [string]$Building.name
        }
        else {
            "Name pending"
        }

        $Status = if ($Building.status) {
            [string]$Building.status
        }
        else {
            "not_started"
        }

        @"
Building ID: $BuildingId
Building Name: $BuildingName
Facility: Martinsburg VA Medical Center
Status: $Status

Private QCOD source-document folder.
Do not commit operational documents or restricted floor plans to Git.
"@ | Set-Content -Path $InfoFile -Encoding UTF8

        Write-Host "Created: $InfoFile"
    }

    $CreatedBuildings++
}

Write-Host ""
Write-Host "QCOD folder setup complete." -ForegroundColor Green
Write-Host "Facility root: $FacilityRoot"
Write-Host "Buildings processed: $CreatedBuildings"
Write-Host ""
Write-Host "Existing files were not deleted or overwritten."