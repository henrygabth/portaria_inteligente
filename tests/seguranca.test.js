// Segurança: limite de tentativas, senha, sessão (token_versao), link de redefinição,
// painel do professor sem "na escola" inventado e fila de e-mails mais robusta.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');

// ---------------------------------------------------------------- bibliotecas simuladas
// (os testes rodam sem node_modules; estas versões mínimas imitam o comportamento usado)
const fakes = {
    jsonwebtoken: {
        sign: (payload) => 'tok.' + Buffer.from(JSON.stringify(payload)).toString('base64url'),
        verify: (token) => {
            if (!String(token).startsWith('tok.')) throw new Error('invalid');
            return JSON.parse(Buffer.from(String(token).slice(4), 'base64url').toString());
        }
    },
    bcrypt: { hash: async s => 'h:' + s, compare: async (s, h) => h === 'h:' + s },
    'google-auth-library': { OAuth2Client: class {} },
    nodemailer: { createTransport: () => ({ sendMail: async () => ({ messageId: 'x' }) }) }
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
    const r = { codigo: 200, corpo: null, cab: {} };
    r.status = c => { r.codigo = c; return r; };
    r.json = c => { r.corpo = c; return r; };
    r.setHeader = (k, v) => { r.cab[k] = v; };
    return r;
};

process.env.JWT_SECRET = 'segredo-de-teste';
mock('config/banco.js', { query: async () => [[]] });

// ---------------------------------------------------------------- limitador e senha
const seg = require(path.join(raiz, 'utils/seguranca.js'));

test('limitador devolve 429 depois do máximo e separa por chave', () => {
    seg.zerarLimites();
    const lim = seg.limitar({ nome: 't', max: 3, janelaMs: 60000, chave: r => r.body.email });
    const chamar = email => { const r = novoRes(); let passou = false; lim({ ip: '1.1.1.1', body: { email } }, r, () => { passou = true; }); return { passou, r }; };
    for (let i = 0; i < 3; i++) assert.equal(chamar('a@x.com').passou, true);
    const bloqueado = chamar('a@x.com');
    assert.equal(bloqueado.passou, false);
    assert.equal(bloqueado.r.codigo, 429);
    assert.ok(bloqueado.r.cab['Retry-After']);
    assert.equal(chamar('b@x.com').passou, true, 'outro e-mail tem contador próprio');
});

