# Portaria Inteligente — Portaria operacional + módulo dos professores

## ATUALIZAÇÃO — administração exclusiva e alertas por e-mail para todos

**Requisitos desta revisão:** somente `ADMIN` cadastra professores, altera as turmas às quais têm acesso e ativa/desativa esses perfis. A secretaria continua podendo aprovar/recusar solicitações e administrar responsáveis e alunos, mas **não** gerencia professores. A permissão foi aplicada no backend, não apenas ocultando o link.

### Três eventos que enviam e-mail aos quatro públicos

| Evento | Momento | Destinatários |
|---|---|---|
| `ATRASADO` | Mais de **5 minutos** após o retorno previsto, ainda com status `EM_SAIDA` | **Todos os responsáveis vinculados**, todas as contas ativas `SECRETARIA` e `PORTARIA`/`PORTEIRO`, **todos os professores ativos vinculados à turma** |
| `NAO_RETORNOU` | Mais de **15 minutos** após o retorno previsto, permanecendo fora | Os mesmos quatro públicos recebem **outro** e-mail, de maior urgência |
| `CHEGOU_ATRASADO` | A portaria registra um retorno mais de 5 minutos após o previsto | Os mesmos quatro públicos recebem confirmação de que o aluno **já retornou**, com horário real |

Cada destinatário recebe um e-mail **individual**, sem expor os demais endereços. Se uma pessoa acumular papéis, recebe apenas um e-mail por evento. Quem não tiver endereço válido não pode recebê-lo. Os professores recebem mensagens somente relativas às suas turmas, e isso é reconferido antes de cada envio. Uma turma sem professor não impede os avisos aos demais grupos; sem turma não é possível selecionar professores.

O envio segue **assíncrono ao registro da saída/retorno**: o agendador consulta o banco a cada minuto; os horários são limiares, de modo que o envio poderá ocorrer depois deles. Falhas de comunicação com o Brevo/SMTP não bloqueiam a portaria e são reprocessadas a cada 2 minutos enquanto o alerta tiver menos de 24 horas. A fila `alertas_email_envios` guarda um registro por `(pedido_id, tipo_evento, email_destino)`, com tentativas/status. Isso evita duplicações em ciclos normais; como em qualquer fila com tentativas após interrupções, **não é uma garantia absoluta de exatamente uma entrega** (o servidor pode falhar após o provedor aceitar o envio e antes de marcar o banco). Eventos mais antigos que 24 horas não são disparados após uma queda longa. Se o aluno já voltou enquanto o e-mail de atraso estava na fila, esse e-mail é descartado em favor de `CHEGOU_ATRASADO`.

**E-mail de retorno normal** aos responsáveis permanece como antes. Para **retorno atrasado**, o envio antigo aos responsáveis é substituído pelo e-mail coletivo individualizado da fila, evitando avisos repetidos ou contraditórios.

### SQL e ordem de deploy

1. Faça backup completo, restaure uma cópia e teste nela antes da produção.
2. **Se ainda não executou `migration_professores_up.sql`:** use a versão atual do arquivo, que já cria a fila. **Se já executou a versão anterior:** execute **somente** `database/migration_alertas_email_up.sql` (a criação é `IF NOT EXISTS`). Não precisa remover ou recriar nenhuma tabela de alunos/pedidos.
3. Confira: `SHOW TABLES LIKE 'alertas_email_envios';` e `SHOW INDEX FROM alertas_email_envios;`.
4. Publique o código atualizado **somente depois** das migrations. Nenhuma variável nova é obrigatória; mantenha `BREVO_API_KEY`/configurações de e-mail da aplicação. Não desative o envio em produção sem planejar como testar de forma segura.
5. Após o deploy, autentique-se como `ADMIN` para acessar *Professores e Turmas*. Tente a mesma API com conta `SECRETARIA` e confirme **403** (listar, criar e alterar vínculo). Tente também `/api/usuarios/cadastrar` com `tipo_usuario: PROFESSOR` como secretaria e confirme **403**, assim como ativar/desativar professor.
6. Teste em homologação (com caixas de correio de teste nos quatro perfis): saída, +5 minutos, +15 minutos, retorno com atraso. Confira 1 e-mail por evento/endereço; duas turmas distintas; vários professores; professor desvinculado; falha temporária do Brevo; e que o retorno normal ainda avisa os responsáveis. Nunca force horários fictícios diretamente em produção.
7. A reversão isolada da fila é `database/migration_alertas_email_down.sql` **somente se estiver vazia**. A reversão completa em `migration_professores_down.sql` também bloqueia exclusão de dados dessa fila. As estruturas antigas `alerta_atraso_enviado` e `aviso_pais_atraso_enviado` permanecem no banco por compatibilidade, mas não controlam mais esses três novos e-mails.

