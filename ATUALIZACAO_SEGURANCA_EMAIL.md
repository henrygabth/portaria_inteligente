# Atualização: telas, e-mails e segurança

## 1. Telas
- **Seleção de painel (admin)** — saudação, data, números do momento (pedidos pendentes, alunos fora, atrasados, saídas do dia) e cartões para Secretaria, Portaria, Professores e Turmas e Responsável. Atalhos de teclado 1–4 e selo de "último acesso".
- **Professores e Turmas** — formulário em 3 etapas (dados, senha inicial com "Gerar senha", turmas). As turmas são escolhidas clicando em "chips" agrupados por turno, sem o antigo Ctrl+clique. A lista mostra cada professor com as turmas, permite editar ali mesmo e avisa quais turmas estão sem professor.
- **Painel do professor (Minhas Turmas)** — antes, todo aluno sem pedido aparecia como "Na escola", embora o sistema não registre a chegada. Agora o painel abre em "Com movimentação hoje" e tem cartões clicáveis: Saída autorizada, Fora da escola, Atrasados, Foram para casa e Todos. Quem não tem pedido aparece como "Sem saída hoje".

Registro de chegada (presença) ficou fora desta versão de propósito: fazer o porteiro registrar cada aluno criaria fila no portão. Fica como sugestão de melhoria futura (chamada do professor, QR Code ou integração com o sistema de frequência da escola).

## 2. E-mails (Brevo)
Mudanças no código:
- novas tentativas automáticas em falhas temporárias (rede, 429, 5xx), com espera crescente;
- falha permanente (e-mail inválido, chave errada) é descartada com o motivo visível em "Ver alertas", sem travar a fila;
- envio em paralelo (4 por vez) e e-mails novos passam na frente dos que estão falhando;
- e-mail de recuperação de senha não segura mais a tela.

Causas que **não** se resolvem só com código (fazer no painel do Brevo/Render):
1. **Remetente @gmail.com**: o Brevo não autentica domínio gratuito; parte dos e-mails vai para spam ou é recusada. Use um domínio próprio autenticado (DKIM + DMARC) em `EMAIL_FROM`.
2. **Cota de 300 e-mails/dia do plano gratuito**: cada saída/retorno gera um e-mail para responsáveis, professores, secretaria e portaria. Para economizar: `ALERTAS_EQUIPE=criticos`.
3. **Render gratuito "dorme"** após 15 min sem acesso, e a fila e os alertas de atraso param. Configure um monitor (UptimeRobot ou cron-job.org) chamando `/api/saude` a cada 10 min.

## 3. Segurança
- Limite de tentativas: login (8 por e-mail / 40 por IP a cada 15 min), recuperação e redefinição de senha.
- Login só por e-mail (antes aceitava "nome parecido").
- **Corrigido:** qualquer token de login conseguia trocar a senha pela rota de redefinição sem saber a senha atual. Agora só o link do e-mail funciona, ele vale 30 min e só pode ser usado uma vez.
- Trocar a senha derruba as outras sessões abertas (`token_versao`).
- Senha mínima: 8 caracteres com letras e números.
- Cabeçalhos de proteção (CSP, X-Frame-Options, nosniff, HSTS), CORS fechado e sem `X-Powered-By`.
- Mensagens de erro não expõem mais detalhes internos do servidor.
- Escape de HTML em telas e e-mails (nomes e motivos digitados não viram código).
- Validação de datas de pedido, IDs na URL, tamanhos de texto e e-mail único ao editar a conta.
- O cadastro de usuário não devolve mais um token de sessão do usuário criado.

## 4. Testes
`npm test` → 75 testes (11 novos em `tests/seguranca.test.js`).
