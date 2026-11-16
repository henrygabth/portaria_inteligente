# Novidades: relatórios, senha no 1º acesso, avisos de mensagem e chat com a portaria

## 1. Relatórios (secretaria → "Relatórios")
- Período livre ou atalhos (Hoje, Ontem, 7 dias, 30 dias, Este mês) e filtro por turma.
- "Situação agora" separada do período: pendentes, aprovadas que ainda não saíram, fora da escola e atrasados.
- Indicadores do período: pedidos, saídas, % que voltou no horário, atrasos, tempo médio fora e tempo de resposta da secretaria.
- Gráficos: saídas por dia (com atraso destacado), horário das saídas, retornos, turmas e motivos; alunos com mais saídas.
- Tabela com todos os pedidos (busca e filtros), planilha CSV (abre no Excel) e impressão/PDF em A4.
- API: `GET /api/relatorios?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&turma=ID` (SECRETARIA/ADMIN, até 1 ano).

## 2. Troca de senha obrigatória no primeiro acesso
- Contas criadas pela secretaria (senha temporária) vão direto para `trocar-senha.html` no 1º login.
- O servidor recusa qualquer outra ação (403 `trocarSenha`) até a senha nova ser gravada — não dá para "pular" pela tela.
- `POST /api/usuarios/primeira-senha` confere a senha temporária, exige senha forte e diferente, e devolve um token novo.

## 3. Avisos de mensagem nova
- Sino na barra do topo (responsável, secretaria e portaria) com o total de não lidas e atalho para cada conversa.
- Aviso na tela, som curto (pode desligar no sino), "(N)" no título da aba e notificação do navegador com a aba em segundo plano.
- E-mail quando a mensagem fica 2 minutos sem leitura: para o responsável (mensagem da secretaria) e para as secretárias
  (mensagem de responsável). No máximo 1 e-mail a cada 30 min por conversa. Ajuste: `CHAT_AVISO_MINUTOS` no `.env`.

## 4. Chat secretaria ⇄ portaria
- Novo item "Chat com a Portaria" / "Chat com a Secretaria". Canal único entre as equipes; responsáveis não veem.
- Tempo real, respostas rápidas prontas, separação por dia e "visto" (✓✓) quando o outro lado leu.
- API: `GET/POST /api/chat/equipe`, `GET /api/chat/equipe/nao-lidas`.

## Banco de dados
Criado automaticamente ao iniciar o servidor (utils/migrar.js) ou por `database/migration_notificacoes_equipe_up.sql`:
- `chat_mensagens.email_avisado` (nova coluna)
- tabelas `chat_avisos_email`, `chat_equipe` e `chat_equipe_leitura`

---

## Acessibilidade, aplicativo instalável e revisão no celular

### Menu "Como você quer ver o sistema?" (todas as telas)
- Botão redondo no canto inferior esquerdo de **todas** as telas (atalho de teclado **Alt + A**).
- Na **primeira visita** à tela de login, o menu abre sozinho para a pessoa escolher como quer ver o sistema.
- **Cores:** originais, saturadas, sépia, invertidas, para daltônicos e **alto contraste** (fundo preto, texto branco, links e botões em amarelo).
- **Tamanho do texto:** 100%, 110%, 120%, 135% e 150%.
- **Leitura:** espaçar o texto, fonte mais legível, destacar links e foco, guia de leitura, cursor grande, pausar animações.
- **Ouvir:** "Ouvir esta tela" (lê a tela aberta ou o texto selecionado) e "Ler o que eu tocar" (fala o nome do botão/campo), com a voz em português do próprio navegador.
- **Libras:** liga o **VLibras** (intérprete virtual do Governo Federal). Só é baixado quando a pessoa liga a opção. Se a internet falhar, aparece um aviso.
- "Pular para o conteúdo" para quem navega pelo teclado; foco sempre visível.
- As escolhas ficam salvas no aparelho (localStorage `pi-acessibilidade`) e são aplicadas antes de a tela aparecer, então as cores não "piscam".
- Arquivos: `public/js/general/acessibilidade.js` e `public/css/acessibilidade.css`.

