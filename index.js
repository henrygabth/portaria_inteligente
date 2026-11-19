// FUSO HORÁRIO: precisa ser definido ANTES de qualquer outra coisa. Servidores como o
// Render rodam em UTC; sem isso, o horário digitado pelo responsável (horário de Brasília)
// era lido pelo servidor como UTC e aparecia 3h diferente na secretaria/portaria, e os
// alertas de atraso disparavam fora de hora. Pode ser trocado com TZ_ESCOLA no .env/Render.
process.env.TZ = process.env.TZ_ESCOLA || 'America/Sao_Paulo';

// override: true -> o .env sempre vence variáveis antigas definidas no Windows
require('dotenv').config({ override: true });
process.env.TZ = process.env.TZ_ESCOLA || 'America/Sao_Paulo';

// Em várias redes (comum no Windows) o Node resolve hosts como smtp.gmail.com
// para IPv6 primeiro, mesmo sem rota IPv6 disponível, o que gera ECONNREFUSED
// ao enviar e-mail. Forçar IPv4 primeiro na resolução DNS do processo resolve isso.
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const { cabecalhosSeguranca, limitar } = require('./utils/seguranca');

const app = express();
app.disable('x-powered-by');
// O Render (e outros) ficam atrás de um proxy: sem isso todo mundo teria o mesmo IP
// e o limitador de tentativas bloquearia a escola inteira de uma vez.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.use(cabecalhosSeguranca);

// O site e a API ficam no mesmo endereço, então CORS não é necessário. Só libera
// outros domínios se eles forem listados em CORS_ORIGIN (separados por vírgula).
const origensPermitidas = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
if (origensPermitidas.length) app.use(cors({ origin: origensPermitidas }));

// Importação de alunos por planilha aceita até 1 MB; o resto da API, até 100 KB.
const jsonPadrao = express.json({ limit: '100kb' });
const jsonGrande = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path === '/api/alunos/importar' ? jsonGrande : jsonPadrao)(req, res, next));

// Endereço leve para monitoramento (ex.: UptimeRobot/cron-job.org a cada 5-10 min).
// No plano gratuito do Render o servidor "dorme" sem acesso, e dormindo as rotinas de
// alerta de atraso e a fila de e-mails ficam paradas.
// Verificação leve (sem banco): usada pelo "manter acordado" e por monitores como o UptimeRobot.
app.get('/api/saude', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, hora: new Date().toISOString() }); });

// Teto geral da API por IP (protege contra robôs e loops no navegador).
app.use('/api', limitar({ nome: 'api', max: 600, janelaMs: 60 * 1000, mensagem: 'Muitas requisições. Aguarde alguns segundos.' }));

// Servir arquivos estáticos (HTML, CSS, JS, Imagens) a partir de /public
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
const usuariosRotas = require('./api/usuariosRotas');
const alunosRotas = require('./api/alunosRotas');
const turmasRotas = require('./api/turmasRotas');
const pedidosRotas = require('./api/pedidosRotas');
const responsaveisRotas = require('./api/responsaveisRotas');
const pedidosRecorrentesRotas = require('./api/pedidosRecorrentesRotas');
const professoresRotas = require('./api/professoresRotas');
const chatRotas = require('./api/chatRotas');
const tempoRealRotas = require('./api/tempoRealRotas');
const relatoriosRotas = require('./api/relatoriosRotas');
const pushRotas = require('./api/pushRotas');
const auditoriaRotas = require('./api/auditoriaRotas');
const sistemaRotas = require('./api/sistemaRotas');
const contatoRotas = require('./api/contatoRotas');

app.use('/api/usuarios', usuariosRotas);
app.use('/api/alunos', alunosRotas);
app.use('/api/turmas', turmasRotas);
app.use('/api/pedidos', pedidosRotas);
app.use('/api/responsaveis', responsaveisRotas);
app.use('/api/pedidos-recorrentes', pedidosRecorrentesRotas);
app.use('/api/professores', professoresRotas);
app.use('/api/chat', chatRotas);
app.use('/api/tempo-real', tempoRealRotas);
app.use('/api/relatorios', relatoriosRotas);
app.use('/api/push', pushRotas);
app.use('/api/auditoria', auditoriaRotas);
app.use('/api/sistema', sistemaRotas);
app.use('/api/contato', contatoRotas);

// Rota da API que não existe: responde JSON (e não a página HTML de erro do Express).
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Rota raiz "/" - Abre a home.html no navegador
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Erros não tratados: nunca devolve stack trace ou mensagem interna para o navegador.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido na requisição.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ erro: 'Conteúdo grande demais.' });
    console.error('[servidor] Erro não tratado:', err);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
});

process.on('unhandledRejection', (motivo) => console.error('[servidor] Promise rejeitada sem tratamento:', motivo));

// O Render (e outras hospedagens) informam a porta em PORT; PORTA continua valendo para uso local.
const PORT = process.env.PORT || process.env.PORTA || 3000;
app.listen(PORT, async () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

    // Confere/cria tabelas e colunas que faltarem no banco (ver utils/migrar.js)
    // antes de começar as rotinas automáticas.
    const { migrar } = require('./utils/migrar');
    await migrar();

    // Gera os pedidos do dia a partir dos horários fixos e passa a checar
    // atrasos no retorno periodicamente (ver utils/agendador.js).
    const { iniciarAgendador } = require('./utils/agendador');
    iniciarAgendador();

    // Plano grátis do Render: não deixa o site "dormir" (ver utils/manterAcordado.js).
    require('./utils/manterAcordado').iniciarManterAcordado();
});