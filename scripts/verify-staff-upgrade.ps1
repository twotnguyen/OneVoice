# SPDX-License-Identifier: Apache-2.0
# Local-only migration preservation check. No connection URL argument is accepted.
$ErrorActionPreference = 'Stop'
$ovWorkspace = Split-Path -Parent $PSScriptRoot
$ovSql = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'sql/staff-upgrade.test.sql') -Raw
$ovMigration = Get-Content -LiteralPath (Join-Path $ovWorkspace 'supabase/migrations/20260912090000_staff_profiles.sql') -Raw
$ovSql = $ovSql.Replace('-- ONEVOICE_STAFF_MIGRATION', $ovMigration)
$ovResult = $ovSql | docker exec -i supabase_db_onevoice psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1
$ovExitCode = $LASTEXITCODE
$ovResult | Write-Output
if ($ovExitCode -ne 0 -or ($ovResult -join "`n") -match 'not ok|Looks like you failed') {
  throw 'Local staff migration preservation test failed.'
}
