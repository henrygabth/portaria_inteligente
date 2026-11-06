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

const app = express();
app.use(cors());
app.use(express.json());

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

app.use('/api/usuarios', usuariosRotas);
app.use('/api/alunos', alunosRotas);
app.use('/api/turmas', turmasRotas);
app.use('/api/pedidos', pedidosRotas);
app.use('/api/responsaveis', responsaveisRotas);
app.use('/api/pedidos-recorrentes', pedidosRecorrentesRotas);
app.use('/api/professores', professoresRotas);

// Rota raiz "/" - Abre a home.html no navegador
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

const PORT = process.env.PORTA || 3000;
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
});