**Arquivos desta revisão:** `api/professoresRotas.js`, `controller/usuariosController.js`, `controller/pedidosController.js`, `model/pedidosModel.js`, `model/alertasEmailModel.js` (novo), `utils/agendador.js`, `utils/alertasEmail.js` (novo), `public/secretaria.html`, `public/professores-admin.html`, `public/js/general/secretaria.js`, `public/js/general/professores-admin.js`, SQL acima e `tests/alertasEmail.test.js` (novo). **Sem bibliotecas novas.**

---


> **Versão preparada para homologação.** Código incluído integralmente neste projeto, sem conexão com o banco de produção e sem deploy automático. Migração **não foi executada no Railway**. Faça backup e valide primeiro numa cópia do banco.

## 1. Sistema encontrado e suposições

**Stack:** Node.js/CommonJS, Express 5, MySQL com mysql2/promise, páginas HTML/CSS/JavaScript puro, JWT/bcrypt; polling via `setInterval` (15 segundos), tarefas em `utils/agendador.js` (1 minuto para atraso, 5 minutos para recorrentes); e-mail via `utils/email.js`, com preferência por Brevo API HTTPS (`BREVO_API_KEY`), alternativa SMTP. Hospedagens discutidas: Render (Node) e Railway (MySQL).

**Fluxo existente:** responsável (`PAI`) solicita; `SECRETARIA` ou `ADMIN` aprova (`PENDENTE -> APROVADA`) ou recusa (`PENDENTE -> RECUSADA`); portaria (`PORTARIA`, com alias legado `PORTEIRO`) registra saída (`APROVADA -> EM_SAIDA`), retorno (`EM_SAIDA -> CONCLUIDA`) e **também podia cancelar pedido aprovado** (`APROVADA -> CANCELADA`), com motivo obrigatório. O perfil `ADMIN` mantém atribuições administrativas. **Não existe conta de aluno**; o aluno é uma entidade na tabela `alunos`, vinculada a `turmas` por `alunos.turma_id`. Um aluno sai e volta sozinho; nenhum sistema de retirada por terceiro é acrescentado.

**Suposições:** (a) sala = turma já registrada em `turmas`; (b) professor **só acompanha**, nunca aprova/recusa; (c) pedidos de hoje e pedidos não retornados de dias anteriores determinam o estado atual; (d) `ATRASADO` significa mais de 5 minutos após o retorno previsto; `NÃO VOLTOU`, mais de 15 minutos; (e) o cancelamento de pedido aprovado passa para a secretaria, sem apagar dados históricos; (f) professores recebem os três alertas críticos por e-mail, além dos comunicados internos; saída/retorno no prazo continuam apenas no fluxo normal de e-mail aos responsáveis.

## 2. Banco de dados — SQL, motivos e dados preexistentes

**Na instalação nova execute `database/migration_professores_up.sql`; se o módulo dos professores já existe, execute só `database/migration_alertas_email_up.sql`.**

