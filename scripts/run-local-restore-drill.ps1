param(
    [string]$ArtifactDirectory = "artifacts/local-restore-drill"
)

$ErrorActionPreference = "Stop"
$docker = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$source = "newsconseen-backup-source-20260803"
$target = "newsconseen-restore-scratch-20260803"
$password = "local-disposable-restore-only"
$artifactPath = Join-Path (Get-Location) $ArtifactDirectory
$dumpPath = Join-Path $artifactPath "newsconseen-local.dump"

New-Item -ItemType Directory -Force -Path $artifactPath | Out-Null

foreach ($container in @($source, $target)) {
    $existing = & $docker ps -a --filter "name=^/$container$" --format "{{.Names}}"
    if ($existing) {
        throw "Refusing to reuse existing container $container. Remove it deliberately or change the drill name."
    }
}

try {
    & $docker run -d --name $source -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=newsconseen_source" postgres:16-alpine | Out-Null
    & $docker run -d --name $target -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=newsconseen_restore" postgres:16-alpine | Out-Null

    foreach ($container in @($source, $target)) {
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            & $docker exec $container pg_isready -U postgres | Out-Null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) { throw "PostgreSQL did not become ready in $container" }
    }

    $seedSql = @"
create schema if not exists public;
create table public.enterprises (id uuid primary key, company_id text not null, name text not null);
create table public.tasks (id uuid primary key, company_id text not null, title text not null, enterprise_id uuid references public.enterprises(id));
insert into public.enterprises values ('11111111-1111-1111-1111-111111111111', 'restore-drill', 'Restore Drill Enterprise');
insert into public.tasks values ('22222222-2222-2222-2222-222222222222', 'restore-drill', 'Verify representative task', '11111111-1111-1111-1111-111111111111');
"@
    $seedSql | & $docker exec -i $source psql -v ON_ERROR_STOP=1 -U postgres -d newsconseen_source | Out-Null
    & $docker exec $source pg_dump -Fc -U postgres -d newsconseen_source -f /tmp/newsconseen-local.dump
    & $docker cp "${source}:/tmp/newsconseen-local.dump" $dumpPath | Out-Null
    & $docker cp $dumpPath "${target}:/tmp/newsconseen-local.dump" | Out-Null
    & $docker exec $target pg_restore --clean --if-exists --no-owner -U postgres -d newsconseen_restore /tmp/newsconseen-local.dump
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

    $enterpriseCount = (& $docker exec $target psql -At -U postgres -d newsconseen_restore -c "select count(*) from public.enterprises;").Trim()
    $taskCount = (& $docker exec $target psql -At -U postgres -d newsconseen_restore -c "select count(*) from public.tasks;").Trim()
    $fkCount = (& $docker exec $target psql -At -U postgres -d newsconseen_restore -c "select count(*) from public.tasks t join public.enterprises e on e.id=t.enterprise_id where t.company_id='restore-drill';").Trim()
    $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath).Hash.ToLowerInvariant()
    $passed = $enterpriseCount -eq "1" -and $taskCount -eq "1" -and $fkCount -eq "1"

    $report = [ordered]@{
        contract = "newsconseen-local-postgresql-restore-drill.v1"
        executed_at = (Get-Date).ToUniversalTime().ToString("o")
        source = "disposable_local_postgresql_container"
        restore_target = "separate_disposable_local_postgresql_container"
        active_supabase_used = $false
        durable_offsite_backup = $false
        dump_sha256 = $sha256
        representative_records = [ordered]@{
            enterprises = [int]$enterpriseCount
            tasks = [int]$taskCount
            valid_task_enterprise_links = [int]$fkCount
        }
        status = $(if ($passed) { "pass" } else { "fail" })
        limitation = "Validates local dump/restore machinery only; it is not a durable production backup."
    }
    $report | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $artifactPath "report.json")
    if (-not $passed) { throw "Restored representative record verification failed" }
    $report | ConvertTo-Json -Depth 5
}
finally {
    foreach ($container in @($source, $target)) {
        $existing = & $docker ps -a --filter "name=^/$container$" --format "{{.Names}}"
        if ($existing -eq $container) { & $docker rm -f $container | Out-Null }
    }
}