### Instalar como aplicativo (PWA)
- `public/manifest.webmanifest`, ícones em `public/img/icones/`, `public/sw.js` e `public/offline.html`.
- No Android/Chrome aparece o aviso **Instalar**. No iPhone, uma dica explica "Compartilhar → Adicionar à Tela de Início".
- Atalhos no ícone do app: "Nova saída" e "Mensagens".
- O service worker **nunca** guarda `/api` em cache, então pedidos, liberações e mensagens são sempre ao vivo. Sem internet aparece a tela "Você está sem internet".
- O app só instala em **HTTPS** (ou localhost).

### Segurança (CSP)
- `utils/seguranca.js` passou a liberar os domínios `vlibras.gov.br` (script, estilo, imagem, conexão e mídia), `worker-src 'self' blob:` e `manifest-src 'self'`.
- O VLibras usa WebGL/WebAssembly, por isso foram incluídos `'unsafe-eval'` e `'wasm-unsafe-eval'`.

### Celular
- Todas as 14 telas foram conferidas em 390 px de largura e nenhuma rola para o lado.
- Foi adicionado espaço no fim do menu lateral e das telas para o botão de acessibilidade não cobrir conteúdo.

### Testes
- `tests/acessibilidadePwa.test.js` (7 testes). Total: **91 testes passando**.

---

## Segurança, notificações no celular, importação e LGPD