test('política de senha: 8+ caracteres, letras e números, até 72 bytes', () => {
    assert.match(seg.validarSenha('curta1'), /8 caracteres/);
    assert.match(seg.validarSenha('somenteletras'), /letras e números/);
    assert.match(seg.validarSenha('12345678'), /letras e números/);
    assert.match(seg.validarSenha('a1' + 'x'.repeat(80)), /72/);
    assert.equal(seg.validarSenha('senhaBoa123'), null);
    assert.equal(seg.escaparHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

test('cabeçalhos de segurança e rotas públicas com limite', () => {
    const r = novoRes(); let ok = false;
    seg.cabecalhosSeguranca({ path: '/api/x', headers: {} }, r, () => { ok = true; });
    assert.ok(ok);
    assert.equal(r.cab['X-Frame-Options'], 'DENY');
    assert.match(r.cab['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.equal(r.cab['Cache-Control'], 'no-store');
    const rotas = ler('api/usuariosRotas.js');
    assert.match(rotas, /rotas\.post\('\/login',\s*\n?\s*limitar/);
    assert.match(rotas, /rotas\.post\('\/recuperar-senha', limitar/);
    assert.doesNotMatch(rotas, /rotas\.put\('\/:id', auth, usuariosController\.atualizarConta\)/, 'rota duplicada removida');
    const idx = ler('index.js');
    assert.match(idx, /app\.disable\('x-powered-by'\)/);
    assert.doesNotMatch(idx, /app\.use\(cors\(\)\)/, 'CORS não fica aberto para qualquer site');
});

// ---------------------------------------------------------------- sessão e redefinição de senha
const usuarios = {
    registro: { status: '1', tipo_usuario: 'PAI', token_versao: 0 },
    trocas: [],
    buscarStatusPorId: async () => usuarios.registro,
    estaAtivo: u => String(u?.status ?? '1') !== '0',
    trocarSenha: async (id, hash) => { usuarios.trocas.push({ id, hash }); usuarios.registro.token_versao++; },
    buscarPorEmail: async () => null,
    buscarPorNome: async () => { throw new Error('login não pode buscar por nome'); }
};
mock('model/usuariosModel.js', usuarios);
const { auth, gerarTokenSessao } = require(path.join(raiz, 'middlewares/authenticar.js'));
const jwt = fakes.jsonwebtoken;

const rodarAuth = async token => {
    const r = novoRes(); let passou = false;
    await auth({ headers: { authorization: `Bearer ${token}` } }, r, () => { passou = true; });
    return { passou, r };
};

test('auth: token de redefinição não serve como login e senha trocada derruba a sessão', async () => {
    usuarios.registro.token_versao = 0;
    const sessao = gerarTokenSessao({ id_usuario: 5, tipo_usuario: 'PAI', nome: 'X', token_versao: 0 });
    assert.equal((await rodarAuth(sessao)).passou, true);
    const reset = jwt.sign({ id_usuario: 5, proposito: 'reset', tv: 0 });
    const r1 = await rodarAuth(reset);
    assert.equal(r1.passou, false);
    assert.equal(r1.r.codigo, 401);
    usuarios.registro.token_versao = 1; // senha foi trocada
    const r2 = await rodarAuth(sessao);
    assert.equal(r2.passou, false);
    assert.equal(r2.r.corpo.sessaoExpirada, true);
});

mock('utils/email.js', { enviarEmail: async () => { await new Promise(r => setTimeout(r, 50)); } });
mock('utils/verificarEmail.js', { verificarEmail: async () => ({ valido: true }) });
const ctl = require(path.join(raiz, 'controller/usuariosController.js'));

test('redefinir senha: só com o link (proposito=reset), uma única vez e com senha forte', async () => {
    usuarios.registro.token_versao = 0; usuarios.trocas.length = 0;
    const chamar = async corpo => { const r = novoRes(); await ctl.redefinirSenha({ body: corpo }, r); return r; };

    const sessao = gerarTokenSessao({ id_usuario: 5, tipo_usuario: 'PAI', token_versao: 0 });
    assert.equal((await chamar({ token: sessao, novaSenha: 'novaSenha123' })).codigo, 400, 'token de login não troca senha');
    const link = jwt.sign({ id_usuario: 5, proposito: 'reset', tv: 0 });
    assert.equal((await chamar({ token: link, novaSenha: 'fraca' })).codigo, 400, 'senha fraca recusada');
    assert.equal((await chamar({ token: link, novaSenha: 'novaSenha123' })).codigo, 200);
    assert.equal(usuarios.trocas.length, 1);
    assert.equal((await chamar({ token: link, novaSenha: 'outraSenha456' })).codigo, 400, 'link já usado');
    assert.equal(usuarios.trocas.length, 1);
});

test('login: e-mail inexistente responde 401 sem tentar achar conta pelo nome', async () => {
    const r = novoRes();
    await ctl.login({ body: { email: 'Fulano', senha: 'qualquer1' } }, r);
    assert.equal(r.codigo, 401);
    assert.equal(r.corpo.erro, 'Credenciais inválidas.');
});

test('recuperação: mesma resposta exista ou não a conta, e não espera o e-mail', async () => {
    const r1 = novoRes();
    await ctl.solicitarRecuperacao({ body: { email: 'ninguem@escola.com' } }, r1);
    usuarios.buscarPorEmail = async () => ({ id_usuario: 5, nome: 'Ana <script>', email: 'ana@escola.com', status: '1', token_versao: 0 });
    const r2 = novoRes();
    const inicio = Date.now();
    await ctl.solicitarRecuperacao({ body: { email: 'ana@escola.com' } }, r2);
    assert.ok(Date.now() - inicio < 40, 'resposta não fica presa no envio do e-mail');
    assert.equal(r1.corpo.mensagem, r2.corpo.mensagem);
    assert.equal(r1.codigo, 200); assert.equal(r2.codigo, 200);
    usuarios.buscarPorEmail = async () => null;
});

test('nenhuma resposta de erro devolve error.message ao navegador', () => {
    for (const f of fs.readdirSync(path.join(raiz, 'controller'))) {
        assert.doesNotMatch(ler(`controller/${f}`), /detalhes?:\s*error\.message/, f);
    }
});

// ---------------------------------------------------------------- painel do professor
test('painel do professor não afirma "na escola" sem registro de chegada', () => {
    const m = ler('model/professoresModel.js');
    assert.match(m, /ELSE 'SEM_SAIDA'/);
    assert.doesNotMatch(m, /ELSE 'DENTRO'/);
    const js = ler('public/js/general/professor.js');
    assert.match(js, /SEM_SAIDA: 'Sem saída hoje'/);
    assert.match(js, /let abaPainel = 'hoje'/, 'abre mostrando só quem teve movimentação hoje');
    assert.doesNotMatch(ler('public/portaria.html'), /tela-entrada/);
});

// ---------------------------------------------------------------- e-mail
test('e-mail: tenta de novo em falha temporária (429) e não insiste em falha permanente (400)', async () => {
    delete require.cache[require.resolve(path.join(raiz, 'utils/email.js'))];
    process.env.BREVO_API_KEY = 'chave';
    process.env.EMAIL_FROM = 'avisos@escola.com.br';
    const respostas = [];
    let chamadas = 0;
    global.fetch = async () => {
        chamadas++;
        const [status, corpo] = respostas.shift();
        return { ok: status < 300, status, headers: { get: () => '0' }, text: async () => JSON.stringify(corpo) };
    };
    const email = require(path.join(raiz, 'utils/email.js'));

    respostas.push([429, { message: 'Too many requests' }], [201, { messageId: 'ok' }]);
    const info = await email.enviarEmail({ to: 'pai@x.com', subject: 's', text: 't' });
    assert.equal(info.messageId, 'ok');
    assert.equal(chamadas, 2);

    chamadas = 0;
    respostas.push([400, { message: 'invalid email' }]);
    await assert.rejects(email.enviarEmail({ to: 'invalido', subject: 's', text: 't' }), e => e.permanente === true);
    assert.equal(chamadas, 1);

    assert.equal(email.erroTemporario({ code: 'ETIMEDOUT' }), true);
    assert.equal(email.erroTemporario({ status: 503 }), true);
    assert.equal(email.erroTemporario({ status: 401 }), false);
    assert.equal(email.erroTemporario({ code: 'EAUTH', responseCode: 535 }), false);
    assert.equal(email.erroTemporario({ responseCode: 421 }), true);
    delete process.env.BREVO_API_KEY;
});

test('fila de e-mail: novos primeiro, espera crescente e descarte de falha permanente', () => {
    const m = ler('model/alertasEmailModel.js');
    assert.match(m, /ORDER BY tentativas ASC, criado_em ASC/);
    assert.match(m, /POW\(2, tentativas - 1\)/);
    assert.match(m, /tentativas < \$\{MAX_TENTATIVAS\}/);
    assert.match(m, /'DESCARTADO', 'PENDENTE'/);
    const a = ler('utils/alertasEmail.js');
    assert.match(a, /CONCORRENCIA/);
    assert.match(a, /Promise\.all/);
});