1. `ALTER TABLE usuarios ... ENUM(...,'PROFESSOR')` — adiciona novo papel à autenticação existente, sem mexer em usuários atuais; mantém o alias legado `PORTEIRO`.
2. `CREATE TABLE professores_turmas` — liga professores (`usuarios.id_usuario`) às turmas já cadastradas (`turmas.id_turma`) em relação **N:N**. PK composta `(professor_id,turma_id)`, índice por turma, FKs `ON DELETE RESTRICT`.
3. `CREATE TABLE comunicados_professores` — um comunicado destinado a um professor por pedido, tipo e turma. Colunas `comunicado_id`, `professor_id`, `aluno_id`, `turma_id`, `pedido_id`, `tipo`, `mensagem`, `data_evento`, `lido`, `lido_em`. FK para usuários, alunos, turma e pedidos. A chave `UNIQUE (professor_id,pedido_id,tipo)` torna os eventos idempotentes. Índices por professor/data, professor/lido, turma, aluno, tipo/data.

**Não há necessidade de criar** `salas`, `alunos_turmas` nem coluna adicional em `pedidos_saida`: já existem `turmas`, `alunos.turma_id`, `pedidos_saida.turma_id` e `pedidos_saida.aluno_id` na estrutura atual. `schema.sql` recebeu apenas o novo tipo de usuário e uma nota sobre a migration; **não execute o schema inteiro sobre um banco de produção**.

**Dados existentes:** alunos sem turma permanecem sem turma e não aparecem no painel de professor até a secretaria vinculá-los. Turmas sem professor continuam intactas, mas não produzem comunicado docente. Pedidos antigos continuam armazenados com seus estados e seu histórico existentes; **não são gerados comunicados retroativos automaticamente**. Novos comunicados são criados somente para eventos após a migration e o deploy, ou atrasos ainda abertos que o agendador encontrar. Pedidos recorrentes seguem funcionando e suas aprovações geram avisos normalmente. Várias saídas no mesmo dia têm IDs de pedido diferentes, logo criam comunicados independentes. Caso haja alunos históricos sem `aluno_id`, não serão mostrados no painel atual do professor; os dados originais não são modificados.

**Rollback:** `database/migration_professores_down.sql` reverte a estrutura **somente se** as três tabelas estiverem vazias e não houver usuários `PROFESSOR`; caso contrário, bloqueia o rollback para não destruir dados. Para uma reversão após utilização real, faça backup e planeje migração/arquivamento dos novos registros antes de remover as tabelas. MySQL não garante rollback transacional de `ALTER TABLE`/`CREATE TABLE`; não rode scripts SQL parcialmente sem conferir a estrutura.

**Seed:** `database/seed_professores_demo.js` cria um professor fictício, duas turmas fictícias e três alunos fictícios; é **idempotente para os dados previstos** e requer `ALLOW_DEMO_SEED=1`. Rode **apenas em banco de teste isolado**, nunca no banco principal do SENAI. Credenciais fictícias estão no script para teste local e devem ser substituídas após o primeiro acesso.

## 3. Alterações arquivo por arquivo

### Criados

| Arquivo | Função |
|---|---|
| `database/migration_professores_up.sql` | Novo papel e tabelas/indexes/FKs |
| `database/migration_professores_down.sql` | Reversão conservadora sem exclusão de dados existentes |
| `database/seed_professores_demo.js` | Professor, duas salas, três alunos para banco de testes |
| `api/professoresRotas.js` | Rotas distintas para professor autenticado e ADMIN |
| `controller/professoresController.js` | Validação, criação de contas/vínculos, leitura e marcação de avisos |
| `model/professoresModel.js` | Queries parametrizadas e escopo professor↔turmas; idempotência dos avisos |
| `public/professor.html` | Novo painel + histórico de comunicados + filtros |
| `public/js/general/professor.js` | Polling, filtro de sala/aluno/tipo/data, paginação, não lidos |
| `public/css/professor.css` | Estilo complementar alinhado à secretaria e à portaria |
| `public/professores-admin.html` | Cadastro e vínculo N:N gerenciados por ADMIN |
| `public/js/general/professores-admin.js` | Formulário/lista de professores, manutenção das turmas |
| `.env.example` | Exemplo de configuração SEM senhas reais |
| `tests/professores.test.js`, `tests/portaria.test.js` | Testes sem banco para escopo e permissões |
| `GUIA_IMPLEMENTACAO_PROFESSORES.md` | Este guia |

