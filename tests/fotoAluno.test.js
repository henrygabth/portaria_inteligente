// Foto 3x4 do aluno e motivo obrigatório na liberação para casa. Banco e e-mail simulados.
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
const novoRes = () => {
    const r = { cabecalhos: {}, status(c) { r.codigo = c; return r; }, json(b) { r.corpo = b; return r; }, send(b) { r.corpo = b; return r; }, set(h) { Object.assign(r.cabecalhos, h); return r; } };
    return r;
};
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(2000, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(2000, 1)]);

// ------------------------------------------------------------------ alunosController (foto)
const salvas = [];
let fotoDoBanco = { mime: 'image/jpeg', dados: JPEG };
let alunoExiste = true;
mock('config/banco.js', { query: async () => [[]] });
mock('model/alunosModel.js', {
    buscarPorId: async () => (alunoExiste ? [{ aluno_id: 7, nome: 'Ana' }] : []),
    salvarFoto: async (...a) => { salvas.push(a); },
    buscarFoto: async () => fotoDoBanco
});
mock('model/responsaveisAlunosModel.js', { pertence: async (usuario, aluno) => usuario === 5 && aluno === 7 });
const alunos = require(path.join(raiz, 'controller/alunosController.js'));
const pedirFoto = (usuario, id = '7') => { const r = novoRes(); return alunos.obterFoto({ usuario, params: { id } }, r).then(() => r); };

test('foto: responsável vinculado, secretaria e portaria veem; imagem sai privada e sem sniffing', async () => {
    for (const usuario of [{ id_usuario: 5, tipo_usuario: 'PAI' }, { id_usuario: 2, tipo_usuario: 'SECRETARIA' }, { id_usuario: 3, tipo_usuario: 'PORTARIA' }, { id_usuario: 4, tipo_usuario: 'PORTEIRO' }]) {
        const r = await pedirFoto(usuario);
        assert.equal(r.codigo, 200, usuario.tipo_usuario);
        assert.equal(r.cabecalhos['Content-Type'], 'image/jpeg');
        assert.match(r.cabecalhos['Cache-Control'], /private/);
        assert.equal(r.cabecalhos['X-Content-Type-Options'], 'nosniff');
        assert.equal(r.corpo, JPEG);
    }
});

test('foto: responsável de OUTRO aluno e professor não veem (403)', async () => {
    assert.equal((await pedirFoto({ id_usuario: 99, tipo_usuario: 'PAI' })).codigo, 403);
    assert.equal((await pedirFoto({ id_usuario: 6, tipo_usuario: 'PROFESSOR' })).codigo, 403);
});

test('foto: aluno sem foto devolve 404 e id inválido 400', async () => {
    const guardada = fotoDoBanco; fotoDoBanco = null;
    try { assert.equal((await pedirFoto({ id_usuario: 2, tipo_usuario: 'SECRETARIA' })).codigo, 404); } finally { fotoDoBanco = guardada; }
    assert.equal((await pedirFoto({ id_usuario: 2, tipo_usuario: 'SECRETARIA' }, 'abc')).codigo, 400);
});

test('foto: envio valida tamanho e tipo REAL do arquivo e grava quem enviou', async () => {
    const enviar = async corpo => { const r = novoRes(); await alunos.enviarFoto({ usuario: { id_usuario: 2 }, params: { id: '7' }, body: corpo }, r); return r; };
    assert.equal((await enviar(undefined)).codigo, 400, 'sem corpo');
    assert.equal((await enviar(Buffer.alloc(0))).codigo, 400, 'vazio');
    assert.equal((await enviar(PNG)).codigo, 400, 'PNG com cabeçalho image/jpeg não passa');
    assert.equal((await enviar(Buffer.concat([JPEG, Buffer.alloc(401 * 1024)]))).codigo, 413, 'grande demais');
    assert.equal(salvas.length, 0);
    const ok = await enviar(JPEG);
    assert.equal(ok.codigo, 200);
    assert.deepEqual(salvas[0], [7, 'image/jpeg', JPEG, 2]);
    alunoExiste = false;
    try { assert.equal((await enviar(JPEG)).codigo, 404); } finally { alunoExiste = true; }
});

test('rotas da foto: só secretaria/admin envia; leitura exige login e o controller decide quem vê', () => {
    const r = ler('api/alunosRotas.js');
    assert.match(r, /rotas\.put\('\/:id\/foto', auth, exigirPapel\('SECRETARIA', 'ADMIN'\), receberFoto, alunosController\.enviarFoto\)/);
    assert.match(r, /rotas\.get\('\/:id\/foto', auth, alunosController\.obterFoto\)/);
    assert.match(r, /limit: '400kb'/);
});

