// Tempo real (SSE), comunicados de recusa/cancelamento e chat sem duplicar.
// Sem MySQL: o banco é simulado; o servidor SSE roda de verdade em uma porta local.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');
const mock = (arquivo, exports) => {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename: id, loaded: true, exports };
};

// ------------------------------------------------------------------ banco simulado
let consultas = [];
let respostas = [];           // fila de respostas para db.query
const banco = {
    async query(sql, params) {
        consultas.push({ sql, params });
        return respostas.length ? respostas.shift() : [[]];
    }
};
mock('config/banco.js', banco);
const tempoReal = require(path.join(raiz, 'utils/tempoReal.js'));

// ------------------------------------------------------------------ servidor SSE real
// Faz o papel do Express + middleware auth: o usuário vem de um cabeçalho de teste.
function subirServidor() {
    const servidor = http.createServer((req, res) => {
        const usuario = JSON.parse(req.headers['x-teste-usuario'] || 'null');
        req.usuario = usuario;
        res.status = c => { res.statusCode = c; return res; };
        res.set = h => { for (const [k, v] of Object.entries(h)) res.setHeader(k, v); return res; };
        res.json = b => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); return res; };
        tempoReal.conectar(req, res);
    });
    return new Promise(ok => servidor.listen(0, '127.0.0.1', () => ok(servidor)));
}
async function abrirCliente(servidor, usuario) {
    const ctrl = new AbortController();
    const resp = await fetch(`http://127.0.0.1:${servidor.address().port}/`, { headers: { 'x-teste-usuario': JSON.stringify(usuario) }, signal: ctrl.signal });
    const leitor = resp.body.getReader();
    const dec = new TextDecoder();
    const recebidos = [];
    let buffer = '';
    (async () => {
        try {
            for (;;) {
                const { value, done } = await leitor.read();
                if (done) break;
                buffer += dec.decode(value, { stream: true });
                let i;
                while ((i = buffer.indexOf('\n\n')) !== -1) { recebidos.push(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
            }
        } catch (_) { /* abortado */ }
    })();
    return { resp, recebidos, fechar: () => ctrl.abort() };
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

test('SSE: cabeçalhos corretos, evento chega só a quem tem direito e a conexão é limpa ao fechar', async () => {
    const servidor = await subirServidor();
    try {
        const mae = await abrirCliente(servidor, { id_usuario: 10, tipo_usuario: 'PAI' });
        const outra = await abrirCliente(servidor, { id_usuario: 11, tipo_usuario: 'PAI' });
        const sec = await abrirCliente(servidor, { id_usuario: 2, tipo_usuario: 'SECRETARIA' });
        assert.match(mae.resp.headers.get('content-type'), /text\/event-stream/);
        assert.match(mae.resp.headers.get('cache-control'), /no-cache/);
        await esperar(50);
        assert.equal(tempoReal.totalConexoes(), 3);

        tempoReal.publicarParaUsuario(10, 'chat:mensagem', { mensagem: { texto: 'oi' } });
        tempoReal.publicarParaPapeis(['SECRETARIA', 'ADMIN'], 'pedido', { pedido_id: 1 });
        await esperar(80);
        assert.ok(mae.recebidos.some(b => b.includes('event: chat:mensagem') && b.includes('"oi"')));
        assert.ok(!mae.recebidos.some(b => b.includes('event: pedido')), 'responsável não recebe evento da secretaria');
        assert.ok(!outra.recebidos.some(b => b.includes('chat:mensagem')), 'outro responsável não recebe mensagem alheia');
        assert.ok(sec.recebidos.some(b => b.includes('event: pedido')));

        mae.fechar(); outra.fechar(); sec.fechar();
        await esperar(100);
        assert.equal(tempoReal.totalConexoes(), 0);
    } finally { tempoReal.encerrarTodos(); servidor.close(); }
});

test('SSE: sem usuário autenticado a conexão é recusada com 401', async () => {
    const servidor = await subirServidor();
    try {
        const resp = await fetch(`http://127.0.0.1:${servidor.address().port}/`);
        assert.equal(resp.status, 401);
    } finally { tempoReal.encerrarTodos(); servidor.close(); }
});

test('SSE: limite de abas por usuário fecha a mais antiga', async () => {
    const servidor = await subirServidor();
    try {
        const abas = [];
        for (let i = 0; i < 7; i++) abas.push(await abrirCliente(servidor, { id_usuario: 20, tipo_usuario: 'PAI' }));
        await esperar(100);
        assert.equal(tempoReal.totalConexoes(), 5);
        abas.forEach(a => a.fechar());
    } finally { tempoReal.encerrarTodos(); servidor.close(); }
});

test('rota exige autenticação e está registrada no servidor', () => {
    assert.match(ler('api/tempoRealRotas.js'), /get\('\/eventos', auth, tempoReal\.conectar\)/);
    assert.match(ler('index.js'), /app\.use\('\/api\/tempo-real', tempoRealRotas\)/);
});

// ------------------------------------------------------------------ comunicados do professor
const prof = require(path.join(raiz, 'model/professoresModel.js'));

test('recusa e cancelamento geram comunicado com o motivo, e texto próprio para liberação para casa', async () => {
    for (const tipo of ['RECUSADA', 'CANCELADA']) {
        consultas = []; respostas = [[{ insertId: 77, affectedRows: 2 }]];
        // 1ª consulta é o UPDATE de turma; dê uma resposta vazia antes da do INSERT
        respostas.unshift([{}]);
        const novo = await prof.registrarEvento(banco, 5, tipo);
        const q = consultas.at(-1);
        assert.equal(novo, 1);
        assert.deepEqual(q.params, [tipo, tipo === 'RECUSADA' ? 'Solicitação de saída recusada pela secretaria' : 'Saída autorizada cancelada pela secretaria', 5]);
        assert.match(q.sql, /Motivo: /);
        assert.match(q.sql, /Liberação para ir para casa (recusada|cancelada) pela secretaria/);
        assert.match(q.sql, /pt\.turma_id = p\.turma_id/);
    }
});

test('comunicado repetido não conta como novo (sem duplicar nem notificar de novo)', async () => {
    consultas = []; respostas = [[{}], [{ insertId: 0, affectedRows: 1 }]];
    assert.equal(await prof.registrarEvento(banco, 5, 'SAIDA'), 0);
});

test('erro de banco ao gravar comunicado agora aparece (não é mais engolido)', async () => {
    const falha = { async query(sql) { if (/INSERT INTO comunicados_professores/.test(sql)) { const e = new Error("Data truncated for column 'tipo'"); e.code = 'WARN_DATA_TRUNCATED'; throw e; } return [{}]; } };
    await assert.rejects(() => prof.registrarEvento(falha, 5, 'RECUSADA'), /truncated/);
});

test('notificação em tempo real vai só aos professores vinculados à turma do pedido', async () => {
    const servidor = await subirServidor();
    try {
        const certo = await abrirCliente(servidor, { id_usuario: 41, tipo_usuario: 'PROFESSOR' });
        const errado = await abrirCliente(servidor, { id_usuario: 42, tipo_usuario: 'PROFESSOR' });
        await esperar(50);
        consultas = []; respostas = [[[{ turma_id: 3 }]], [[{ professor_id: 41 }]]];
        const enviados = await prof.notificarProfessoresDoPedido(9, { tipo: 'RECUSADA' });
        await esperar(80);
        assert.equal(enviados, 1);
        assert.match(consultas.at(-1).sql, /professores_turmas/);
        assert.deepEqual(consultas.at(-1).params, [3]);
        assert.ok(certo.recebidos.some(b => b.includes('event: comunicado') && b.includes('RECUSADA')));
        assert.ok(!errado.recebidos.some(b => b.includes('event: comunicado')));
        certo.fechar(); errado.fechar();
    } finally { tempoReal.encerrarTodos(); servidor.close(); }
});

// ------------------------------------------------------------------ pedidos: recusa gera comunicado sem travar a decisão
test('recusar pedido grava o histórico, gera comunicado RECUSADA e a falha do comunicado não desfaz a decisão', async () => {
    const eventos = []; let falhar = false; const chamadas = [];
    const conn = {
        beginTransaction: async () => {}, commit: async () => { chamadas.push('commit'); }, rollback: async () => { chamadas.push('rollback'); }, release: () => {},
        query: async (sql, params) => {
            if (/SELECT status, tipo FROM pedidos_saida/.test(sql)) return [[{ status: 'PENDENTE', tipo: 'ALMOCO' }]];
            return [[{}]];
        }
    };
    mock('config/banco.js', { getConnection: async () => conn, query: async () => [[{ solicitante_id: 5 }]] });
    mock('model/historicoModel.js', { registrar: async () => {} });
    mock('model/ocorrenciasModel.js', { resolverPendentes: async () => {} });
    mock('model/professoresModel.js', {
        registrarEvento: async (c, id, tipo) => { eventos.push(tipo); if (falhar) throw new Error('ENUM antigo'); return 1; },
        notificarProfessoresDoPedido: async () => 0
    });
    delete require.cache[require.resolve(path.join(raiz, 'model/pedidosModel.js'))];
    const pedidos = require(path.join(raiz, 'model/pedidosModel.js'));

    assert.equal(await pedidos.atualizarStatus(3, 'RECUSADA', 2, 'Sem autorização do responsável'), true);
    assert.deepEqual(eventos, ['RECUSADA']);

    falhar = true; chamadas.length = 0;
    const erros = []; const original = console.error; console.error = (...a) => erros.push(a.join(' '));
    try { assert.equal(await pedidos.atualizarStatus(4, 'RECUSADA', 2, 'motivo'), true); } finally { console.error = original; }
    assert.deepEqual(chamadas, ['commit'], 'a recusa é confirmada mesmo se o comunicado falhar');
    assert.ok(erros.some(e => /FALHA ao gerar comunicado RECUSADA/.test(e)), 'a falha é registrada no log');
});

// ------------------------------------------------------------------ chat
test('chat: modelo devolve a mensagem já gravada quando o mesmo client_uuid é reenviado', async () => {
    const chamadas = [];
    mock('config/banco.js', {
        async query(sql, params) {
            chamadas.push(sql);
            if (/SELECT mensagem_id, responsavel_id FROM chat_mensagens/.test(sql)) return [[{ mensagem_id: 55, responsavel_id: 5 }]];
            return [{ insertId: 99 }];
        }
    });
    delete require.cache[require.resolve(path.join(raiz, 'model/chatModel.js'))];
    const chat = require(path.join(raiz, 'model/chatModel.js'));
    assert.deepEqual(await chat.enviar(5, 5, 'RESPONSAVEL', 'oi', 'abc-12345678'), { id: 55, duplicada: true });
    assert.ok(!chamadas.some(s => /INSERT INTO chat_mensagens/.test(s)), 'não grava de novo');
});

test('chat: duas requisições simultâneas iguais (índice único) resultam em uma só mensagem', async () => {
    let selects = 0;
    mock('config/banco.js', {
        async query(sql) {
            if (/SELECT mensagem_id, responsavel_id FROM chat_mensagens/.test(sql)) return [++selects === 1 ? [] : [{ mensagem_id: 60, responsavel_id: 5 }]];
            const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e;
        }
    });
    delete require.cache[require.resolve(path.join(raiz, 'model/chatModel.js'))];
    const chat = require(path.join(raiz, 'model/chatModel.js'));
    assert.deepEqual(await chat.enviar(5, 5, 'RESPONSAVEL', 'oi', 'abc-12345678'), { id: 60, duplicada: true });
});

test('chat: mensagem nova é emitida ao responsável certo e à secretaria; repetida não é emitida de novo', async () => {
    const emitidos = [];
    const original = { u: tempoReal.publicarParaUsuario, p: tempoReal.publicarParaPapeis };
    tempoReal.publicarParaUsuario = (id, ev, d) => emitidos.push(['usuario', id, ev, d.mensagem.texto]);
    tempoReal.publicarParaPapeis = (papeis, ev, d) => emitidos.push(['papeis', papeis.join(','), ev, d.mensagem.texto]);
    let duplicada = false;
    mock('model/chatModel.js', {
        inteiro: v => Number(v) > 0 ? Number(v) : null,
        responsavelExiste: async () => true, podeConversar: async () => true, enviadasUltimoMinuto: async () => 0,
        enviar: async () => ({ id: 8, duplicada }),
        buscarMensagem: async id => ({ mensagem_id: id, responsavel_id: 5, de: 'SECRETARIA', texto: 'Pode vir buscar', remetente: 'Secretaria' }),
        marcarLidas: async () => {}, listarConversa: async () => []
    });
    delete require.cache[require.resolve(path.join(raiz, 'controller/chatController.js'))];
    const ctl = require(path.join(raiz, 'controller/chatController.js'));
    const res = () => { const r = { status(c) { r.codigo = c; return r; }, json(b) { r.corpo = b; return r; } }; return r; };
    try {
        let r = res();
        await ctl.responder({ usuario: { id_usuario: 2 }, params: { id: '5' }, body: { texto: 'Pode vir buscar', client_uuid: 'uuid-valido-1' } }, r);
        assert.equal(r.codigo, 201);
        assert.deepEqual(emitidos, [['usuario', 5, 'chat:mensagem', 'Pode vir buscar'], ['papeis', 'SECRETARIA,ADMIN', 'chat:mensagem', 'Pode vir buscar']]);
        emitidos.length = 0; duplicada = true; r = res();
        await ctl.responder({ usuario: { id_usuario: 2 }, params: { id: '5' }, body: { texto: 'Pode vir buscar', client_uuid: 'uuid-valido-1' } }, r);
        assert.equal(r.codigo, 200);
        assert.equal(emitidos.length, 0);
    } finally { tempoReal.publicarParaUsuario = original.u; tempoReal.publicarParaPapeis = original.p; }
});

test('chat: secretaria não inicia conversa com responsável inativo ou sem aluno vinculado', async () => {
    mock('model/chatModel.js', {
        inteiro: v => Number(v) > 0 ? Number(v) : null,
        responsavelExiste: async () => true, podeConversar: async () => false, enviadasUltimoMinuto: async () => 0,
        enviar: async () => { throw new Error('não deveria gravar'); }, buscarMensagem: async () => null,
        marcarLidas: async () => {}, listarConversa: async () => []
    });
    delete require.cache[require.resolve(path.join(raiz, 'controller/chatController.js'))];
    const ctl = require(path.join(raiz, 'controller/chatController.js'));
    const r = { status(c) { r.codigo = c; return r; }, json(b) { r.corpo = b; return r; } };
    await ctl.responder({ usuario: { id_usuario: 2 }, params: { id: '5' }, body: { texto: 'oi' } }, r);
    assert.equal(r.codigo, 403);
});

// ------------------------------------------------------------------ banco e telas
test('migração: só adiciona (enum RECUSADA/CANCELADA, client_uuid, índice único) e SQL manual existe', () => {
    const m = ler('utils/migrar.js');
    assert.match(m, /'RECUSADA'\], 'RECUSADA'/);
    assert.match(m, /'CANCELADA'\], 'CANCELADA'/);
    assert.match(m, /garantirColuna\('chat_mensagens', 'client_uuid'/);
    assert.match(m, /garantirIndiceUnico\('chat_mensagens', 'uq_chat_remetente_uuid'/);
    assert.doesNotMatch(m, /DROP TABLE|DROP DATABASE|TRUNCATE|DELETE FROM/i);
    const up = ler('database/migration_tempo_real_up.sql');
    assert.match(up, /RECUSADA/);
    assert.match(up, /client_uuid/);
    assert.doesNotMatch(up, /DROP|TRUNCATE|DELETE/i);
});

test('telas carregam o tempo real e conhecem os novos tipos de comunicado', () => {
    for (const html of ['home', 'secretaria', 'portaria', 'professor']) assert.match(ler(`public/${html}.html`), /tempo-real\.js/);
    const p = ler('public/js/general/professor.js');
    assert.match(p, /RECUSADA: 'Recusada'/);
    assert.match(p, /PITempoReal\.on\('comunicado'/);
    assert.match(ler('public/professor.html'), /value="RECUSADA"/);
    assert.match(ler('public/js/general/chat.js'), /PITempoReal\.on\('chat:mensagem'/);
    assert.match(ler('public/js/general/portaria.js'), /PITempoReal\.on\('pedido'/);
});