### Modificados

| Arquivo | Alteração |
|---|---|
| `database/schema.sql` | `PROFESSOR` na enumeração inicial; migrations continuam separadas |
| `index.js` | Registra `/api/professores` no Express |
| `middlewares/authenticar.js` e `model/usuariosModel.js` | Verificação contínua de perfil ativo e papel real no MySQL (não confiar no papel antigo do token) |
| `model/pedidosModel.js` | Transições atômicas em transação com histórico e notificação; proteção contra concorrência; seleção de atrasados |
| `utils/agendador.js` | Cria comunicado de atraso e não retorno e envia alertas aos quatro grupos em fila persistente |
| `controller/pedidosController.js` | Portaria limitada no backend a status permitidos; impede consulta de pendentes/recusados/cancelados e histórico indevido; transfere cancelamento à secretaria |
| `api/pedidosRotas.js` | Cancelamento passa à secretaria, aprovar/recusar continuam exclusivos; criação por pai/equipe |
| `api/alunosRotas.js`, `api/turmasRotas.js` | Leitura geral de dados restrita à secretaria/admin para não permitir que professor contorne filtro de turmas |
| `api/responsaveisRotas.js`, `api/pedidosRecorrentesRotas.js` | Mantêm funcionalidades do pai com autorização explícita por perfil |
| `controller/usuariosController.js` | Login de professor; somente ADMIN pode cadastrar ou alterar status de professores, inclusive em endpoints genéricos |
| `public/portaria.html`, `public/js/general/portaria.js`, `public/css/portaria.css` | Remove ação/diálogo/código de cancelar e histórico de cancelados; mantém saídas, retornos e concluídas |
| `public/secretaria.html`, `public/js/general/secretaria.js` | Acesso ao cadastro de professores apenas para ADMIN e cancelamento com justificativa no histórico de pedidos aprovados |
| `public/js/general/index.js`, `public/js/general/selecionar-painel.js` | Encaminha professor ao painel próprio e mantém seleção ADMIN existente |

### Removidos

**Nenhum arquivo existente**. Apenas trechos relativos à decisão de cancelamento na portaria foram retirados.

O **código completo** de todos os arquivos listados está no ZIP de entrega. Para ver alterações de modo pontual em arquivos grandes, use também o arquivo patch (`alteracoes_portaria_professores.patch`) enviado junto; ele compara o projeto atualizado com a versão do ZIP original.

## 4. Rotas e regras de funcionamento

### Portaria (JWT `PORTARIA`/`PORTEIRO`)

- `GET /api/pedidos/listarPorStatus?status=APROVADA` — autorização vigente, aguardando sair.
- `GET /api/pedidos/listarPorStatus?status=EM_SAIDA` — já saiu, aguardando voltar.
- `GET /api/pedidos/listarPorStatus?status=CONCLUIDA` — histórico final de saídas.
- `GET` com `PENDENTE`, `RECUSADA`, `CANCELADA`, sem status ou com outro valor retorna **403**.
- `PUT /api/pedidos/liberar/:id` — só para pedido `APROVADA`, registra horário, envia e-mail aos responsáveis (fora do caminho crítico).
- `PUT /api/pedidos/retorno/:id` — só para `EM_SAIDA`, registra retorno; e-mail aos responsáveis continua independente.
- `PUT /api/pedidos/aprovar/:id`, `/rejeitar/:id` e `/cancelar/:id` são **403** com token da portaria.
- Consulta genérica do solicitante por portaria retorna **403**; consulta de histórico de um pedido não aprovado retorna **404**.

### Secretaria / administração

