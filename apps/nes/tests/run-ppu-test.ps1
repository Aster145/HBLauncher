# Execute the production GLSL on the local Vulkan driver; no emulator replica.
# This is desktop GPU logic coverage, not Switch hardware or ROM compatibility.
param([switch]$SnapshotDifferential)
$ErrorActionPreference = 'Stop'
$launcher = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
function Resolve-NesTool($EnvironmentName, $RelativePath, $Fallback) {
    $override = [Environment]::GetEnvironmentVariable($EnvironmentName)
    if ($override) { return $override }
    $local = Join-Path $launcher $RelativePath
    if (Test-Path -LiteralPath $local -PathType Leaf) { return $local }
    return $Fallback
}
$glslang = Resolve-NesTool 'GLSLANG' 'tools\glslang\mingw64\bin\glslangValidator.exe' 'glslangValidator'
$validate = Resolve-NesTool 'SPIRV_VAL' 'tools\spirv-tools\mingw64\bin\spirv-val.exe' 'spirv-val'
$runner = Resolve-NesTool 'HB_COMPUTE_CHECK' 'tools\glslang\desktop-tests\game-compute-check.exe' 'game-compute-check'
$build = Join-Path $PSScriptRoot '.ppu-test-output'
[void][IO.Directory]::CreateDirectory($build)
$testName = if ($SnapshotDifferential) { 'ppu-snapshot-test' } else { 'ppu-test' }
$expectedChecks = if ($SnapshotDifferential) { 399360 } else { 94 }
$spv = Join-Path $build ($testName + '.spv')
& $glslang -V --target-env vulkan1.1 -o $spv (Join-Path $PSScriptRoot ($testName + '.comp'))
if ($LASTEXITCODE -ne 0) { throw 'PPU test shader compilation failed' }
& $validate --target-env vulkan1.1 $spv
if ($LASTEXITCODE -ne 0) { throw 'PPU test SPIR-V validation failed' }
$initial = Join-Path $build 'initial.bin'
$inputs = Join-Path $build 'inputs.bin'
$output = Join-Path $build 'result.bin'
[IO.File]::WriteAllBytes($initial, (New-Object byte[] (8 * 1024 * 1024)))
[IO.File]::WriteAllBytes($inputs, (New-Object byte[] 64))
$savedFullOutput = $env:HB_FULL_OUTPUT
try {
    $env:HB_FULL_OUTPUT = '1'
    & $runner $initial $output $spv $inputs 1
    if ($LASTEXITCODE -ne 0) { throw 'PPU test Vulkan dispatch failed' }
} finally { $env:HB_FULL_OUTPUT = $savedFullOutput }
$bytes = [IO.File]::ReadAllBytes($output)
$offset = 1024 + 150000 * 4
$total = [BitConverter]::ToUInt32($bytes, $offset)
$failed = [BitConverter]::ToUInt32($bytes, $offset + 4)
$first = [BitConverter]::ToUInt32($bytes, $offset + 8)
$actual = [BitConverter]::ToUInt32($bytes, $offset + 12)
$wanted = [BitConverter]::ToUInt32($bytes, $offset + 16)
$magic = [BitConverter]::ToUInt32($bytes, $offset + 20)
if ($magic -ne 0x50505531 -or $total -ne $expectedChecks -or $failed -ne 0) {
    throw ('PPU test failed: checks={0}, failures={1}, first={2}, actual=0x{3:X}, expected=0x{4:X}, completion=0x{5:X}' -f $total, $failed, $first, $actual, $wanted, $magic)
}
Write-Host ('PASS: {0}: {1} production GLSL assertions on desktop Vulkan.' -f $testName, $total)