// ------------------------------------------------------------------ pedidos: motivo da liberação para casa
const criados = [];
mock('model/pedidosModel.js', { cadastrar: async (...a) => { criados.push(a); return 55; } });
mock('utils/email.js', { enviarEmail: async () => {} });
mock('utils/emailTemplate.js', { montarEmailHtml: () => '' });
mock('utils/alertasEmail.js', { avisarTodos: async () => {}, retornouAtrasado: async () => {} });
mock('model/ocorrenciasModel.js', {});
delete require.cache[require.resolve(path.join(raiz, 'controller/pedidosController.js'))];
const pedidosCtl = require(path.join(raiz, 'controller/pedidosController.js'));
// Data sempre no futuro: o servidor agora recusa saída marcada para um horário que já passou.
const amanha10h = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T10:00:00`;
};
const cadastrar = async corpo => {
    criados.length = 0;
    const r = novoRes();
    await pedidosCtl.cadastrar({ usuario: { id_usuario: 5, tipo_usuario: 'PAI' }, body: { aluno_id: 7, hora_prevista_saida: amanha10h(), ...corpo } }, r);
    return r;
};

test('liberação para casa exige o motivo da saída; almoço continua sem exigir', async () => {
    assert.equal((await cadastrar({ tipo: 'CASA' })).codigo, 400, 'sem motivo');
    assert.equal((await cadastrar({ tipo: 'CASA', motivo: '  ' })).codigo, 400, 'só espaços');
    assert.equal((await cadastrar({ tipo: 'CASA', motivo: 'ab' })).codigo, 400, 'curto demais');
    assert.equal(criados.length, 0);
    const ok = await cadastrar({ tipo: 'CASA', motivo: '  Consulta médica  ' });
    assert.equal(ok.codigo, 201);
    assert.equal(criados[0][5], 'Consulta médica', 'motivo salvo sem espaços sobrando');
    assert.equal(criados[0][9], 'CASA');
    assert.equal((await cadastrar({ tipo: 'ALMOCO' })).codigo, 201, 'almoço sem motivo continua válido');
    assert.equal((await cadastrar({ tipo: 'CASA', motivo: 'x'.repeat(256) })).codigo, 400, 'acima do limite da coluna');
});

// ------------------------------------------------------------------ vínculo, banco e telas
test('vínculo devolve o aluno_id (a foto é enviada logo depois pelo navegador)', () => {
    const c = ler('controller/usuariosController.js');
    assert.equal((c.match(/aluno_id,\s*\n\s*mensagem/g) || []).length, 2, 'conta nova e conta existente');
});

test('banco: só cria a tabela alunos_fotos (com cascata) e nada destrutivo', () => {
    const m = ler('utils/migrar.js');
    assert.match(m, /criarTabelaSePreciso\('alunos_fotos'/);
    assert.match(m, /MEDIUMBLOB/);
    assert.match(m, /REFERENCES alunos\(aluno_id\) ON DELETE CASCADE/);
    assert.doesNotMatch(m, /DROP TABLE|DROP DATABASE|TRUNCATE|DELETE FROM/i);
    const up = ler('database/migration_foto_aluno_up.sql');
    assert.match(up, /CREATE TABLE IF NOT EXISTS alunos_fotos/);
    assert.doesNotMatch(up, /DROP|TRUNCATE|DELETE FROM/i); // ON DELETE CASCADE da chave estrangeira é esperado
});

test('telas: foto no vínculo, na solicitação, na secretaria e na portaria; motivo no formulário de casa', () => {
    for (const h of ['home', 'secretaria', 'portaria']) {
        assert.match(ler(`public/${h}.html`), /foto-aluno\.js/, h);
        assert.match(ler(`public/${h}.html`), /foto-aluno\.css/, h);
    }
    assert.match(ler('public/secretaria.html'), /id="fotoAlunoVinculo"/);
    assert.match(ler('public/home.html'), /id="fotoAlunoSolicitacao"/);
    assert.match(ler('public/home.html'), /id="motivoSaida"/);
    assert.match(ler('public/js/general/home.js'), /campoMotivo\.required = casa/);
    assert.match(ler('public/js/general/portaria.js'), /PIFoto\.html\(pedido\.aluno_id/);
    assert.match(ler('public/js/general/secretaria.js'), /PIFoto\.html\(pedido\.aluno_id/);
    assert.match(ler('public/js/general/secretaria.js'), /PIFoto\.enviar\(data\.aluno_id/);
    assert.match(ler('model/pedidosModel.js'), /SELECT p\.pedidos_saida_id, p\.aluno_id,/);
});