- Mantém `PUT /api/pedidos/aprovar/:id` e `PUT /api/pedidos/rejeitar/:id`.
- Novo comportamento: `PUT /api/pedidos/cancelar/:id` restrito à secretaria/admin, somente para `APROVADA`, com `observacao` de até 500 caracteres e e-mail ao solicitante, como no fluxo anterior.
- Menu **Professores e Turmas** (visível somente para **ADMIN**) → `professores-admin.html`:
  - `GET /api/professores` — professores existentes e seus vínculos;
  - `POST /api/professores` — cria professor e associa `turmas: [1,2]`;
  - `PUT /api/professores/:id/turmas` — substitui lista de vínculos, com verificação de cada turma e transação;
  - turmas/alunos existentes seguem gerenciados pela secretaria.
- Desativar perfil `PROFESSOR` pode ser feito **apenas por ADMIN**, na tela de **Gerenciar Perfis**.

### Professor (JWT `PROFESSOR`)

- `GET /api/professores/minhas-turmas` — lista turmas que o professor logado acompanha.
- `GET /api/professores/painel` — situação de alunos **somente nas turmas vinculadas**: `DENTRO`, `SAIU`, `ATRASADO`, `NAO_RETORNOU`, horários reais/previstos.
- `GET /api/professores/comunicados?turma_id=...&aluno_id=...&tipo=...&data=AAAA-MM-DD&pagina=1` — histórico filtrável de avisos, últimos primeiro, **50 por página**, contador global de não lidos.
- `PUT /api/professores/comunicados/:id/lido` — só altera o comunicado pertencente ao próprio professor **e à turma ainda vinculada**. Acesso a outro professor/turma retorna **404**.
- O professor não recebe permissão para `/api/pedidos/*` nem consultas gerais de turmas/alunos.

### Eventos

| Origem | Evento interno do professor | Estado do pedido |
|---|---|---|
| Secretaria aprova | `APROVADA` | `APROVADA` |
| Portaria registra saída | `SAIDA` | `EM_SAIDA` |
| Retorno atrasado em +5 min | `ATRASADO` | `EM_SAIDA` (ou comunicado gerado no momento do retorno, se o agendador não rodou) |
| Não retorno em +15 min | `NAO_RETORNOU` | `EM_SAIDA` |
| Portaria registra retorno | `RETORNO` | `CONCLUIDA` |

**Atrasado/não voltou são situações calculadas, não novos valores do enum `pedidos_saida.status`.** Isso preserva relatórios, pedidos recorrentes e e-mails existentes. Se o aluno não tiver horário previsto de retorno, a aplicação só o mostra como `SAIU` até registrar a volta, sem presumir atraso. Uma turma com dois professores gera avisos individuais para ambos; professor sem turma não vê alunos. Eventos anteriores à atribuição do professor não são retroativos; vinculá-lo hoje não cria mensagens antigas.

## 5. Ordem exata de aplicação e comandos

1. **Faça backup completo do banco** e confirme que é possível restaurá-lo. Exemplo no Git Bash (substituir valores, jamais cole senha no comando):

   ```bash
   mysqldump -h SEU_HOST -P SUA_PORTA -u SEU_USUARIO -p --single-transaction --routines --triggers SEU_BANCO > backup_antes_professores.sql
   ```

2. **Crie um banco de homologação separado** restaurando o backup, sem disparar e-mails reais a responsáveis. Não use o banco de produção para o seed.
3. Com o serviço Render **ainda rodando a versão antiga**, aplique `database/migration_professores_up.sql` no banco desejado usando **MySQL Workbench** (abrir arquivo SQL e executar) ou MySQL CLI no Git Bash:

   ```bash
   mysql -h SEU_HOST -P SUA_PORTA -u SEU_USUARIO -p SEU_BANCO < database/migration_professores_up.sql
   ```

   O script não tem `USE projetocodemasters`: usará o banco selecionado, compatível com `DB_NAME=railway`.

