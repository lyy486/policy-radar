$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
  Where-Object {
    $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and
    $_.AddressState -eq 'Preferred'
  } |
  Sort-Object InterfaceMetric |
  Select-Object -First 1 -ExpandProperty IPAddress

if (-not $address) {
  throw '没有找到可用的局域网 IPv4 地址，请确认电脑已经连接 Wi-Fi。'
}

$env:ALLOW_LAN = 'true'
$env:HOST = '0.0.0.0'
$env:PORT = '4173'

Write-Host ''
Write-Host '请让手机连接与电脑相同的 Wi-Fi，然后打开：' -ForegroundColor Cyan
Write-Host ("http://{0}:4173/" -f $address) -ForegroundColor Green
Write-Warning '如 Windows 防火墙询问，只允许“专用网络”，不要允许公用网络。关闭此窗口后，局域网访问会停止。'
Write-Host ''
npm run free:preview
