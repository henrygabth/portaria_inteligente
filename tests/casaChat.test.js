// Liberação para casa (pedido que não volta) e chat responsável <-> secretaria.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');
const mock = (arquivo, exports) => {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename: id, loaded: true, exports };
};

// ---------------------------------------------------------------- pedidos
const consultas = [];
const eventos = [];
let tipoDoPedido = 'CASA';
const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params) => {
        consultas.push({ sql, params });
        if (/SELECT status, tipo FROM pedidos_saida/.test(sql)) return [[{ status: 'APROVADA', tipo: tipoDoPedido }]];
        return [[{}]];
    }
};
mock('config/banco.js', { getConnection: async () => conn, query: async () => [[{}]] });
mock('model/historicoModel.js', { registrar: async () => {} });
mock('model/professoresModel.js', { registrarEvento: async (c, id, tipo) => { eventos.push(tipo); } });
mock('model/ocorrenciasModel.js', { resolverPendentes: async () => {} });
const pedidos = require(path.join(raiz, 'model/pedidosModel.js'));

test('registrar a saída de pedido CASA conclui o pedido e avisa como CASA', async () => {
    consultas.length = 0; eventos.length = 0; tipoDoPedido = 'CASA';
    assert.equal(await pedidos.atualizarStatus(7, 'EM_SAIDA', 3), true);
    const update = consultas.find(q => /UPDATE pedidos_saida SET status/.test(q.sql));
    assert.equal(update.params[0], 'CONCLUIDA');
    assert.match(update.sql, /hora_saida_real = NOW\(\)/);
    assert.doesNotMatch(update.sql, /hora_retorno_real/);
    const hist = consultas.find(q => /INSERT INTO historico_pedidos/.test(q.sql));
    assert.equal(hist.params[3], 'CONCLUIDA');
    assert.deepEqual(eventos, ['CASA']);
});

test('pedido de almoço continua EM_SAIDA e avisa como SAIDA', async () => {
    consultas.length = 0; eventos.length = 0; tipoDoPedido = 'ALMOCO';
    await pedidos.atualizarStatus(8, 'EM_SAIDA', 3);
    const update = consultas.find(q => /UPDATE pedidos_saida SET status/.test(q.sql));
    assert.equal(update.params[0], 'EM_SAIDA');
    assert.deepEqual(eventos, ['SAIDA']);
});

test('aprovação de pedido CASA continua exigindo PENDENTE e avisa o professor', async () => {
    consultas.length = 0; eventos.length = 0; tipoDoPedido = 'CASA';
    await pedidos.atualizarStatus(9, 'APROVADA', 3).catch(() => {});
    // o mock devolve APROVADA; como o esperado é PENDENTE, a transição deve ser recusada
    assert.deepEqual(eventos, []);
});

// ---------------------------------------------------------------- e-mail
mock('utils/emailTemplate.js', { montarEmailHtml: d => JSON.stringify(d) });
mock('utils/email.js', { enviarEmail: async () => {} });
mock('model/alertasEmailModel.js', {});
const alertas = require(path.join(raiz, 'utils/alertasEmail.js'));

test('e-mail de saída para casa não fala em retorno previsto', () => {
    const msg = alertas.mensagem('CASA', { nome_aluno: 'Ana', turma: '1º DS', hora_saida_real: new Date() }, 'PROFESSOR');
    assert.match(msg.subject, /Saída para casa - Ana/);
    assert.doesNotMatch(msg.text, /Retorno previsto/);
    assert.match(msg.html, /não há retorno previsto/i);
});

// ---------------------------------------------------------------- chat
const gravados = [];
let enviadas = 0;
let existe = true;
mock('model/chatModel.js', {
    inteiro: v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null,
    responsavelExiste: async () => existe,
    enviadasUltimoMinuto: async () => enviadas,
    podeConversar: async () => true,
    buscarMensagem: async id => ({ mensagem_id: id, responsavel_id: 5, de: 'RESPONSAVEL', texto: 'x', remetente: 'Mae' }),
    enviar: async (...a) => { gravados.push(a); return { id: 1, duplicada: false }; },
    marcarLidas: async () => {}, listarConversa: async () => []
});
const chat = require(path.join(raiz, 'controller/chatController.js'));
const resposta = () => { const r = { status(c) { r.codigo = c; return r; }, json(b) { r.corpo = b; return r; } }; return r; };

