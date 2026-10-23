# Portaria Inteligente — homologação segura no Render

Esta versão inclui as mudanças de **professores, portaria e alertas**, além de adequações ao Render. A branch sugerida é `homologacao-render-professores`. **Não substitua o serviço de produção na primeira tentativa.**

## 1. O que muda tecnicamente

- `npm start` executa `node index.js`, ouvindo `0.0.0.0` e a porta `PORT` definida pelo Render.
- O servidor valida a conexão com MySQL e as tabelas antes de aceitar tráfego. Caso falhem, o deploy termina com erro esclarecedor, em vez de afirmar que está pronto.
- `/api/saude` fornece health check HTTP; não expõe dados de usuários.
- O assistente de primeira execução só é usado no computador; no Render, a ausência de variáveis produz um erro objetivo.
- As variáveis de **Render > Environment** prevalecem sobre eventuais arquivos locais; o `.env` nunca deve ir para o GitHub.
- `BASE_URL` passa a usar automaticamente `RENDER_EXTERNAL_URL` nos links de redefinição de senha quando `BASE_URL` não estiver configurada.
- `MIGRACAO_AUTOMATICA` fica **desligada por padrão**, evitando alterações de DDL em produção sem backup.
- `AMBIENTE=homologacao` desliga agendador e simula envios de e-mail por padrão (`EMAILS_REAIS_NO_TESTE=0`).
- Adicionado `render.yaml` opcional para criar um serviço de homologação como Blueprint, sem credenciais salvas.
- Node 22 indicado em `.node-version` e `package.json`.

## 2. Banco de dados para testes

**O IP `10.87.100.6` e `localhost` não servem como `DB_HOST` no Render.** São endereços locais/privados da rede da escola. Render precisa de um endpoint MySQL externo acessível, como o host e porta **públicos** do Railway ou de outro MySQL acessível de fora.

**Use um banco de homologação SEPARADO, nunca o banco principal.** Copie somente a estrutura e dados fictícios, ou um backup saneado sem dados reais dos estudantes. No MySQL de homologação:

1. Faça backup e confirme que consegue restaurá-lo.
2. Instale a estrutura de base se o banco estiver vazio (`database/instalar_banco_local.sql` é para ambiente local com banco `portaria_teste`; NÃO execute esse script diretamente no Railway). Para Railway, faça um clone da estrutura compatível, com o nome da base adequada.
3. Se a estrutura antiga ainda não tiver as colunas já utilizadas na aplicação, aplique as migrations antigas pertinentes ou, **somente na homologação e após backup**, execute uma vez `MIGRACAO_AUTOMATICA=1`, reinicie e volte para `0`. Isso cobre as colunas gerenciadas por `utils/migrar.js`, **não** cria automaticamente as tabelas dos professores.
4. Execute `database/migration_professores_up.sql` **uma vez**. Esse arquivo já cria `professores_turmas`, `comunicados_professores` e `alertas_email_envios`, e expande `usuarios.tipo_usuario`.
5. Se a migration dos professores já foi aplicada em uma versão anterior, execute **somente** `database/migration_alertas_email_up.sql`, caso a tabela `alertas_email_envios` ainda não exista.
6. Verifique a existência das tabelas:

```sql
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('usuarios','turmas','alunos','pedidos_saida',
                     'responsaveis_alunos','pedidos_recorrentes',
                     'historico_pedidos','professores_turmas',
                     'comunicados_professores','alertas_email_envios');
```

Se o deploy indicar tabelas ausentes, **pare e corrija o banco de homologação**. Não habilite DDL automática no Railway principal apenas para ultrapassar a verificação.

## 3. Publicar no GitHub usando o PC Windows

Descompacte o ZIP, abra o PowerShell **na pasta `portaria_inteligente`** e execute:

```powershell
.\PUBLICAR_HOMOLOGACAO.ps1
```

O script verifica se há Git, clona o repositório oficial em pasta nova, cria `homologacao-render-professores`, copia os arquivos atualizados **sem `.env`**, mostra os arquivos modificados, solicita que você digite `PUBLICAR` e realiza o push da branch. **A branch `main` não é modificada.** Se o Windows bloquear scripts por política da escola, solicite ajuda ao professor ou use o VS Code/Git para aplicar as alterações sem alterar as políticas da máquina.

Link esperado depois do push:
`https://github.com/henrygabth/portaria_inteligente/tree/homologacao-render-professores`

## 4. Criar serviço de teste no Render