4. Valide no Workbench:

   ```sql
   SHOW COLUMNS FROM usuarios LIKE 'tipo_usuario';
   SHOW TABLES LIKE 'professores_turmas';
   SHOW TABLES LIKE 'comunicados_professores';
   ```

5. Instale dependências existentes e rode testes estáticos (sem atualizar dependências):

   ```bash
   npm ci
   node --test tests/*.test.js
   node --check index.js
   ```

   No PowerShell, se o `*` não expandir, rode `node --test tests/professores.test.js tests/portaria.test.js`.

6. Confira `.env`/variáveis do Render. **Nenhuma variável nova é obrigatória**: use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `TZ_ESCOLA`, `BREVO_API_KEY` conforme sua configuração atual. O `.env` real **não veio no ZIP e não foi modificado**. É prudente rotacionar as credenciais após o incidente do Railway; atualize Render/Railway de forma coordenada.
7. **Faça o deploy do código atualizado** no Render só após a migration. Os scripts de migration nova **não são executados por `utils/migrar.js`**; essa etapa é manual. Verifique logs do Render antes de liberar o sistema.
8. Logado como **ADMIN**, abra `Professores e Turmas`; cadastre os professores reais, associe as turmas e confira se cada aluno já tem `turma_id` correto. Faça login de professor em `professor.html`.
9. Somente em banco de testes, se quiser dados de demonstração, rode:

   ```bash
   ALLOW_DEMO_SEED=1 node database/seed_professores_demo.js
   ```

   **PowerShell**: `$env:ALLOW_DEMO_SEED='1'; node database/seed_professores_demo.js; Remove-Item Env:ALLOW_DEMO_SEED`.

10. Não reexecute `schema.sql` em produção. Não faça commit de `.env`, dumps, backups ou credenciais.

## 6. Roteiro de testes manuais (ambiente de homologação)

| Nº | Perfil / ação | Resultado esperado |
|---|---|---|
| 1 | ADMIN acessa tela **Professores e Turmas** e cadastra professor | Novo perfil `PROFESSOR`; login JWT próprio; aparece em gerenciamento de perfis |
| 2 | Vincula professor A às turmas 1 e 2; professor B só à turma 2 | A vê as duas; B vê só a 2; ambos recebem avisos da turma 2 |
| 3 | Professor sem turma faz login | Painel vazio, mensagem informativa; não vê outra turma |
| 4 | Aluno sem turma e turma sem professor | Não geram avisos nem vazamentos para docentes |
| 5 | Professor tenta `/api/alunos/buscarTodos` e `/api/turmas` com JWT próprio | **403**, apenas suas rotas `/api/professores` funcionam |
| 6 | Professor tenta mudar `turma_id` da URL para uma não vinculada | Nenhum aluno/comunicado dessa turma aparece; dados filtrados no backend |
| 7 | Professor A tenta marcar comunicado do professor B como lido | **404**; não muda a leitura de B |
| 8 | Responsável solicita saída; secretaria NÃO aprova | Portaria não enxerga o pedido; `/listarPorStatus?status=PENDENTE` com JWT portaria retorna **403** |
| 9 | Secretaria recusa pedido | Portaria não enxerga; e-mail da recusa continua funcionando |
| 10 | Secretaria aprova | Pedido aparece na portaria; professor recebe `APROVADA` |
| 11 | Portaria clica **Registrar Saída** | Status `EM_SAIDA`; horário real; e-mail do responsável preservado; professor recebe `SAIDA` |
| 12 | Portaria registra retorno no prazo | Status `CONCLUIDA`; e-mail ao responsável; professor recebe `RETORNO`; aluno volta a `DENTRO` |
| 13 | Ultrapassa 5 min do retorno previsto | Professor vê `ATRASADO`; todos os quatro públicos recebem e-mail individual |
| 14 | Ultrapassa 15 min sem retorno | Professor vê `NAO_RETORNOU`; todos recebem novo e-mail; pedido continua `EM_SAIDA` até a portaria registrar retorno |
| 15 | Faça polling por 3 minutos com mesmo aluno atrasado | Só **um** comunicado por professor/tipo/pedido, não multiplica |
| 16 | Aluno faz duas saídas distintas no mesmo dia, com pedidos diferentes | Dois eventos independentes, horários corretos; painel prioriza quem ainda está fora |
| 17 | Atrasado retorna enquanto app reinicia/agendador falha | Retorno salvo, comunicado `ATRASADO` registrado se >5 min, e `RETORNO` aparece por último |
| 18 | Secretaria cancela pedido aprovado | Não aparece na portaria; cancelamento e e-mail do responsável seguem disponíveis na secretaria |
| 19 | Portaria tenta aprovar, rejeitar ou cancelar por URL/API | **403**, mesmo que altere HTML manualmente |
| 20 | Duas pessoas tentam registrar a mesma saída simultaneamente | Uma transição funciona; a outra retorna **409** e não duplica histórico/comunicados |
| 21 | Professor filtra por data, aluno, tipo, turma, navega páginas | Retorna resultados corretos com ordenação decrescente e 50 por página |
| 22 | Professor marca um aviso como lido, atualiza/reabre | Contador diminui, `lido_em` permanece preenchido |
| 23 | ADMIN desativa o perfil do professor | JWT em uso passa a receber **403**; nenhuma informação exibida de novas chamadas |
| 24 | Falha do Brevo (ambiente de testes) | Saída/retorno continuam registrando; alertas ficam em fila com retry e erro nos logs |
| 25 | Crie horário fixo/recorrente do responsável | Pedido continua pendente da secretaria; após aprovação, a portaria e professores recebem apenas o fluxo esperado |
| 26 | Teste a página em largura de celular e desktop | Tabelas roláveis, menu responsivo, filtros e botões acessíveis |
| 27 | Após migrations sem professor cadastrado | Secretaria e portaria continuam operando normalmente, sem exigência de turma vinculada |

