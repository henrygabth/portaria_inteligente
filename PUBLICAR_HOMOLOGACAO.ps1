# Executar no PowerShell dentro da pasta extraida do ZIP (com Git instalado).
# Cria uma branch de homologacao SEM modificar a branch main.
$ErrorActionPreference = 'Stop'
$origem = $PSScriptRoot
$repo = 'https://github.com/henrygabth/portaria_inteligente.git'
$branch = 'homologacao-render-professores'
$destino = Join-Path (Split-Path -Parent $origem) 'portaria_publicacao_homologacao'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git nao instalado ou nao encontrado no PATH. Instale o Git antes de continuar.'
}
if (Test-Path $destino) {
    throw "A pasta $destino ja existe. Para nao apagar nada, este script foi interrompido. Renomeie a pasta e tente outra vez."
}

Write-Host '[1/5] Clonando o GitHub, sem alterar a pasta atual...'
git clone --branch main $repo $destino
if ($LASTEXITCODE -ne 0) { throw 'Falha ao clonar o repositorio.' }

Push-Location $destino
try {
    git switch -c $branch
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar branch de homologacao.' }

    Write-Host '[2/5] Copiando somente os arquivos da aplicacao...'
    Get-ChildItem -LiteralPath $origem -Force | Where-Object {
        $_.Name -notin @('.git','.env','node_modules')
    } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $destino -Recurse -Force
    }
    # Defende contra copias acidentais de credenciais e dados locais.
    Get-ChildItem -LiteralPath $destino -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq '.env' -or $_.Name -like '*.pem' -or $_.Name -like '*.key'
    } | ForEach-Object { if ($_.FullName -notmatch '[\\/]\.git[\\/]') { Remove-Item -LiteralPath $_.FullName -Force } }

    Write-Host '[3/5] Preparando o commit da nova versao...'
    git add -A
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao adicionar arquivos.' }
    $incluidos = @(git diff --cached --name-only)
    $secretos = @($incluidos | Where-Object { $_ -match '(^|/)\.env$|(^|/)node_modules/|\.(pem|key)$' })
    if ($secretos.Count -gt 0) { throw 'Publicacao bloqueada: arquivos secretos detectados.' }
    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw 'Problema no patch. Revise o diff.' }
    git status --short
    if ($incluidos.Count -eq 0) { Write-Host 'Sem alteracoes. Nada a publicar.'; exit 0 }

    $resposta = Read-Host 'Confirme o envio da branch de TESTES. Digite PUBLICAR'
    if ($resposta -cne 'PUBLICAR') { Write-Host 'Cancelado. Nenhum arquivo foi enviado.'; exit 0 }

    Write-Host '[4/5] Criando commit...'
    git commit -m 'Adiciona professores, alertas e adaptacao para homologacao no Render'
    if ($LASTEXITCODE -ne 0) { throw 'Commit falhou; verifique usuario/email do Git.' }
    Write-Host '[5/5] Enviando somente a branch de homologacao...'
    git push -u origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Push falhou. Confira autenticacao no GitHub.' }
    Write-Host 'PUBLICADO EM: https://github.com/henrygabth/portaria_inteligente/tree/homologacao-render-professores'
    Write-Host 'Agora crie um NOVO Web Service no Render e selecione essa branch.'
} finally { Pop-Location }
