// Notificações no celular, conferência por foto, importação de alunos, auditoria,
// login em duas etapas, backup/saúde do sistema e LGPD.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Module = require('node:module');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
delete process.env.DOIS_FATORES;

// ------------------------------------------------------------------ dublês
const fakes = {
    jsonwebtoken: {
        sign: (payload) => 'tok.' + Buffer.from(JSON.stringify(payload)).toString('base64url'),
        verify: (token) => JSON.parse(Buffer.from(String(token).slice(4), 'base64url').toString())
    },
    bcrypt: { hash: async s => '$2b$h:' + s, compare: async (s, h) => h === '$2b$h:' + s },
    'google-auth-library': { OAuth2Client: class {} },
    nodemailer: { createTransport: () => ({ sendMail: async () => ({}) }) }
};
const resolverOriginal = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
    if (fakes[pedido]) return `fake:${pedido}`;
    return resolverOriginal.call(this, pedido, ...resto);
};
for (const [nome, exp] of Object.entries(fakes)) require.cache[`fake:${nome}`] = { id: nome, filename: nome, loaded: true, exports: exp };
const mock = (arquivo, exports) => {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename: id, loaded: true, exports };
};
const novoRes = () => {
    const r = { codigo: 200, corpo: null, cabecalhos: {} };
    r.status = c => { r.codigo = c; return r; };
    r.json = c => { r.corpo = c; return r; };
    r.set = h => { Object.assign(r.cabecalhos, h); return r; };
    r.send = c => { r.corpo = c; return r; };
    return r;
};
const auditados = [];
mock('config/banco.js', { query: async () => [[]], getConnection: async () => ({ beginTransaction() {}, query: async () => [[]], commit() {}, rollback() {}, release() {} }) });
mock('model/auditoriaModel.js', { inserir: async l => { auditados.push(l); } });
const emails = [];
mock('utils/email.js', { enviarEmail: async o => { emails.push(o); } });
mock('utils/verificarEmail.js', { verificarEmail: async () => ({ valido: true }) });
const esperar = () => new Promise(r => setImmediate(() => setImmediate(r)));

// ================================================================== WEB PUSH
const push = require(path.join(raiz, 'utils/push.js'));

