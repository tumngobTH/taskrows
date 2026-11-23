# Measures RAM of the TaskRows process group (taskrows.exe + its msedgewebview2.exe descendants).
# Pass/fail metric: summed PRIVATE working set (Task Manager Processes tab, Memory column).
# Summed WorkingSet is printed for info only (it double-counts pages shared between processes).
# Exit code 1 if summed private WS > LimitMB (default 150), 2 if not running.
param([int]$LimitMB = 150, [string]$ProcessName = 'taskrows')

$all = Get-CimInstance Win32_Process
$roots = @($all | Where-Object { $_.Name -ieq ($ProcessName + '.exe') })
if ($roots.Count -eq 0) {
    Write-Host "TaskRows is not running (no $ProcessName.exe found). Start the app and try again."
    exit 2
}

$children = @{}
foreach ($p in $all) {
    $k = [int]$p.ParentProcessId
    if (-not $children.ContainsKey($k)) { $children[$k] = New-Object System.Collections.ArrayList }
    [void]$children[$k].Add($p)
}

$found = New-Object System.Collections.ArrayList
$seen = @{}
$queue = New-Object System.Collections.Queue
foreach ($r in $roots) { $queue.Enqueue($r) }
while ($queue.Count -gt 0) {
    $p = $queue.Dequeue()
    $id = [int]$p.ProcessId
    if ($seen.ContainsKey($id)) { continue }
    $seen[$id] = $true
    [void]$found.Add($p)
    if ($children.ContainsKey($id)) {
        foreach ($c in $children[$id]) { $queue.Enqueue($c) }
    }
}

# Informational: private working set (excludes pages shared between the processes).
$priv = @{}
try {
    foreach ($pp in (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process)) {
        $priv[[int]$pp.IDProcess] = [double]$pp.WorkingSetPrivate
    }
} catch { }

$missing = 0
$rows = @($found | ForEach-Object {
    $id = [int]$_.ProcessId
    $pm = 'n/a'
    if ($priv.ContainsKey($id)) { $pm = [math]::Round($priv[$id] / 1MB, 1) } else { $missing++ }
    [pscustomobject]@{
        Name         = $_.Name
        PID          = $_.ProcessId
        PrivateMB    = $pm
        WorkingSetMB = [math]::Round($_.WorkingSetSize / 1MB, 1)
    }
})
$rows | Format-Table -AutoSize | Out-String | Write-Host

$total = [math]::Round((($found | Measure-Object -Property WorkingSetSize -Sum).Sum) / 1MB, 1)
$totalPriv = 0
foreach ($r in $rows) { if ($r.PrivateMB -ne 'n/a') { $totalPriv += $r.PrivateMB } }
$totalPriv = [math]::Round($totalPriv, 1)
if ($missing -gt 0) {
    Write-Host "WARNING: $missing process(es) had no perf-counter row; private total is UNRELIABLE (computed from the rows available)."
}
Write-Host ("TOTAL private WS: {0} MB across {1} processes (limit {2} MB)  <- PASS/FAIL metric (Task Manager Memory column)" -f $totalPriv, $rows.Count, $LimitMB)
Write-Host ("info: summed WorkingSet: {0} MB (includes shared pages, double-counts)" -f $total)
if ($totalPriv -gt $LimitMB) {
    Write-Host "OVER LIMIT (private working set above $LimitMB MB)"
    exit 1
}
Write-Host "OK"
exit 0
