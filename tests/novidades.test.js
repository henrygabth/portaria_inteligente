// Novidades: troca obrigatória de senha no 1º acesso, avisos de mensagem do chat por e-mail,
// chat interno secretaria <-> portaria e relatório por período.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const fakes = {
    jsonwebtoken: {
        sign: (payload) => 'tok.' + Buffer.from(JSON.stringify(payload)).toString('base64url'),
        verify: (token) => {
            if (!String(token).startsWith('tok.')) throw new Error('invalid');
            return JSON.parse(Buffer.from(String(token).slice(4), 'base64url').toString());
        }
    },
    bcrypt: { hash: async s => '$2b$h:' + s, compare: async (s, h) => h === '$2b$h:' + s },
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
    const r = { codigo: 200, corpo: null };
    r.status = c => { r.codigo = c; return r; };
    r.json = c => { r.corpo = c; return r; };
    return r;
};
mock('config/banco.js', { query: async () => [[]] });

// ---------------------------------------------------------------- 1º acesso
const usuarios = {
    registro: { status: '1', tipo_usuario: 'PAI', token_versao: 0, primeiro_acesso: 1 },
    senha: '$2b$h:Temp1234',
    trocas: [],
    buscarStatusPorId: async () => usuarios.registro,
    buscarSenhaHashPorId: async () => usuarios.senha,
    buscarContaPorId: async () => ({ email: 'pai@example.test' }),
    buscarPorEmail: async () => ({ id_usuario: 5, tipo_usuario: 'PAI', nome: 'Pai', token_versao: usuarios.registro.token_versao }),
    trocarSenha: async (id, hash) => { usuarios.trocas.push(hash); usuarios.registro.primeiro_acesso = 0; usuarios.registro.token_versao++; },
    estaAtivo: () => true,
    aceites: [],
    registrarAceiteTermos: async (id, v) => { usuarios.aceites.push([id, v]); }
};
mock('model/usuariosModel.js', usuarios);
mock('utils/email.js', { enviarEmail: async () => {} });
mock('utils/verificarEmail.js', { verificarEmail: async () => ({ valido: true }) });
const { auth, gerarTokenSessao } = require(path.join(raiz, 'middlewares/authenticar.js'));

async function rodar(token, rota, metodo = 'GET') {
    const [baseUrl, ...resto] = rota.split(/(?=\/[^/]+$)/);
    const r = novoRes(); let passou = false;
    await auth({ headers: { authorization: `Bearer ${token}` }, baseUrl, path: resto.join('') || '/', method: metodo }, r, () => { passou = true; });
    return { passou, r };
}

test('1º acesso: tudo bloqueado com 403 trocarSenha, exceto a troca e a leitura da conta', async () => {
    usuarios.registro.primeiro_acesso = 1; usuarios.registro.token_versao = 0;
    const t = gerarTokenSessao({ id_usuario: 5, tipo_usuario: 'PAI', token_versao: 0 });
    const bloqueada = await rodar(t, '/api/pedidos/meus');
    assert.equal(bloqueada.passou, false);
    assert.equal(bloqueada.r.codigo, 403);
    assert.equal(bloqueada.r.corpo.trocarSenha, true);
    assert.equal((await rodar(t, '/api/usuarios/primeira-senha', 'POST')).passou, true);
    assert.equal((await rodar(t, '/api/usuarios/conta', 'GET')).passou, true);
    assert.equal((await rodar(t, '/api/usuarios/conta', 'PUT')).passou, false);
    usuarios.registro.primeiro_acesso = 0;
    assert.equal((await rodar(t, '/api/pedidos/meus')).passou, true);
});

const ctl = require(path.join(raiz, 'controller/usuariosController.js'));
test('1º acesso: exige a senha temporária certa, senha forte e diferente; depois libera com token novo', async () => {
    usuarios.registro.primeiro_acesso = 1; usuarios.trocas.length = 0;
    const chamar = async corpo => { const r = novoRes(); await ctl.primeiraSenha({ body: corpo, usuario: { id_usuario: 5 } }, r); return r; };
    assert.equal((await chamar({ senhaAtual: 'errada', novaSenha: 'NovaSenha123' })).codigo, 400);
    assert.equal((await chamar({ senhaAtual: 'Temp1234', novaSenha: 'fraca' })).codigo, 400);
    assert.equal((await chamar({ senhaAtual: 'Temp1234', novaSenha: 'Temp1234' })).codigo, 400);
    assert.equal(usuarios.trocas.length, 0);
    // LGPD: sem aceitar o termo e a política, não conclui o primeiro acesso.
    assert.equal((await chamar({ senhaAtual: 'Temp1234', novaSenha: 'NovaSenha123' })).codigo, 400);
    assert.equal(usuarios.trocas.length, 0);
    const ok = await chamar({ senhaAtual: 'Temp1234', novaSenha: 'NovaSenha123', aceitoTermos: true });
    assert.equal(ok.codigo, 200);
    assert.equal(usuarios.aceites.length, 1);
    assert.ok(ok.corpo.token);
    assert.equal(usuarios.registro.primeiro_acesso, 0);
});

