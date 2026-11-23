# Measures total working-set RAM of the TaskRows process group (taskrows.exe + its
# msedgewebview2.exe descendants). Exit code 1 if total > LimitMB (default 150), 2 if not running.
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

$rows = @($found | ForEach-Object {
    [pscustomobject]@{
        Name         = $_.Name
        PID          = $_.ProcessId
        WorkingSetMB = [math]::Round($_.WorkingSetSize / 1MB, 1)
        PrivateMB    = [math]::Round(([double]$priv[[int]$_.ProcessId]) / 1MB, 1)
    }
})
$rows | Format-Table -AutoSize | Out-String | Write-Host

$total = [math]::Round((($found | Measure-Object -Property WorkingSetSize -Sum).Sum) / 1MB, 1)
Write-Host ("TOTAL: {0} MB across {1} processes (limit {2} MB)" -f $total, $rows.Count, $LimitMB)
$totalPriv = [math]::Round((($rows | Measure-Object -Property PrivateMB -Sum).Sum), 1)
Write-Host ("Private working set (info only, not the pass/fail metric): {0} MB" -f $totalPriv)
if ($total -gt $LimitMB) {
    Write-Host "OVER LIMIT"
    exit 1
}
Write-Host "OK"
exit 0