test('push: criptografia confere com o vetor oficial da RFC 8291', () => {
    const local = crypto.createECDH('prime256v1');
    local.setPrivateKey(Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'));
    const corpo = push.criptografar('When I grow up, I want to be a watermelon',
        'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
        { ecdh: local, salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url') });
    assert.equal(corpo.toString('base64url'),
        'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('push: o navegador consegue abrir a mensagem (acentos incluídos)', () => {
    const cli = crypto.createECDH('prime256v1'); cli.generateKeys();
    const auth = crypto.randomBytes(16).toString('base64url');
    const texto = JSON.stringify({ titulo: 'Lucas saiu da escola', corpo: 'Saída às 11:55. Retorno previsto: 13:00.' });
    assert.equal(push.descriptografar(push.criptografar(texto, cli.getPublicKey().toString('base64url'), auth), cli, auth), texto);
});

test('push: assinatura VAPID (ES256) é válida para o serviço de push', () => {
    const chaves = push.gerarChavesVapid();
    const cab = push.cabecalhoVapid('https://fcm.googleapis.com/fcm/send/abc', chaves, 'mailto:escola@exemplo.com');
    const [, jwt, k] = cab.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(k, chaves.publica);
    const [h, c, s] = jwt.split('.');
    const pub = Buffer.from(chaves.publica, 'base64url');
    const chave = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: chave, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
    assert.equal(JSON.parse(Buffer.from(c, 'base64url')).aud, 'https://fcm.googleapis.com');
});

test('push: envio usa aes128gcm e marca inscrição expirada (410) para apagar', async () => {
    process.env.VAPID_PUBLIC_KEY = 'x'; push._limparCache();
    const ch = push.gerarChavesVapid();
    process.env.VAPID_PUBLIC_KEY = ch.publica; process.env.VAPID_PRIVATE_KEY = ch.privada; push._limparCache();
    const cli = crypto.createECDH('prime256v1'); cli.generateKeys();
    const ins = { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', p256dh: cli.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
    let pedido = null;
    const ok = await push.enviarParaInscricao(ins, { titulo: 'Teste', tag: 'pedido-1' }, { fetch: async (url, o) => { pedido = o; return { ok: true, status: 201 }; } });
    assert.deepEqual(ok, { ok: true });
    assert.equal(pedido.headers['Content-Encoding'], 'aes128gcm');
    assert.match(pedido.headers.Authorization, /^vapid t=.+, k=/);
    assert.equal(JSON.parse(push.descriptografar(pedido.body, cli, ins.auth)).titulo, 'Teste');
    const exp = await push.enviarParaInscricao(ins, { titulo: 'x' }, { fetch: async () => ({ ok: false, status: 410 }) });
    assert.equal(exp.expirada, true);
});

test('push: só aceita inscrição https com chaves do tamanho certo', () => {
    const { _inscricaoValida: valida } = require(path.join(raiz, 'controller/pushController.js'));
    const cli = crypto.createECDH('prime256v1'); cli.generateKeys();
    const keys = { p256dh: cli.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
    assert.equal(valida({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys }), true);
    assert.equal(valida({ endpoint: 'http://fcm.googleapis.com/x', keys }), false);
    assert.equal(valida({ endpoint: 'https://x.com', keys: { ...keys, p256dh: 'abc' } }), false);
    assert.equal(valida(null), false);
});

test('push: textos dos avisos para a família e para a equipe', () => {
    const { textos } = require(path.join(raiz, 'utils/avisosPush.js'));
    const p = { nome_aluno: 'Lucas Martins', turma: '2º A', hora_saida_real: '2026-11-16T11:55:00', hora_prevista_retorno: '2026-11-16T13:00:00' };
    assert.match(textos('SAIDA', p).familia[0], /Lucas saiu da escola/);
    assert.match(textos('SAIDA', p).familia[1], /11:55/);
    assert.equal(textos('APROVADA', p).equipe, undefined);
    assert.match(textos('NAO_RETORNOU', p).equipe[1], /Lucas Martins \(2º A\)/);
    assert.ok(textos('ATRASADO', p).familia && textos('ATRASADO', p).equipe);
});

test('push: o mesmo aviso não é enviado duas vezes (agendador repete a cada minuto)', async () => {
    let enviados = 0, publicados = 0;
    mock('model/pushModel.js', {
        vistos: new Set(),
        async marcarAvisado(id, tipo) { const k = id + tipo; if (this.vistos.has(k)) return false; this.vistos.add(k); return true; },
        responsaveisDoPedido: async () => [5], usuariosComPapel: async () => [2], listarPorUsuarios: async () => []
    });
    mock('model/pedidosModel.js', { buscarParaNotificacao: async () => ({ nome_aluno: 'Ana', hora_prevista_retorno: '2026-11-16T13:00:00' }) });
    const pushId = require.resolve(path.join(raiz, 'utils/push.js'));
    const tr = require(path.join(raiz, 'utils/tempoReal.js'));
    const orig = tr.publicarParaPapeis; tr.publicarParaPapeis = () => { publicados++; return 0; };
    const origU = push.enviarParaUsuarios, origP = push.enviarParaPapeis;
    push.enviarParaUsuarios = async () => { enviados++; return 1; }; push.enviarParaPapeis = async () => { enviados++; return 1; };
    delete require.cache[require.resolve(path.join(raiz, 'utils/avisosPush.js'))];
    require.cache[pushId].exports = push;
    const { _avisarPedido } = require(path.join(raiz, 'utils/avisosPush.js'));
    await _avisarPedido(7, 'ATRASADO');
    await _avisarPedido(7, 'ATRASADO');
    assert.equal(enviados, 2);  // família + equipe, uma vez só
    assert.equal(publicados, 1); // aviso na tela da secretaria/portaria
    tr.publicarParaPapeis = orig; push.enviarParaUsuarios = origU; push.enviarParaPapeis = origP;
});

test('service worker mostra a notificação e abre a tela certa ao tocar', () => {
    const sw = ler('public/sw.js');
    assert.match(sw, /addEventListener\('push'/);
    assert.match(sw, /showNotification/);
    assert.match(sw, /notificationclick/);
    assert.match(sw, /openWindow/);
});

// ================================================================== PORTARIA: FOTO
test('portaria confere a foto antes de liberar e "não é o aluno" avisa a secretaria', () => {
    const js = ler('public/js/general/portaria.js');
    assert.match(js, /function confirmarIdentidade/);
    assert.match(js, /É o aluno/);
    assert.match(js, /\/auditoria\/identificacao/);
    assert.doesNotMatch(js.slice(js.indexOf('async function liberarSaida')), /confirm\(pergunta\)/);
});

// ================================================================== IMPORTAÇÃO
const { conferir, lerData } = require(path.join(raiz, 'utils/importarAlunos.js'));
const TURMAS = [{ id_turma: 1, sala_turma: '1º A' }, { id_turma: 2, sala_turma: '2º A' }];

test('importação: datas em dd/mm/aaaa, aaaa-mm-dd e número do Excel', () => {
    assert.deepEqual(lerData('14/03/2011'), { ok: true, valor: '2011-03-14' });
    assert.deepEqual(lerData('2011-03-14'), { ok: true, valor: '2011-03-14' });
    assert.deepEqual(lerData('40616'), { ok: true, valor: '2011-03-14' });
    assert.equal(lerData('31/02/2012').ok, false);
    assert.equal(lerData('').valor, null);
});

test('importação: confere turma (sem diferenciar acento/maiúscula), duplicados e erros', () => {
    const r = conferir([
        { nome: 'Bruno Teixeira', matricula: '27001', turma: '1º a' },
        { nome: 'Ana Clara Dias', matricula: '24001', turma: '2º A' },
        { nome: 'Eduarda Lima', turma: '9º Z' },
        { nome: 'X', turma: '1º A' },
        { nome: 'Bruno Teixeira', matricula: '27009', turma: '1º A' },
        { nome: 'Carla <script>', turma: '1º A' }
    ], TURMAS, { matriculasExistentes: new Set(['24001']), nomesExistentes: new Set() });
    assert.deepEqual(r.map(l => l.situacao), ['novo', 'existe', 'erro', 'erro', 'erro', 'erro']);
    assert.equal(r[0].turma_id, 1);
    assert.match(r[2].motivo, /não existe/);
    assert.match(r[4].motivo, /repetido/);
    const comCriacao = conferir([{ nome: 'Eduarda Lima', turma: '9º Z' }], TURMAS, { criarTurmas: true });
    assert.equal(comCriacao[0].situacao, 'novo');
    assert.equal(comCriacao[0].turma_nova, true);
    assert.throws(() => conferir([], TURMAS), /vazia/);
});

test('importação: leitor de CSV do navegador (separador ; e aspas)', () => {
    const ctx = { window: {}, TextDecoder, Uint8Array, DataView, Blob: class {}, Response: class {} };
    vm.runInNewContext(ler('public/js/general/planilha.js'), ctx);
    const linhas = ctx.window.PIPlanilha._lerCsv('Nome;Turma\r\n"Silva; Ana";1º A\r\nPedro "Pê";2º A\r\n');
    assert.deepEqual(JSON.parse(JSON.stringify(linhas)), [['Nome', 'Turma'], ['Silva; Ana', '1º A'], ['Pedro "Pê"', '2º A']]);
    assert.equal(ctx.window.PIPlanilha._colunaIndice('AB12'), 27);
});

test('importação: rota só para secretaria/admin, com limite de 1 MB', () => {
    assert.match(ler('api/alunosRotas.js'), /rotas\.post\('\/importar', auth, exigirPapel\('SECRETARIA', 'ADMIN'\)/);
    assert.match(ler('index.js'), /\/api\/alunos\/importar' \? jsonGrande/);
});

// ================================================================== AUDITORIA
test('auditoria: registra em segundo plano e nunca derruba a operação', async () => {
    const { registrar } = require(path.join(raiz, 'utils/auditoria.js'));
    registrar({ usuario: { id_usuario: 2, nome: 'Ivone', tipo_usuario: 'secretaria' }, ip: '10.0.0.1' }, 'PEDIDO_APROVADO', { alvo_tipo: 'PEDIDO', alvo_id: 48 });
    await esperar();
    const l = auditados.at(-1);
    assert.equal(l.acao, 'PEDIDO_APROVADO');
    assert.equal(l.papel, 'SECRETARIA');
    assert.equal(l.descricao, 'Saída aprovada');
    assert.equal(l.ip, '10.0.0.1');
});

test('auditoria: CSV protege contra fórmula no Excel e filtros são validados', () => {
    const ctl = require(path.join(raiz, 'controller/auditoriaController.js'));
    assert.equal(ctl._csv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(ctl._csv('normal'), 'normal');
    const f = ctl._lerFiltros({ de: '2026-11-01', ate: "2026-11-30' OR 1=1", acao: 'DROP', usuario: '12' });
    assert.deepEqual(f, { de: '2026-11-01', ate: null, acao: null, usuario: 12, busca: null });
});

test('auditoria: aprovar, recusar, liberar, retorno e cadastros ficam registrados', () => {
    const p = ler('controller/pedidosController.js');
    ['PEDIDO_APROVADO', 'PEDIDO_RECUSADO', 'SAIDA_REGISTRADA', 'RETORNO_REGISTRADO', 'PEDIDO_CANCELADO'].forEach(a => assert.match(p, new RegExp(`'${a}'`), a));
    const u = ler('controller/usuariosController.js');
    ['LOGIN', 'LOGIN_FALHOU', 'USUARIO_CRIADO', 'PERFIL_DESATIVADO', 'SENHA_REDEFINIDA', 'RESPONSAVEL_VINCULADO'].forEach(a => assert.match(u, new RegExp(a), a));
    assert.match(ler('controller/alunosController.js'), /ALUNO_APAGADO/);
    assert.doesNotMatch(ler('model/auditoriaModel.js'), /UPDATE auditoria|DELETE FROM auditoria/);
});

// ================================================================== 2 ETAPAS + LGPD
const codigos = [];
const confiaveis = new Set();
const doisFatores = {
    hash: t => crypto.createHash('sha256').update(String(t)).digest('hex'),
    criarCodigo: async (u, desafio, codigo) => { codigos.push({ codigo_id: codigos.length + 1, usuario_id: u, desafio, codigo_hash: doisFatores.hash(codigo), tentativas: 0, usado: 0, codigo }); },
    codigosRecentes: async () => 0,
    buscarDesafio: async d => { const c = codigos.find(x => x.desafio === d && !x.usado); return c ? { ...c } : null; },
    registrarErro: async id => { codigos[id - 1].tentativas++; },
    marcarUsado: async id => { if (codigos[id - 1].usado) return false; codigos[id - 1].usado = 1; return true; },
    confiarAparelho: async (u, token) => { confiaveis.add(u + ':' + token); },
    aparelhoConfiavel: async (u, token) => confiaveis.has(u + ':' + token),
    esquecerAparelhos: async () => {}, limparAntigos: async () => {}
};
mock('model/doisFatoresModel.js', doisFatores);
const contas = {
    'ivone@escola.test': { id_usuario: 2, nome: 'Ivone', email: 'ivone@escola.test', tipo_usuario: 'SECRETARIA', senha: '$2b$h:Senha1234', status: '1', token_versao: 0, primeiro_acesso: 0, termos_versao: '2026-11' },
    'pai@familia.test': { id_usuario: 5, nome: 'Fernanda', email: 'pai@familia.test', tipo_usuario: 'PAI', senha: '$2b$h:Senha1234', status: '1', token_versao: 0, primeiro_acesso: 0, termos_versao: null }
};
const usuarios = {
    anonimizados: [], emAndamento: 0,
    buscarPorEmail: async e => contas[e] || null,
    buscarContaPorId: async id => Object.values(contas).find(c => c.id_usuario === id) || null,
    buscarSenhaHashPorId: async id => Object.values(contas).find(c => c.id_usuario === id)?.senha,
    estaAtivo: u => String(u.status) === '1',
    pedidosEmAndamento: async () => usuarios.emAndamento,
    anonimizar: async id => { usuarios.anonimizados.push(id); },
    exportarDados: async id => ({ conta: { id_usuario: id }, alunos_vinculados: [] }),
    registrarAceiteTermos: async () => {}
};
mock('model/usuariosModel.js', usuarios);
const ctlU = require(path.join(raiz, 'controller/usuariosController.js'));
const chamar = async (fn, body, usuario) => { const r = novoRes(); await fn({ body, usuario, headers: {}, ip: '127.0.0.1' }, r); return r; };

test('2 etapas: secretaria recebe código por e-mail; família entra direto', async () => {
    const pai = await chamar(ctlU.login, { email: 'pai@familia.test', senha: 'Senha1234' });
    assert.ok(pai.corpo.token);
    assert.equal(pai.corpo.aceitarTermos, true); // LGPD: ainda não aceitou a versão atual
    const sec = await chamar(ctlU.login, { email: 'ivone@escola.test', senha: 'Senha1234' });
    assert.equal(sec.corpo.doisFatores, true);
    assert.equal(sec.corpo.token, undefined);
    assert.match(sec.corpo.email, /^i\*+e@escola\.test$/);
    await esperar();
    assert.match(emails.at(-1).subject, /^\d{6} é o seu código de acesso/);
});

test('2 etapas: código errado conta tentativa; certo entra e pode confiar no aparelho', async () => {
    const sec = await chamar(ctlU.login, { email: 'ivone@escola.test', senha: 'Senha1234' });
    const registro = codigos.at(-1);
    const errado = registro.codigo === '000000' ? '111111' : '000000';
    const r1 = await chamar(ctlU.confirmarCodigo, { desafio: sec.corpo.desafio, codigo: errado });
    assert.equal(r1.codigo, 400); assert.match(r1.corpo.erro, /4 tentativa/);
    const r2 = await chamar(ctlU.confirmarCodigo, { desafio: sec.corpo.desafio, codigo: registro.codigo, confiar: true });
    assert.equal(r2.codigo, 200); assert.ok(r2.corpo.token); assert.ok(r2.corpo.dispositivo);
    // Reusar o mesmo código não funciona.
    assert.equal((await chamar(ctlU.confirmarCodigo, { desafio: sec.corpo.desafio, codigo: registro.codigo })).codigo, 400);
    // Aparelho confiável: próximo login sem código.
    const direto = await chamar(ctlU.login, { email: 'ivone@escola.test', senha: 'Senha1234', dispositivo: r2.corpo.dispositivo });
    assert.ok(direto.corpo.token);
    assert.equal(direto.corpo.doisFatores, undefined);
});

test('2 etapas: 5 erros bloqueiam o código', async () => {
    const sec = await chamar(ctlU.login, { email: 'ivone@escola.test', senha: 'Senha1234' });
    codigos.at(-1).tentativas = 5;
    const r = await chamar(ctlU.confirmarCodigo, { desafio: sec.corpo.desafio, codigo: codigos.at(-1).codigo });
    assert.equal(r.codigo, 429); assert.equal(r.corpo.expirado, true);
});

test('LGPD: baixar meus dados gera um arquivo JSON', async () => {
    const r = await chamar(ctlU.meusDados, {}, { id_usuario: 5, tipo_usuario: 'PAI' });
    assert.match(r.cabecalhos['Content-Disposition'], /attachment; filename="meus-dados/);
    assert.equal(JSON.parse(r.corpo).conta.id_usuario, 5);
});

test('LGPD: exclusão exige senha + EXCLUIR, só para responsável e sem saída em andamento', async () => {
    const pai = { id_usuario: 5, tipo_usuario: 'PAI' };
    assert.equal((await chamar(ctlU.excluirConta, { senha: 'Senha1234', confirmacao: 'EXCLUIR' }, { id_usuario: 2, tipo_usuario: 'SECRETARIA' })).codigo, 403);
    assert.equal((await chamar(ctlU.excluirConta, { senha: 'Senha1234', confirmacao: 'sim' }, pai)).codigo, 400);
    assert.equal((await chamar(ctlU.excluirConta, { senha: 'errada', confirmacao: 'EXCLUIR' }, pai)).codigo, 400);
    usuarios.emAndamento = 1;
    assert.equal((await chamar(ctlU.excluirConta, { senha: 'Senha1234', confirmacao: 'EXCLUIR' }, pai)).codigo, 409);
    usuarios.emAndamento = 0;
    const ok = await chamar(ctlU.excluirConta, { senha: 'Senha1234', confirmacao: 'EXCLUIR' }, pai);
    assert.equal(ok.codigo, 200);
    assert.deepEqual(usuarios.anonimizados, [5]);
});

test('LGPD: aceite exige a versão atual; página da política existe e não cita instituição de ensino', async () => {
    const { VERSAO_TERMOS } = require(path.join(raiz, 'utils/lgpd.js'));
    assert.equal((await chamar(ctlU.aceitarTermos, { aceito: true, versao: 'velha' }, { id_usuario: 5 })).codigo, 400);
    assert.equal((await chamar(ctlU.aceitarTermos, { aceito: true, versao: VERSAO_TERMOS }, { id_usuario: 5 })).codigo, 200);
    const pol = ler('public/politica-privacidade.html');
    assert.match(pol, new RegExp(`Versão ${VERSAO_TERMOS}`));
    assert.match(pol, /art\. 18/);
    assert.doesNotMatch(pol, /SENAI|TCC/i);
    assert.match(ler('public/trocar-senha.html'), /id="tsTermos"/);
});

// ================================================================== BACKUP E SAÚDE
test('backup: SQL com CREATE + INSERT e valores escapados, compactado em gzip', async () => {
    const { valorSql, escreverBackup } = require(path.join(raiz, 'utils/backup.js'));
    assert.equal(valorSql("O'Neil\\n"), "'O\\'Neil\\\\n'");
    assert.equal(valorSql(null), 'NULL');
    assert.equal(valorSql(Buffer.from([0xff, 0xd8])), "X'ffd8'");
    const db = {
        query: async (sql) => {
            if (/DATABASE\(\)/.test(sql)) return [[{ banco: 'escola', versao: '8.0' }]];
            if (/SHOW FULL TABLES/.test(sql)) return [[{ Tables_in_escola: 'turmas' }]];
            if (/SHOW CREATE TABLE/.test(sql)) return [[{ 'Create Table': 'CREATE TABLE `turmas` (`id_turma` int)' }]];
            if (/SELECT \* FROM `turmas`/.test(sql)) return [[{ id_turma: 1, sala_turma: "1º A'" }]];
            return [[]];
        }
    };
    const partes = [];
    await escreverBackup(new Writable({ write(c, e, cb) { partes.push(c); cb(); } }), db);
    const sql = zlib.gunzipSync(Buffer.concat(partes)).toString();
    assert.match(sql, /DROP TABLE IF EXISTS `turmas`;\nCREATE TABLE `turmas`/);
    assert.match(sql, /INSERT INTO `turmas` \(`id_turma`, `sala_turma`\) VALUES\n\(1, '1º A\\''\);/);
    assert.match(sql, /SET FOREIGN_KEY_CHECKS = 1/);
});

test('saúde do sistema: situação geral pelo pior item; backup só para ADMIN', () => {
    const { _nivel } = require(path.join(raiz, 'controller/sistemaController.js'));
    assert.equal(_nivel([{ situacao: 'ok' }, { situacao: 'atencao' }]), 'atencao');
    assert.equal(_nivel([{ situacao: 'ok' }, { situacao: 'erro' }, { situacao: 'atencao' }]), 'erro');
    assert.equal(_nivel([{ situacao: 'ok' }]), 'ok');
    const rotas = ler('api/sistemaRotas.js');
    assert.match(rotas, /get\('\/backup', auth, exigirPapel\('ADMIN'\)/);
    assert.match(rotas, /get\('\/saude', auth, exigirPapel\('ADMIN', 'SECRETARIA'\)/);
});

test('telas novas: auditoria, saúde, importar, privacidade e avisos no celular', () => {
    const sec = ler('public/secretaria.html');
    ['tela-auditoria', 'tela-saude', 'btnImportarAlunos', 'admin-recursos.js', 'planilha.js'].forEach(t => assert.ok(sec.includes(t), t));
    assert.match(ler('public/js/general/layout.js'), /tela-auditoria/);
    for (const p of ['public/home.html', 'public/conta.html']) {
        assert.match(ler(p), /data-privacidade/, p);
        assert.match(ler(p), /privacidade\.js/, p);
    }
    for (const p of ['public/home.html', 'public/secretaria.html', 'public/portaria.html']) assert.match(ler(p), /push-cliente\.js/, p);
    assert.match(ler('public/js/general/index.js'), /usuarios\/login\/codigo/);
});

test('tabelas novas são criadas sozinhas ao iniciar', () => {
    const { TABELAS_NOVAS } = require(path.join(raiz, 'utils/migrar.js'));
    assert.deepEqual(TABELAS_NOVAS.map(t => t[0]), ['config_sistema', 'push_inscricoes', 'push_envios', 'auditoria', 'login_codigos', 'dispositivos_confiaveis']);
    const sql = ler('database/migration_seguranca_lgpd_push_up.sql');
    TABELAS_NOVAS.forEach(([n]) => assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${n}`)));
});