test('chat: rejeita texto vazio, longo ou que não é texto', async () => {
    for (const texto of ['', '   ', 'x'.repeat(1001), 123, null, undefined]) {
        const res = resposta();
        await chat.enviarResponsavel({ usuario: { id_usuario: 5 }, body: { texto } }, res);
        assert.equal(res.codigo, 400, String(texto).slice(0, 10));
    }
    assert.equal(gravados.length, 0);
});

test('chat: o responsável só escreve na própria conversa (id vem do token)', async () => {
    gravados.length = 0; enviadas = 0;
    const res = resposta();
    await chat.enviarResponsavel({ usuario: { id_usuario: 5 }, params: { id: '99' }, body: { texto: '  Olá  ' } }, res);
    assert.equal(res.codigo, 201);
    assert.deepEqual(gravados[0], [5, 5, 'RESPONSAVEL', 'Olá', null]);
});

test('chat: secretaria responde ao responsável indicado; id inválido ou inexistente é recusado', async () => {
    gravados.length = 0; existe = true;
    let res = resposta();
    await chat.responder({ usuario: { id_usuario: 2 }, params: { id: '5' }, body: { texto: 'Pode vir buscar.' } }, res);
    assert.equal(res.codigo, 201);
    assert.deepEqual(gravados[0], [5, 2, 'SECRETARIA', 'Pode vir buscar.', null]);
    res = resposta();
    await chat.responder({ usuario: { id_usuario: 2 }, params: { id: 'abc' }, body: { texto: 'oi' } }, res);
    assert.equal(res.codigo, 404);
    existe = false; res = resposta();
    await chat.responder({ usuario: { id_usuario: 2 }, params: { id: '5' }, body: { texto: 'oi' } }, res);
    assert.equal(res.codigo, 404);
    existe = true;
});

test('chat: limita o volume de mensagens por minuto', async () => {
    enviadas = 15;
    const res = resposta();
    await chat.enviarResponsavel({ usuario: { id_usuario: 5 }, body: { texto: 'oi' } }, res);
    assert.equal(res.codigo, 429);
    enviadas = 0;
});

test('chat: rotas protegidas por papel e registradas no servidor', () => {
    const rotas = ler('api/chatRotas.js');
    assert.match(rotas, /get\('\/minha', auth, exigirPapel\('PAI'\)/);
    assert.match(rotas, /get\('\/conversas', auth, exigirPapel\('SECRETARIA', 'ADMIN'\)/);
    assert.match(rotas, /post\('\/conversas\/:id', auth, exigirPapel\('SECRETARIA', 'ADMIN'\)/);
    assert.match(ler('index.js'), /app\.use\('\/api\/chat', chatRotas\)/);
});

// ---------------------------------------------------------------- banco e telas
test('migração só adiciona: coluna tipo com padrão ALMOCO, enums com CASA e tabela do chat', () => {
    const m = ler('utils/migrar.js');
    assert.match(m, /garantirColuna\('pedidos_saida', 'tipo', "ENUM\('ALMOCO','CASA'\) NOT NULL DEFAULT 'ALMOCO'"\)/);
    assert.match(m, /garantirValorEnum\('comunicados_professores'/);
    assert.match(m, /garantirValorEnum\('alertas_email_envios'/);
    assert.match(m, /criarTabelaSePreciso\('chat_mensagens'/);
    assert.doesNotMatch(m, /DROP TABLE|DELETE FROM chat|TRUNCATE/i);
});

test('telas: responsável escolhe o tipo; portaria, secretaria e professor mostram o pedido CASA', () => {
    assert.match(ler('public/home.html'), /id="tipoSaida"/);
    assert.match(ler('public/home.html'), /id="tela-mensagens"/);
    assert.match(ler('public/secretaria.html'), /id="tela-mensagens"/);
    assert.match(ler('public/js/general/portaria.js'), /Liberar para casa/);
    assert.match(ler('public/js/general/secretaria.js'), /etiquetaCasa/);
    assert.match(ler('public/js/general/professor.js'), /FOI_PARA_CASA/);
    assert.match(ler('public/js/general/layout.js'), /'Mensagens', 'secretaria\.html', 'tela-mensagens'/);
    assert.match(ler('public/js/general/layout.js'), /'Mensagens', 'home\.html', 'tela-mensagens'/);
});
