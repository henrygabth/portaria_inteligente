// FUSO HORÁRIO: precisa ser definido ANTES de qualquer outra coisa. Servidores como o
// Render rodam em UTC; sem isso, o horário digitado pelo responsável (horário de Brasília)
// era lido pelo servidor como UTC e aparecia 3h diferente na secretaria/portaria, e os
// alertas de atraso disparavam fora de hora. Pode ser trocado com TZ_ESCOLA no .env/Render.
process.env.TZ = process.env.TZ_ESCOLA || 'America/Sao_Paulo';

// No Render, variáveis do painel têm prioridade sobre qualquer .env local.
require('dotenv').config();
process.env.TZ = process.env.TZ_ESCOLA || 'America/Sao_Paulo';

// MODO_TESTE_LOCAL=1 protege os testes locais: sem scheduler e sem e-mails reais
// por padrão. Use sempre um banco de homologação, nunca o banco de produção.
const modoTesteLocal = () => process.env.MODO_TESTE_LOCAL === '1';
const modoHomologacao = () => process.env.AMBIENTE === 'homologacao';

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

const app = express();
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (HTML, CSS, JS, Imagens) a partir de /public
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/saude', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', ambiente: modoTesteLocal() ? 'teste-local' : modoHomologacao() ? 'homologacao' : 'producao' });
});

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

const { configurarSeNecessario } = require('./utils/configurarPrimeiraExecucao');
let db;

async function iniciarServidor() {
    // Necessário antes de importar rotas/models, que carregam config/banco.js.
    await configurarSeNecessario();
    process.env.TZ = process.env.TZ_ESCOLA || 'America/Sao_Paulo';
    const MODO_TESTE_LOCAL = modoTesteLocal();
    const PORT = Number(process.env.PORT || process.env.PORTA || 3000);
    if (process.env.RENDER === 'true' && MODO_TESTE_LOCAL) {
        throw new Error('No Render, remova MODO_TESTE_LOCAL=1. Para testar na nuvem, use AMBIENTE=homologacao.');
    }

    // Rotas da API — o mesmo projeto atende localhost e Render; sem URL fixa.
    const usuariosRotas = require('./api/usuariosRotas');
    const alunosRotas = require('./api/alunosRotas');
    const turmasRotas = require('./api/turmasRotas');
    const pedidosRotas = require('./api/pedidosRotas');
    const responsaveisRotas = require('./api/responsaveisRotas');
    const pedidosRecorrentesRotas = require('./api/pedidosRecorrentesRotas');
    const professoresRotas = require('./api/professoresRotas');
    
    app.use('/api/usuarios', usuariosRotas);
    app.use('/api/alunos', alunosRotas);
    app.use('/api/turmas', turmasRotas);
    app.use('/api/pedidos', pedidosRotas);
    app.use('/api/responsaveis', responsaveisRotas);
    app.use('/api/pedidos-recorrentes', pedidosRecorrentesRotas);
    app.use('/api/professores', professoresRotas);

    db = require('./config/banco');
    const { migrar } = require('./utils/migrar');
    const { verificarEstrutura } = require('./utils/verificarEstrutura');
    const { iniciarAgendador } = require('./utils/agendador');

    if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
        throw new Error('PORT/PORTA inválida. Use, por exemplo, PORTA=3000.');
    }

    if (MODO_TESTE_LOCAL) {
        const host = String(process.env.DB_HOST || '').toLowerCase().trim();
        const local = ['localhost', '127.0.0.1', '::1'].includes(host);
        if (!local && process.env.PERMITIR_BANCO_REMOTO_TESTE !== '1') {
            throw new Error('Modo teste bloqueou DB_HOST remoto. Use MySQL local ou configure PERMITIR_BANCO_REMOTO_TESTE=1 SOMENTE para um banco remoto isolado de testes.');
        }
        console.log('[teste local] Agendador e e-mails reais desligados por padrão.');
    }

    // Não anuncia que o servidor iniciou se o banco estiver inacessível.
    await db.query('SELECT 1');
    console.log('[banco] Conexão MySQL estabelecida.');

    // Em produção preserva a migração já usada anteriormente. Em testes ela
    // fica desligada por padrão para não alterar tabelas sem ação explícita.
    const migracaoAtiva = process.env.MIGRACAO_AUTOMATICA
        ? process.env.MIGRACAO_AUTOMATICA === '1'
        : false; // DDL automático desligado em qualquer ambiente; aplicar SQL após backup.
    if (migracaoAtiva) await migrar();

    await verificarEstrutura(db);

    await new Promise((resolve, reject) => {
        const servidor = app.listen(PORT, '0.0.0.0');
        servidor.once('listening', resolve);
        servidor.once('error', reject);
    });
    const endereco = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    console.log(`[servidor] Ativo em ${endereco} (porta ${PORT})`);
    console.log(`[servidor] Login: ${endereco}/login.html`);

    const agendadorAtivo = process.env.AGENDADOR_ATIVO
        ? process.env.AGENDADOR_ATIVO === '1'
        : !MODO_TESTE_LOCAL && !modoHomologacao();
    if (agendadorAtivo) iniciarAgendador();
    else console.log('[agendador] Desativado neste ambiente; saídas e retornos MANUAIS continuam disponíveis.');
}

if (require.main === module) {
    iniciarServidor().catch(async (err) => {
        console.error('\n[INICIALIZAÇÃO] Não foi possível iniciar o Portaria Inteligente:', err.message);
        console.error(process.env.RENDER === 'true'
            ? 'Confira as variáveis em Render > Environment e as migrations descritas em DEPLOY_RENDER.md.\n'
            : 'Confira .env e as instruções em TESTE_LOCAL.md.\n');
        process.exitCode = 1;
        if (db) await db.end().catch(() => {});
    });
}

module.exports = { app, iniciarServidor };
