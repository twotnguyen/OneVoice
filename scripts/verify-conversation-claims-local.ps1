# Fixed local-only database. Both competing claim transactions roll back.
$ErrorActionPreference = 'Stop'
$convo = [guid]::NewGuid().ToString(); $eventId = [guid]::NewGuid().ToString(); $handoff = [guid]::NewGuid().ToString()
$staffOne = [guid]::NewGuid().ToString(); $staffTwo = [guid]::NewGuid().ToString()
$requestOne = [guid]::NewGuid().ToString(); $requestTwo = [guid]::NewGuid().ToString()
$first = $null
function Invoke-ConversationSql([string]$sql) {
 $result = & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql
 if ($LASTEXITCODE -ne 0) { throw 'Local conversation SQL failed' }
 return $result
}
try {
 # Privileged synthetic rows avoid committing audit fixtures; normal workflow is tested in pgTAP.
 Invoke-ConversationSql "begin; insert into auth.users(id) values('$staffOne'),('$staffTwo'); insert into public.staff_profiles(user_id,organization_id,role) values('$staffOne','a0000000-0000-0000-0000-000000000001','staff'),('$staffTwo','a0000000-0000-0000-0000-000000000001','staff'); insert into public.facebook_inbound_events(id,organization_id,page_id,provider_key,kind,sender_id,recipient_id,data) values('$eventId','a0000000-0000-0000-0000-000000000001','10000000015','$eventId','message','$convo','10000000015','{}'); insert into public.conversations(id,organization_id,page_id,psid) values('$convo','a0000000-0000-0000-0000-000000000001','10000000015','$convo'); insert into public.conversation_handoffs(id,conversation_id,source_event_id,reason) values('$handoff','$convo','$eventId','customer_requested'); update public.conversations set status='WAITING_STAFF',revision=1,active_handoff_id='$handoff' where id='$convo'; commit;" | Out-Null
 $first = Start-Job -ArgumentList $staffOne,$convo,$requestOne -ScriptBlock {
  param($actor,$conversation,$requestId)
  & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; set local role service_role; select public.transition_conversation_handoff('a0000000-0000-0000-0000-000000000001','$actor','$conversation',1,'claim','$requestId')->>'status'; select pg_advisory_xact_lock(120014,100000); select pg_sleep(5); rollback;"
  if ($LASTEXITCODE -ne 0) { throw 'First claimant failed' }
 }
 $deadline = [DateTime]::UtcNow.AddSeconds(15)
 do {
  $locked = Invoke-ConversationSql "select count(*) from pg_locks where locktype='advisory' and classid=120014 and objid=100000 and granted;"
  if ($locked -eq '1') { break }
  if ([DateTime]::UtcNow -ge $deadline) { throw 'First claimant did not reach barrier' }
  Start-Sleep -Milliseconds 100
 } while ($true)
 $second = & docker exec supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -c "begin; set local role service_role; set local lock_timeout='1s'; select public.transition_conversation_handoff('a0000000-0000-0000-0000-000000000001','$staffTwo','$convo',1,'claim','$requestTwo'); rollback;" 2>&1
 if ($LASTEXITCODE -eq 0 -or ($second | Out-String) -notmatch '55P03') { throw 'Competing claimant was not serialized' }
 $first | Wait-Job -Timeout 15 | Out-Null
 if ($first.State -ne 'Completed') { throw 'First claimant did not finish' }
 $firstResult = Receive-Job $first -ErrorAction Stop
 if ($firstResult -notcontains 'STAFF_ACTIVE') { throw 'First claimant did not claim' }
 if ((Invoke-ConversationSql "select status from public.conversations where id='$convo';") -ne 'WAITING_STAFF') { throw 'Rollback did not preserve waiting state' }
 Write-Output 'PASS: first claimant reached STAFF_ACTIVE; overlapping second claimant blocked on the conversation row; both transactions rolled back.'
} finally {
 if ($first) { $first | Wait-Job -Timeout 15 | Out-Null; $first | Remove-Job -Force }
 Invoke-ConversationSql "begin; update public.conversations set status='AI_ACTIVE',active_handoff_id=null where id='$convo'; delete from public.conversation_handoffs where id='$handoff'; delete from public.conversations where id='$convo'; delete from public.facebook_inbound_events where id='$eventId'; delete from public.staff_profiles where user_id in ('$staffOne','$staffTwo'); delete from auth.users where id in ('$staffOne','$staffTwo'); commit;" | Out-Null
}
