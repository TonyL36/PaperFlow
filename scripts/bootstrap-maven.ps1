param(
  [Parameter(Mandatory = $false)]
  [string]$Version = "3.9.9",
  [Parameter(Mandatory = $false)]
  [string]$Cmd = "verify",
  [Parameter(Mandatory = $false)]
  [string[]]$Args = @("-DskipTests")
)

$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root ".tools"
$mavenHome = Join-Path $tools ("apache-maven-{0}" -f $Version)
$mvnCmd = Join-Path $mavenHome "bin/mvn.cmd"

if (!(Test-Path $mvnCmd)) {
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  $zip = Join-Path $tools ("apache-maven-{0}-bin.zip" -f $Version)
  $url = "https://archive.apache.org/dist/maven/maven-3/{0}/binaries/apache-maven-{0}-bin.zip" -f $Version
  Invoke-WebRequest -Uri $url -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $tools -Force
}

Push-Location $root
try {
  & $mvnCmd @Args $Cmd
} finally {
  Pop-Location
}
