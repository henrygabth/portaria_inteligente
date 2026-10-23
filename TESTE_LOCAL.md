# Portaria Inteligente — teste local antes do Render

A pasta foi preparada para rodar **no computador com `node index.js`**, mantendo o login JWT, as telas da portaria/secretaria/admin/professor e a API normal. **Não precisa do Render para testar.**

## ATUALIZAÇÃO — acesso ao MySQL da rede 10.87.100.6

Nesta versão, **não é necessário copiar o .env antes da primeira execução**.
No PowerShell, dentro da pasta do projeto, execute `node index.js`.
Se as configurações estiverem ausentes, o sistema perguntará:

- IP MySQL: `10.87.100.6` (Enter para aceitar);
- porta: `3306` (Enter para aceitar);
- **usuário DO MYSQL** (não confundir com a conta `aluno` do Windows);
- banco: `projetocodemasters_novo`;
- confirmação de que essa é uma **base isolada de testes**, se estiver em outra máquina;
- senha DO MYSQL, digitada com caracteres ocultos.

A configuração salva em `.env` será reaproveitada nas próximas execuções. **Nunca publique o `.env` no GitHub ou envie senha em chat.** O assistente desliga migrações automáticas, agendador e e-mails reais, e não altera tabelas.

Se o IP for apenas o endereço do computador e não de um **servidor MySQL**, use o endereço correto do servidor. Caso o MySQL negue acesso remoto ou a base de dados não tenha as migrations novas, será necessário corrigir isso antes de testar as telas.

## 1. Banco MySQL que já existe

Seu banco informado é `projetocodemasters_novo`. **Não execute** `database/instalar_banco_local.sql`, pois este instalador foi feito para um banco separado e novo.

Antes de testar, faça um backup do banco existente. Como o projeto contém novos recursos de professores e fila de alertas, confira se as tabelas `professores_turmas`, `comunicados_professores` e `alertas_email_envios` já existem. Se não existirem, aplique as migrations apropriadas **em uma cópia do banco**, depois de revisar o SQL.

O comando `node index.js` apenas funciona quando a conexão e a estrutura necessárias estiverem prontas; esta versão não aplica migrations automaticamente.

## 2. Criar o `.env`

Normalmente, a primeira execução de `node index.js` cria `.env` por meio do assistente. Se preferir configurar manualmente, copie `.env.local.example` para `.env` e preencha as credenciais do MySQL.

Preencha as credenciais **do MySQL de teste** em `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME=projetocodemasters_novo`. Gere uma string longa, aleatória e própria para `JWT_SECRET` (não reutilize a chave da produção).

Para uso local, mantenha:

```dotenv
MODO_TESTE_LOCAL=1
PORTA=3000
MIGRACAO_AUTOMATICA=0
AGENDADOR_ATIVO=0
```

O modo local:

- **Não envia e-mails reais**, inclusive os avisos de atraso/não retorno; registra `[email][SIMULADO]` no terminal.
- **Não inicia o agendador automaticamente** e, portanto, não gera pedidos recorrentes ou verifica atrasos sem sua escolha. Para testar esses dois recursos num banco isolado, altere para `AGENDADOR_ATIVO=1` e reinicie; os e-mails continuarão simulados.
- **Não aplica migrações automaticamente**, evitando alterações inesperadas.
- **Bloqueia conexões a MySQL remoto**. Para banco de teste *realmente isolado* hospedado remotamente, defina `PERMITIR_BANCO_REMOTO_TESTE=1`. **Nunca use essa opção apontando para seu banco Railway de produção**.

## 3. Instalar e iniciar

```powershell
npm ci
node index.js
```

Quando aparecer `Servidor rodando em http://localhost:3000`, abra no navegador:

- Home: http://localhost:3000/
- Login: http://localhost:3000/login.html
- Verificação de execução: http://localhost:3000/api/saude

Você deve ver `Conexão MySQL estabelecida` e `Estrutura necessária ... OK`. Se o banco estiver inacessível ou as tabelas faltarem, o programa mostrará a causa e **não iniciará falsamente**.

Para parar, pressione **Ctrl+C**.

## 4. Criar contas fictícias para o fluxo inteiro

Execute **somente em cópia isolada do MySQL para testes** e com o servidor parado ou em outro terminal:

```powershell
$env:ALLOW_DEMO_SEED="1"
node database/seed_professores_demo.js
Remove-Item Env:ALLOW_DEMO_SEED
```

O seed gera um professor vinculado a **duas turmas**, três alunos e contas fictícias para **ADMIN, SECRETARIA, PORTARIA e RESPONSÁVEL**. Todos têm senha inicial `Troque-esta-senha-123!` e e-mails terminados em `@example.invalid`; são dados exclusivos de demonstração:

| Perfil | Login |
|---|---|
| ADMIN | `admin.demo@example.invalid` |
| SECRETARIA | `secretaria.demo@example.invalid` |
| PORTARIA | `portaria.demo@example.invalid` |
| PAI/RESPONSÁVEL | `responsavel.demo@example.invalid` |
| PROFESSOR | `professor.demo@example.invalid` |

Essa senha deve ser usada **somente para teste**, nunca em produção. O seed exige `MODO_TESTE_LOCAL=1` e `ALLOW_DEMO_SEED=1` e não deve ser enviado ao banco real.

## 5. Testar o fluxo no navegador

1. Entre como **PAI** e crie a solicitação de um dos três alunos demo, com saída e retorno previstos próximos (escolha um horário futuro).
2. Entre como **SECRETARIA**: o pedido pendente deve aparecer e permitir aprovação ou recusa.
3. Entre como **PORTARIA**: somente pedidos aprovados devem aparecer. Registre saída e, depois, retorno. Não deve existir botão para aprovar ou recusar.
4. Entre como **PROFESSOR**: observe a situação dos alunos das turmas vinculadas, os avisos e a opção de marcar como lido.
5. Entre como **ADMIN**: gerencie os vínculos professor↔turma. O perfil SECRETARIA não pode fazer isso.
6. Para simular avisos automáticos de **atraso/não retorno**, habilite `AGENDADOR_ATIVO=1` **somente no banco de teste**, reinicie o servidor e use pedidos com retorno previsto vencido. Os e-mails serão simulados no console; os comunicados ficarão registrados no MySQL.
7. Para testar pedidos recorrentes, crie um horário fixo no perfil responsável e habilite o agendador no banco isolado.

Se e-mails aparecerem como `SIMULADO`, **isso significa que nenhum e-mail foi de fato entregue**. Esse é o comportamento intencional de testes.

## 6. Rodar testes de código

```powershell
npm test
```

Se aparecer `EADDRINUSE: 3000`, feche a outra instância do Node ou altere `PORTA=3001` no `.env`.

**Produção:** não copie `.env` local para o Render. Sem `MODO_TESTE_LOCAL=1`, o funcionamento anterior (agendador e envio real de e-mails) continua. Antes de publicar, faça backup do banco e aplique as migrations com cuidado.
