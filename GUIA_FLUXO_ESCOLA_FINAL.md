# Portaria Inteligente — fluxo escolar revisado

## O que foi implementado

### 1. Validação com a Ivone
O arquivo `VALIDACAO_FLUXO_IVONE.md` contém o roteiro da conversa para validar o fluxo real da escola, tempos de tolerância e responsabilidades institucionais.

### 2. Portaria sem poder de aprovação
Aprovação e recusa continuam exclusivas de SECRETARIA/ADMIN no backend.
A portaria consulta apenas `APROVADA`, `EM_SAIDA` e `CONCLUIDA` e o botão foi renomeado de **Liberar** para **Registrar Saída**, deixando claro que a decisão já veio da secretaria.

### 3. Atraso / não retorno e rastreabilidade
- +5 minutos: `ATRASADO`.
- +15 minutos: `NAO_RETORNOU`.
- retorno após tolerância: `CHEGOU_ATRASADO`.
- e-mails individuais para responsáveis, secretaria, professores da turma e portaria.
- nova tabela `ocorrencias_pedidos` registra quando cada ocorrência foi detectada e quando atraso/não retorno foi resolvido pelo registro de retorno.
- a secretaria/admin pode abrir **Ver alertas** no histórico para visualizar ocorrências e estado dos e-mails (pendente, enviado, descartado etc.).

### 4. Professor
O professor vê somente alunos das turmas vinculadas a ele e recebe no painel comunicados de:
- saída aprovada;
- saída registrada;
- retorno registrado;
- atraso;
- não retorno.

O painel atualiza automaticamente a cada 15 segundos.

## Ordem para atualizar um banco que já existe

1. Faça backup do MySQL.
2. Se o módulo professor ainda não existir, execute `database/migration_professores_up.sql`.
3. Se a fila de alertas ainda não existir, execute `database/migration_alertas_email_up.sql`.
4. Execute `database/migration_ocorrencias_responsabilidade_up.sql`.
5. Publique o código.
6. Rode `npm test` antes do deploy.

## Observação importante
A migration de ocorrências adiciona rastreabilidade, mas o código foi escrito para que uma falha nessa auditoria não impeça a portaria de registrar o retorno nem impeça o envio operacional dos alertas.