Em **Render > New > Web Service > GitHub**, selecione `henrygabth/portaria_inteligente` e configure:

| Campo | Valor |
|---|---|
| Name | `portaria-inteligente-homologacao` (ou outro único) |
| Branch | `homologacao-render-professores` |
| Root Directory | vazio (arquivos Node estão na raiz do repo) |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` (ou `node index.js`) |
| Health Check Path | `/api/saude` |

Em **Environment**, configure os valores abaixo. **Não copie as senhas para chat ou GitHub.**

```dotenv
AMBIENTE=homologacao
TZ_ESCOLA=America/Sao_Paulo
MIGRACAO_AUTOMATICA=0
AGENDADOR_ATIVO=0
EMAILS_REAIS_NO_TESTE=0
DB_HOST=<HOST_PUBLICO_DO_MYSQL_DE_TESTE>
DB_PORT=<PORTA_PUBLICA_DO_MYSQL_DE_TESTE>
DB_USER=<USUARIO_MYSQL_DE_TESTE>
DB_PASSWORD=<SENHA_MYSQL_DE_TESTE>
DB_NAME=<NOME_DO_BANCO_DE_TESTE>
JWT_SECRET=<CHAVE_ALEATORIA_LONGA_EXCLUSIVA>
```

Render define `PORT`, `NODE_ENV=production`, `RENDER=true` e `RENDER_EXTERNAL_URL` automaticamente. **Não defina** `MODO_TESTE_LOCAL=1` no Render; o servidor o recusará por segurança. **Não defina** `EMAILS_REAIS_NO_TESTE=1` durante a primeira homologação.

Para habilitar no futuro os alertas automáticos em **homologação** usando destinatários fictícios, altere `AGENDADOR_ATIVO=1` mantendo `EMAILS_REAIS_NO_TESTE=0`. O código simulará os e-mails e gravará os status correspondentes no banco de testes. Em produção, o agendador só será confiável com um serviço continuamente disponível (Render Free pode ficar suspenso, interrompendo verificações e avisos).

## 5. Validar após deploy

1. Render > Logs: localizar `[banco] Conexão MySQL estabelecida.`, `[banco] Estrutura necessária... OK`, `[servidor] Ativo em https://...`.
2. Abrir `https://<SEU-SERVICO>.onrender.com/api/saude` — JSON com `status: ok`, `ambiente: homologacao`.
3. Abrir `/login.html`, entrar com usuários **fictícios cadastrados no banco de teste**. O código não cria contas automaticamente em produção.
4. ADMIN cadastra/vincula professor; SECRETARIA não consegue fazer isso (403).
5. Responsável cria solicitação; secretaria autoriza/recusa; portaria só enxerga autorizadas e pode registrar saída/retorno.
6. Professor vê apenas alunos das turmas vinculadas e consulta comunicados e histórico.
7. Para exercitar atrasos com agendador ativo em homologação, use horários fictícios e verifique `comunicados_professores` e `alertas_email_envios` **sem e-mails reais**.
8. Caso o Render não consiga conectar ao banco, cheque `DB_HOST`, `DB_PORT`, se o endpoint é público, e a disponibilidade do Railway. Teste de conexão do banco é obrigatório antes de marcar o serviço como pronto.

## 6. Publicar na produção SOMENTE após homologação

Depois que todas as telas, permissões, horários e notificações funcionarem no serviço de testes:
- Faça backup atualizado do banco real e verifique as migrations necessárias.
- Execute as migrations necessárias no banco real com os registros preservados.
- Revogue/substitua senhas e chaves que possam ter sido expostas no incidente do Railway (outubro de 2026), atualizando também o Render.
- Faça merge da branch homologada na `main` com segurança e acompanhe os logs de deploy.
- No serviço de produção defina `AMBIENTE=producao`, `AGENDADOR_ATIVO=1`, `MIGRACAO_AUTOMATICA=0`, `BREVO_API_KEY`, `EMAIL_FROM` e demais variáveis existentes. Remova `MODO_TESTE_LOCAL`, `EMAILS_REAIS_NO_TESTE` e quaisquer valores de homologação.

### Observações de segurança

- O ZIP não inclui `.env` nem senhas. Nunca publique backups contendo nomes, CPFs ou e-mails reais de estudantes em repositório público.
- Embora as verificações estáticas e os testes Node possam passar, ainda é necessário testar o MySQL real da homologação e o serviço no Render.
- Se o banco de homologação for o mesmo MySQL principal, **não execute testes de escrita**. Crie um banco separado antes.
