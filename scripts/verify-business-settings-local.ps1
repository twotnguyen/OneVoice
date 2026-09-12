# Local-only proof that optimistic saves serialize on the installation row.
$ErrorActionPreference = 'Stop'
$settingsActor = [guid]::NewGuid().ToString()
$settingsRequest = [guid]::NewGuid().ToString()
$settingsSecondRequest = [guid]::NewGuid().ToString()
$settingsFirst = $null
function Invoke-SettingsLocalSql([string]$sql) {
    $output = & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql
    if ($LASTEXITCODE -ne 0) { throw 'Local settings SQL failed' }
    return $output
}
try {
    Invoke-SettingsLocalSql "begin; insert into auth.users(id) values('$settingsActor'); insert into public.staff_profiles(user_id,organization_id,role) values('$settingsActor','a0000000-0000-0000-0000-000000000001','manager'); commit;" | Out-Null
    $settingsVersion = Invoke-SettingsLocalSql "select coalesce((select revision from public.business_settings where organization_id='a0000000-0000-0000-0000-000000000001'),0);"
    $settingsFixture = '{"brandName":"Lock fixture","brandVoice":"Lịch sự","allowedTopics":[],"forbiddenTopics":[],"timezone":"Asia/Ho_Chi_Minh","goalSelection":"auto","managerGoal":"","timingMode":"constrained","dailyCap":1,"windows":[{"start":"09:00","end":"17:00"}],"objective":"mixed"}'
    $settingsFirst = Start-Job -ArgumentList $settingsActor,$settingsRequest,$settingsVersion,$settingsFixture -ScriptBlock {
        param($actor,$requestId,$revision,$document)
        & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role service_role; select public.save_business_settings('a0000000-0000-0000-0000-000000000001','$actor',$revision,'$requestId','$document'::jsonb)->>'revision'; select pg_advisory_xact_lock(120008,94000); select pg_sleep(5); rollback;"
        if ($LASTEXITCODE -ne 0) { throw 'First settings transaction failed' }
    }
    $settingsDeadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $settingsLocked = Invoke-SettingsLocalSql "select count(*) from pg_locks where locktype='advisory' and classid=120008 and objid=94000 and granted;"
        if ($settingsLocked -eq '1') { break }
        if ([DateTime]::UtcNow -ge $settingsDeadline) { throw 'Settings transaction did not reach barrier' }
        Start-Sleep -Milliseconds 100
    } while ($true)
    # This transaction must wait on the first save, rather than save a competing revision.
    $settingsOutput = & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "begin; set local role service_role; set local lock_timeout='1s'; select public.save_business_settings('a0000000-0000-0000-0000-000000000001','$settingsActor',$settingsVersion,'$settingsSecondRequest','$settingsFixture'::jsonb); rollback;" 2>&1
    if ($LASTEXITCODE -eq 0 -or ($settingsOutput | Out-String) -notmatch '55P03') { throw 'Second save did not block on the row lock' }
    $settingsFirst | Wait-Job -Timeout 15 | Out-Null
    if ($settingsFirst.State -ne 'Completed') { throw 'First save did not finish' }
    Receive-Job $settingsFirst -ErrorAction Stop | Out-Null
    $settingsAfter = Invoke-SettingsLocalSql "select coalesce((select revision from public.business_settings where organization_id='a0000000-0000-0000-0000-000000000001'),0);"
    if ($settingsAfter -ne $settingsVersion) { throw 'Rollback changed the saved revision' }
    Write-Output 'PASS: overlapping settings save waited on the installation row; both transactions rolled back.'
} finally {
    if ($settingsFirst) { $settingsFirst | Wait-Job -Timeout 15 | Out-Null; $settingsFirst | Remove-Job -Force }
    Invoke-SettingsLocalSql "delete from public.staff_profiles where user_id='$settingsActor'; delete from auth.users where id='$settingsActor';" | Out-Null
}