## 7. Pontos de atenção, riscos e melhorias opcionais (não implementadas)

- **Banco real não testado aqui**. Os testes `node --test tests/*.test.js` são *unitários com mocks*; confirme as queries SQL, triggers existentes e migração em cópia fiel do seu MySQL no Railway antes de produção.
- **Migração manual obrigatória**: se o código for publicado antes do SQL, o fluxo de aprovar/liberar/retornar pode retornar erro por tabela ausente, apesar do deploy aparecer saudável.
- **Classificação operacional** de `NÃO VOLTOU` adotada como >15 minutos; não significa desaparecimento, nem diagnóstico de segurança. Para alunos sem horário de volta, nenhum atraso é inferido.
- **E-mails de alerta para professor estão implementados**, somente nas três ocorrências críticas; seguem a configuração de envio já existente (Brevo via HTTPS ou SMTP).
- **Não há grade horária de docentes**: vínculo é por turma, não pelo professor que está ministrando aula no minuto da saída.
- **Histórico dos comunicados é limitado ao período após implantação**. Não foram gerados avisos antigos para evitar atribuir eventos a professores que não eram responsáveis na data.
- **Mudança de turma**: a situação atual usa `alunos.turma_id`; cada comunicado mantém a turma do pedido da época. A alteração de vínculos pode impedir a visualização posterior de avisos de uma turma removida, mas não exclui mensagens.
- **Remoção física de usuários/turmas/pedidos** pode ser restringida pelas novas FKs; preferir desativação por status, como a secretaria já faz, para manter auditoria.
- **Atualização:** o painel faz polling a cada 15 s, o agendador identifica atrasos a cada ~60 s. Não há garantia de notificações instantâneas. Uma fila transacional de e-mails, paginação por cursor e integração com grade horária seriam expansões futuras.
- **Segurança do ambiente:** não coloque o arquivo `.env` em repositórios nem nos anexos. Após o comunicado de segurança do Railway, planeje rotação de DB_PASSWORD, chaves Brevo e JWT_SECRET; a rotação do JWT invalida sessões ativas.

