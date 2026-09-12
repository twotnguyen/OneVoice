# Local-only proof of overlapping PostgreSQL claims. Never reads .env or resets data.
$ErrorActionPreference = 'Stop'
$container = 'supabase_db_onevoice'
$dedup = [guid]::NewGuid().ToString()
$workerOne = [guid]::NewGuid().ToString()
$workerTwo = [guid]::NewGuid().ToString()
function Invoke-LocalSql([string]$sql) {
    $result = & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql
    if ($LASTEXITCODE -ne 0) { throw 'Local database command failed' }
    return $result
}
# Claim scans the whole installation queue: refuse to consume existing runnable work.
$pending = Invoke-LocalSql "select count(*) from public.business_jobs where status in ('queued','running');"
if ($pending -ne '0') { throw 'Concurrency fixture requires no queued/running local business jobs' }
$first = $null
try {
    Invoke-LocalSql "select public.enqueue_business_job('a0000000-0000-0000-0000-000000000001','inbound_event','c0000000-0000-4000-8000-000000000001','$dedup','2041-01-01',2);" | Out-Null
    $first = Start-Job -ArgumentList $workerOne -ScriptBlock {
        param($owner)
        & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role service_role; select 'claimed=' || count(*) from public.claim_business_job('$owner',60,'2041-01-01'); select pg_advisory_xact_lock(120012,92000); select pg_sleep(5); rollback;"
        if ($LASTEXITCODE -ne 0) { throw 'First worker failed' }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        $locked = Invoke-LocalSql "select count(*) from pg_locks where locktype='advisory' and classid=120012 and objid=92000 and granted;"
        if ($locked -eq '1') { break }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'First worker did not reach lock barrier' }
        Start-Sleep -Milliseconds 100
    } while ($true)
    $second = Invoke-LocalSql "begin; set local role service_role; select 'claimed=' || count(*) from public.claim_business_job('$workerTwo',60,'2041-01-01'); rollback;"
    $first | Wait-Job -Timeout 15 | Out-Null
    if ($first.State -ne 'Completed') { throw 'First worker did not finish' }
    $firstOutput = Receive-Job $first -ErrorAction Stop
    if ($firstOutput -notcontains 'claimed=1' -or $second -notcontains 'claimed=0') { throw 'Concurrent claim assertions failed' }
    Write-Output 'PASS: first worker claimed 1; overlapping second worker claimed 0 while row lock was held.'
} finally {
    if ($first) { $first | Wait-Job -Timeout 15 | Out-Null; $first | Remove-Job -Force }
    Invoke-LocalSql "delete from public.business_jobs where dedup_key='$dedup'::uuid;" | Out-Null
}