test('login não marca mais o 1º acesso como concluído e o front leva à troca de senha', () => {
    const c = ler('controller/usuariosController.js');
    assert.ok(!/marcarPrimeiroAcessoConcluido\(/.test(c.slice(c.indexOf('login:'), c.indexOf('primeiraSenha:'))));
    assert.match(ler('public/js/general/index.js'), /data\.trocarSenha/);
    assert.match(ler('public/js/general/sessao.js'), /corpo\.trocarSenha/);
    assert.ok(fs.existsSync(path.join(raiz, 'public/trocar-senha.html')));
});

// ---------------------------------------------------------------- avisos do chat por e-mail
test('avisos do chat: e-mail para o responsável e para cada secretária, sempre escapado', async () => {
    const enviados = [], registrados = [];
    mock('model/chatModel.js', {
        pendentesDeAvisoEmail: async () => [
            { responsavel_id: 1, de: 'SECRETARIA', total: 2, ultimo_id: 9, ultimo_texto: 'Olá <b>pai</b>', responsavel_nome: 'Ana', responsavel_email: 'ana@example.test' },
            { responsavel_id: 2, de: 'RESPONSAVEL', total: 1, ultimo_id: 12, ultimo_texto: 'Meu filho sai às 11h', responsavel_nome: 'Bruno <x>', responsavel_email: 'b@example.test', alunos: 'Caio' }
        ],
        emailsSecretaria: async () => [{ nome: 'Sec 1', email: 's1@escola.test' }, { nome: 'Sec 2', email: 's2@escola.test' }],
        registrarAvisoEmail: async (...a) => { registrados.push(a); }
    });
    mock('utils/email.js', { enviarEmail: async e => { enviados.push(e); } });
    delete require.cache[require.resolve(path.join(raiz, 'utils/avisosChat.js'))];
    const { processarAvisosChat } = require(path.join(raiz, 'utils/avisosChat.js'));
    assert.equal(await processarAvisosChat(), 3);
    assert.deepEqual(enviados.map(e => e.to), ['ana@example.test', 's1@escola.test', 's2@escola.test']);
    assert.match(enviados[0].subject, /2 novas mensagens/);
    assert.ok(!enviados[0].html.includes('<b>pai</b>'), 'texto da mensagem escapado');
    assert.ok(!enviados[1].html.includes('Bruno <x>'), 'nome escapado');
    assert.deepEqual(registrados, [[1, 'SECRETARIA', 9], [2, 'RESPONSAVEL', 12]]);
    assert.match(ler('utils/agendador.js'), /processarAvisosChat/);
});

// ---------------------------------------------------------------- chat interno
test('chat interno: ADMIN e SECRETARIA falam pelo lado da secretaria, PORTEIRO pela portaria', () => {
    const { ladoDoPapel } = require(path.join(raiz, 'model/chatEquipeModel.js'));
    assert.equal(ladoDoPapel('ADMIN'), 'SECRETARIA');
    assert.equal(ladoDoPapel('secretaria'), 'SECRETARIA');
    assert.equal(ladoDoPapel('PORTEIRO'), 'PORTARIA');
    assert.equal(ladoDoPapel('PAI'), null);
    const rotas = ler('api/chatRotas.js');
    assert.match(rotas, /'\/equipe', auth, exigirPapel\('SECRETARIA', 'ADMIN', 'PORTARIA', 'PORTEIRO'\)/);
    assert.ok(!/equipe[^\n]*'PAI'/.test(rotas), 'responsável não entra no chat interno');
    for (const f of ['public/secretaria.html', 'public/portaria.html']) {
        const html = ler(f);
        assert.match(html, /id="tela-equipe"/);
        assert.match(html, /chat-equipe\.js/);
        assert.match(html, /notificacoes\.js/);
    }
    assert.match(ler('public/js/general/layout.js'), /tela-equipe/);
});

test('notificações: sino, som, contador no título e aviso do navegador', () => {
    const js = ler('public/js/general/notificacoes.js');
    for (const trecho of ['pi-sino', 'AudioContext', 'document.title', 'new Notification']) assert.ok(js.includes(trecho), trecho);
    assert.match(ler('public/home.html'), /notificacoes\.js/);
    assert.match(ler('public/js/general/chat.js'), /PINotif\.definir\('chat'/);
});

// ---------------------------------------------------------------- relatório
const rel = require(path.join(raiz, 'model/relatoriosModel.js'));
const { lerPeriodo } = require(path.join(raiz, 'controller/relatoriosController.js'));

test('relatório: período validado (formato, ordem, até 1 ano, turma numérica)', () => {
    assert.deepEqual(lerPeriodo({ inicio: '2026-11-01', fim: '2026-11-10' }), { inicio: '2026-11-01', fim: '2026-11-10', turma: null });
    assert.ok(lerPeriodo({ inicio: '2026-11-10', fim: '2026-11-01' }).erro);
    assert.ok(lerPeriodo({ inicio: '2026-02-30', fim: '2026-03-01' }).erro);
    assert.ok(lerPeriodo({ inicio: '2024-01-01', fim: '2026-01-01' }).erro);
    assert.ok(lerPeriodo({ inicio: '2026-11-01', turma: '1 OR 1=1' }).erro);
    assert.equal(lerPeriodo({ inicio: '2026-11-01', turma: '4' }).turma, 4);
});

test('relatório: números do resumo, dos gráficos e da tabela saem da mesma base', () => {
    const d = (h) => new Date(`2026-11-10T${h}:00`);
    const linhas = [
        // saiu 11h, devia voltar 12h, voltou 12h03 (no prazo, tolerância 5 min)
        { id: 1, aluno: 'Ana', turma: '1A', tipo: 'ALMOCO', motivo: 'Almoço', status: 'CONCLUIDA', criado_em: d('08:00'), decidido_em: d('08:20'),
          saida_prevista: d('11:00'), saida_real: d('11:02'), retorno_previsto: d('12:00'), retorno_real: d('12:03') },
        // voltou 12h30: 30 min de atraso
        { id: 2, aluno: 'Beto', turma: '1A', tipo: 'ALMOCO', motivo: 'Almoço', status: 'CONCLUIDA', criado_em: d('08:00'), decidido_em: d('08:40'),
          saida_prevista: d('11:00'), saida_real: d('11:05'), retorno_previsto: d('12:00'), retorno_real: d('12:30') },
        // ainda fora e já atrasado (agora = 14h)
        { id: 3, aluno: 'Caio', turma: '2B', tipo: 'ALMOCO', motivo: 'Médico', status: 'EM_SAIDA', criado_em: d('09:00'), decidido_em: d('09:10'),
          saida_prevista: d('12:00'), saida_real: d('12:10'), retorno_previsto: d('13:00'), retorno_real: null },
        // foi para casa: sem retorno
        { id: 4, aluno: 'Duda', turma: '2B', tipo: 'CASA', motivo: 'Médico', status: 'CONCLUIDA', criado_em: d('09:00'), decidido_em: d('09:30'),
          saida_prevista: d('13:00'), saida_real: d('13:00'), retorno_previsto: null, retorno_real: null },
        // recusado
        { id: 5, aluno: 'Edu', turma: null, tipo: 'ALMOCO', motivo: '', status: 'RECUSADA', criado_em: d('09:00'), decidido_em: d('10:00'),
          saida_prevista: d('11:00'), saida_real: null, retorno_previsto: d('12:00'), retorno_real: null }
    ];
    const r = rel.montarRelatorio(linhas, '2026-11-09', '2026-11-10', d('14:00'));
    assert.equal(r.periodo.dias, 2);
    assert.equal(r.resumo.pedidos, 5);
    assert.equal(r.resumo.saidas, 4);
    assert.equal(r.resumo.paraCasa, 1);
    assert.equal(r.resumo.retornosNoPrazo, 1);
    assert.equal(r.resumo.retornosAtrasados, 1);
    assert.equal(r.resumo.aindaForaAtrasados, 1);
    assert.equal(r.resumo.pontualidade, 50);
    assert.equal(r.resumo.taxaAprovacao, 80);
    assert.equal(r.resumo.tempoMedioRespostaMin, 32); // (20+40+10+30+60)/5
    assert.equal(r.resumo.atrasoMedioMin, 45);        // (30 + 60)/2
    assert.deepEqual(r.porDia.map(x => [x.dia, x.saidas, x.atrasos]), [['2026-11-09', 0, 0], ['2026-11-10', 4, 2]]);
    assert.equal(r.porHora.reduce((s, h) => s + h.total, 0), r.resumo.saidas);
    assert.equal(r.porTurma[0].turma, '1A');
    assert.equal(r.porTurma.find(t => t.turma === 'Sem turma').pedidos, 1);
    assert.equal(r.porMotivo.find(m => m.motivo === 'Sem motivo informado').total, 1);
    assert.equal(r.detalhes.find(p => p.id === 3).situacao, 'fora_atrasado');
    assert.equal(r.detalhes.find(p => p.id === 4).situacao, 'sem_retorno');
    assert.equal(r.detalhes.find(p => p.id === 5).situacao, null);
});

test('relatório: tela nova com filtros de período, exportação e impressão', () => {
    const html = ler('public/secretaria.html');
    for (const id of ['relPresets', 'relInicio', 'relFim', 'relTurma', 'relCsv', 'relImprimir', 'relConteudo']) assert.match(html, new RegExp(`id="${id}"`), id);
    assert.match(ler('index.js'), /\/api\/relatorios/);
    assert.match(ler('api/relatoriosRotas.js'), /exigirPapel\('SECRETARIA', 'ADMIN'\)/);
});
