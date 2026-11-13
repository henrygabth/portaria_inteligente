# Atualização: comunicados dos professores, chat em tempo real e integração

Nenhuma dependência nova foi adicionada (`package.json` e `package-lock.json` não mudaram).
O tempo real usa Server-Sent Events (SSE) em cima do Express que já existe.

## O que mudou

### Comunicados dos professores
- **Recusa e cancelamento agora geram comunicado** (`RECUSADA`, `CANCELADA`), com o motivo e, para
  liberação para casa, texto próprio. Antes a recusa nunca chegava ao professor.
- `registrarEvento` **não usa mais `INSERT IGNORE`**. Ele escondia erros (turma, ENUM, chave estrangeira)
  e o comunicado simplesmente não aparecia. Agora só o duplicado esperado é ignorado
  (`ON DUPLICATE KEY`); qualquer outro erro vai para o log como `[comunicados] FALHA ...`.
- A falha de um comunicado **não derruba** a decisão da secretaria nem a saída da portaria: a ação vale,
  o erro fica no log e o agendador grava o comunicado que faltou (**reconciliação a cada 5 minutos**,
  sem duplicar, por causa da chave única).
- O ENUM `comunicados_professores.tipo` passa a ter `CASA`, `RECUSADA` e `CANCELADA` (a migração
  corrige também o `CASA`, caso o ALTER antigo tenha falhado).
- Tela do professor: novos tipos na lista e no filtro, rótulo de reserva para tipo desconhecido
  (nunca mais "undefined") e notificação do navegador com a aba em segundo plano.

### Chat em tempo real (responsável ↔ secretaria)
- Mensagem é **gravada no MySQL primeiro** e só depois emitida. O destinatário recebe na hora,
  sem recarregar e sem esperar consulta periódica.
- Conexão `GET /api/tempo-real/eventos`, autenticada pelo JWT no cabeçalho (token nunca na URL), com
  reconexão automática e fechamento quando o token expira. Ao reconectar, a tela recarrega do banco.
- Contador de não lidas, aviso visual (toast) e notificação do navegador (só se o usuário permitir).
- **Sem duplicar:** o navegador envia `client_uuid`; reenviar a mesma mensagem devolve a já gravada.
- Secretaria só inicia conversa com responsável **ativo e com aluno vinculado** (ou que já tenha conversa).
- O polling antigo continua como **rede de segurança** (só trabalha forte se o tempo real cair).

### Integração entre painéis
- Pedido novo, aprovado, recusado, saída e retorno atualizam **secretaria, portaria e o responsável**
  na hora (evento `pedido`), e os professores da turma recebem o evento `comunicado`.

## Banco de dados (Aiven)
Mudanças **somente aditivas**: nada é apagado ou recriado.

| Tabela | Mudança |
|---|---|
| `comunicados_professores` | ENUM `tipo` ganha `RECUSADA` e `CANCELADA` (e `CASA`, se faltar) |
| `chat_mensagens` | coluna `client_uuid VARCHAR(40) NULL` + índice único `(remetente_id, client_uuid)` |

O servidor aplica isso sozinho ao iniciar (`utils/migrar.js`, só o que faltar).
Se preferir aplicar à mão: `database/migration_tempo_real_up.sql` (cada comando uma única vez).
Reversão: `database/migration_tempo_real_down.sql` (não reverte o ENUM, de propósito).

## Como publicar (passo a passo)
1. **Faça backup do banco no Aiven** (snapshot/backup do serviço) antes de qualquer coisa.
2. Substitua os arquivos do projeto pelos deste zip e faça o deploy normal (git push / Render).
   Não precisa de `npm install` novo.
3. Ao subir, confira no log do Render:
   - `[migrar] comunicados_professores.tipo atualizado ...` (primeira vez) e
     `[migrar] Coluna criada: chat_mensagens.client_uuid` / `Índice criado: ...`;
   - **não** deve aparecer `[migrar] Não foi possível atualizar ...`. Se aparecer, aplique o SQL manual.
4. Variáveis de ambiente: **nenhuma nova**.
5. Render: use **uma instância** (o tempo real vive na memória do processo). No plano gratuito o serviço
   "dorme"; ao acordar, as telas reconectam sozinhas e recarregam do banco.
6. Se houver proxy/CDN na frente, ele não pode armazenar a resposta de `/api/tempo-real/eventos`
   (o servidor já envia `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no`).

## Testes
`npm test` → 55 testes (40 antigos + 15 novos), todos passando no ambiente de desenvolvimento.
Eles **não usam MySQL real**: o banco é simulado. O servidor SSE dos testes é real (porta local).
Dois testes antigos foram atualizados porque o comportamento mudou de propósito
(`INSERT IGNORE` → `ON DUPLICATE KEY`; `enviar` do chat agora devolve `{ id, duplicada }`).

## Ainda não verificado (precisa de você, com banco real)
- Rodar o fluxo completo (almoço, casa, recusa, chat) em um banco de teste/cópia do Aiven.
- Conferir no Aiven a causa real dos comunicados que não apareciam (consultas de diagnóstico abaixo).
- `config/banco.js` **não tem `ssl`** e não foi alterado: confirme como a produção conecta ao Aiven.

```sql
SHOW COLUMNS FROM comunicados_professores LIKE 'tipo';
SELECT tipo, COUNT(*) FROM comunicados_professores GROUP BY tipo;   -- tipo vazio = ENUM desatualizado
SELECT u.id_usuario, u.nome FROM usuarios u
  LEFT JOIN professores_turmas pt ON pt.professor_id = u.id_usuario
 WHERE u.tipo_usuario = 'PROFESSOR' AND pt.professor_id IS NULL;     -- professor sem turma
SELECT (SELECT COUNT(*) FROM alunos WHERE turma_id IS NULL) AS alunos_sem_turma,
       (SELECT COUNT(*) FROM pedidos_saida WHERE turma_id IS NULL) AS pedidos_sem_turma;
```