### Avisos no celular (mesmo com o sistema fechado)
- **Responsável recebe:** saída aprovada, recusada ou cancelada; filho saiu (com horário); voltou; voltou atrasado; ainda não voltou; mensagem da secretaria.
- **Secretaria/administração recebem:** nova solicitação, atraso no retorno, aluno não retornou, mensagem de responsável e alerta da portaria.
- **Como ativar:** pelo sino ("Receber avisos no celular"), em *Minha Conta → Avisos no celular*, ou no convite que aparece uma vez na tela inicial do responsável. Dá para enviar um teste e desligar quando quiser.
- **iPhone:** funciona depois de instalar o app na tela de início (iOS 16.4 ou mais novo).
- **Técnica:** Web Push padrão (VAPID + criptografia aes128gcm), feito só com o `crypto` do Node, sem biblioteca nova. A criptografia foi conferida com o vetor de teste oficial da RFC 8291.
- **Chaves:** são geradas sozinhas e guardadas no banco. Se quiser fixá-las, use `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (ver `.env.example`).
- **Arquivos:** `utils/push.js`, `utils/avisosPush.js`, `model/pushModel.js`, `api/pushRotas.js`, `public/js/general/push-cliente.js` e `public/sw.js`.

### Atraso no retorno (complemento)
- O e-mail de atraso já existia. Agora o atraso também aparece **na hora** na tela da secretaria e da portaria (sino, som e aviso) e vai como notificação no celular da família e da secretaria.

### Portaria: conferir o rosto antes de liberar
- O botão "Registrar saída" abre a **foto 3x4 grande** com nome, turma, responsável, horários e quem autorizou.
- **"É o aluno"** registra a saída.
- **"Não é este aluno"** não libera, grava na auditoria e avisa a secretaria pelo chat interno e por notificação.
- Aluno sem foto mostra o aviso "confira um documento com foto".

### Importar alunos por planilha
- Fica em *Gerenciar Alunos → Importar planilha*.
- Aceita **.xlsx** (Excel) e **.csv**, lidos no próprio navegador.
- Colunas: Nome e Turma (obrigatórias); Matrícula e Data de nascimento (opcionais). Tem botão para baixar a planilha modelo.
- **Prévia antes de gravar:** novos, já cadastrados (mantidos como estão) e linhas com erro, com o motivo de cada erro.
- Opção "criar as turmas que ainda não existem".
- Até 2000 alunos por vez.

### Auditoria
- Nova tela *Auditoria*, para secretaria e administração.
- **O que fica registrado:**
  - entradas, senhas erradas e códigos errados;
  - aprovações, recusas, cancelamentos, saídas e retornos;
  - cadastros, vínculos, perfis ativados ou desativados;
  - alunos criados, alterados, apagados e importados, e fotos;
  - backups, aceites da LGPD, cópias de dados e exclusões de conta.
- Filtros por período, ação e busca. Exporta CSV (protegido contra fórmulas no Excel).
- Os registros **não podem ser alterados nem apagados**: só existe INSERT.

### Login em duas etapas
- Secretaria e administração, depois da senha, recebem um **código de 6 números por e-mail**.
- O código vale 10 minutos, serve uma vez só e é bloqueado depois de 5 erros.
- Opção "confiar neste aparelho por 30 dias".
- Redefinir a senha pelo link desfaz os aparelhos confiáveis.
- Configurável por `DOIS_FATORES_PAPEIS`; `DOIS_FATORES=desligado` desliga (só para testes).

### Backup e Saúde do sistema
- **Backup automático diário** (depois das 2h) em `.sql.gz`, sem precisar do mysqldump. Guarda os 7 mais recentes em `BACKUP_DIR`.
- **Botão "Baixar backup agora"**, só para o ADMIN.
- **Tela *Saúde do Sistema*:** banco (tempo de resposta e tamanho), rotinas automáticas, fila de e-mails, aparelhos com notificação, último backup, segurança das últimas 24h e dados do servidor.
- **Atenção no Render gratuito:** o disco é apagado a cada deploy. Baixe o backup pela tela de vez em quando.

### LGPD
- **Termo de uso e Política de privacidade** em `politica-privacidade.html`, em linguagem simples.
- **Aceite obrigatório:**
  - no primeiro acesso, uma caixa na tela de troca de senha;
  - para quem já usa, um aviso no próximo login.
  - Fica registrado quando e qual versão foi aceita (`usuarios.termos_versao` e `termos_aceitos_em`).
- **Minha Conta → Privacidade:**
  - **Baixar meus dados** (arquivo JSON com tudo o que o sistema guarda da pessoa).
  - **Excluir minha conta**, para responsáveis. Exige senha e digitar EXCLUIR. Apaga nome, CPF, e-mail, telefone, mensagens, horários fixos e aparelhos. O histórico de saídas fica com a escola, sem identificar a pessoa.
- **Ao mudar a política:** aumente `VERSAO_TERMOS` em `utils/lgpd.js` e todos aceitam de novo.
- **Revisão:** a política é um modelo. A escola deve revisar o texto com o jurídico e informar o contato do encarregado de dados (DPO).

### Acessibilidade (complemento)
- Revisão automática de todas as telas, nos temas claro e escuro: nomes de botões e campos, títulos e contraste mínimo **WCAG AA** (4,5:1).
- **Corrigido:**
  - botões só com ícone (aprovar, recusar, salvar, tema) ganharam nome para leitor de tela;
  - campos da tabela de alunos ganharam rótulo;
  - as telas de login ganharam título;
  - as cores originais do sistema foram mantidas; quem precisa de mais contraste usa a opção "Alto contraste" do menu de acessibilidade.
- **Para o leitor de tela (NVDA, TalkBack, VoiceOver):**
  - os ícones decorativos ficam ocultos;
  - ao trocar de tela, o título é anunciado e recebe o foco;
  - o menu marca a tela atual (`aria-current`).

### Banco de dados
- Tabelas novas, criadas sozinhas ao iniciar o servidor: `config_sistema`, `push_inscricoes`, `push_envios`, `auditoria`, `login_codigos`, `dispositivos_confiaveis`.
- Colunas novas em `usuarios`: `termos_versao`, `termos_aceitos_em`, `excluido_em`.
- O SQL para aplicar à mão está em `database/migration_seguranca_lgpd_push_up.sql` (e o `_down.sql` para desfazer).

### Testes
- `tests/recursosSeguranca.test.js` (26 testes). Total: **117 testes passando**.
