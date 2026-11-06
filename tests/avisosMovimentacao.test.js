// Saída e retorno (no horário ou atrasado) avisam TODOS os grupos pela mesma fila dos alertas de atraso.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const mock = (arquivo, exports) => {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename: id, loaded: true, exports };
};
const ler = p => fs.readFileSync(path.join(raiz, p), 'utf8');

const enviados = [];
const montagens = [];
const acoes = [];
let pedido = {};
let pendentes = [];
mock('utils/email.js', { enviarEmail: async ({ to, subject }) => { enviados.push({ to, subject }); } });
mock('utils/emailTemplate.js', { montarEmailHtml: dados => { montagens.push(dados); return '<p>ok</p>'; } });
mock('model/pedidosModel.js', { buscarParaNotificacao: async () => pedido });
mock('model/ocorrenciasModel.js', { registrar: async () => {} });
mock('model/alertasEmailModel.js', {
    listarEventosRecentes: async () => [],
    enfileirar: async (...args) => { acoes.push(['enfileirar', ...args]); return 4; },
    listarEnviosPendentes: async () => pendentes,
    reservarEnvio: async () => true,
    destinatarioAindaAutorizado: async () => true,
    concluirEnvio: async id => { acoes.push(['concluir', id]); },
    falharEnvio: async id => { acoes.push(['falhou', id]); },
    descartarEnvio: async id => { acoes.push(['descartado', id]); }
});
const alertas = require(path.join(raiz, 'utils/alertasEmail.js'));

const GRUPOS = ['RESPONSAVEL', 'SECRETARIA', 'PORTARIA', 'PROFESSOR'];
const fila = tipo => GRUPOS.map((categoria, i) => ({
    envio_id: i + 1, pedido_id: 5, tipo_evento: tipo, email_destino: `${categoria.toLowerCase()}@escola.test`, categoria
}));

test('saída é enviada a responsáveis, secretaria, portaria e professor', async () => {
    enviados.length = 0; montagens.length = 0; acoes.length = 0;
    pedido = { status: 'EM_SAIDA', nome_aluno: 'Ana', turma: '1º DS', hora_saida_real: new Date(), hora_prevista_retorno: new Date() };
    pendentes = fila('SAIDA');
    await alertas.processarAlertas();
    assert.equal(enviados.length, 4);
    assert(enviados.every(e => /Saída registrada - Ana/.test(e.subject)));
    assert.equal(acoes.filter(a => a[0] === 'concluir').length, 4);
    // cada grupo recebe a frase de contexto própria
    const textos = montagens.map(m => m.paragrafos.at(-1));
    assert.equal(new Set(textos).size, 4);
    assert(textos.some(t => /professor/i.test(t)));
});

test('retorno e chegada atrasada continuam sendo enviados mesmo com o aluno já de volta', async () => {
    for (const tipo of ['RETORNO', 'CHEGOU_ATRASADO']) {
        enviados.length = 0; acoes.length = 0;
        pedido = { status: 'CONCLUIDA', nome_aluno: 'Ana', turma: '1º DS', hora_retorno_real: new Date(), hora_prevista_retorno: new Date() };
        pendentes = fila(tipo);
        await alertas.processarAlertas();
        assert.equal(enviados.length, 4, tipo);
        assert.equal(acoes.filter(a => a[0] === 'descartado').length, 0, tipo);
    }
});

test('atraso e não retorno continuam descartados quando o aluno já voltou', async () => {
    for (const tipo of ['ATRASADO', 'NAO_RETORNOU']) {
        enviados.length = 0; acoes.length = 0;
        pedido = { status: 'CONCLUIDA', nome_aluno: 'Ana', hora_prevista_retorno: new Date() };
        pendentes = fila(tipo);
        await alertas.processarAlertas();
        assert.equal(enviados.length, 0, tipo);
        assert.equal(acoes.filter(a => a[0] === 'descartado').length, 4, tipo);
    }
});

test('tolerância de 5 minutos define retorno no horário x atrasado', () => {
    const previsto = new Date('2026-10-30T13:00:00-03:00');
    const com = min => ({ hora_prevista_retorno: previsto, hora_retorno_real: new Date(previsto.getTime() + min * 60000) });
    assert.equal(alertas.retornouAtrasado(com(0)), false);
    assert.equal(alertas.retornouAtrasado(com(5)), false);
    assert.equal(alertas.retornouAtrasado(com(6)), true);
    assert.equal(alertas.retornouAtrasado({ hora_retorno_real: new Date() }), false);
});

test('avisarTodos grava a fila e dispara o envio na hora, sem lançar erro', async () => {
    acoes.length = 0; enviados.length = 0;
    pedido = { status: 'EM_SAIDA', nome_aluno: 'Ana', hora_saida_real: new Date() };
    pendentes = fila('SAIDA');
    await alertas.avisarTodos(5, 'SAIDA');
    assert.deepEqual(acoes[0], ['enfileirar', 5, 'SAIDA']);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(enviados.length, 4);
});

test('controller usa a fila para saída e retorno; banco aceita os novos tipos', () => {
    const ctl = ler('controller/pedidosController.js');
    assert.match(ctl, /avisarTodos\(pedido_id, 'SAIDA'\)/);
    assert.match(ctl, /retornouAtrasado\(dados\) \? 'CHEGOU_ATRASADO' : 'RETORNO'/);
    for (const arq of ['utils/migrar.js', 'database/migration_alertas_email_up.sql',
        'database/migration_professores_up.sql', 'database/migration_alertas_email_saida_retorno_up.sql']) {
        assert.match(ler(arq), /ENUM\('SAIDA','RETORNO','ATRASADO','NAO_RETORNOU','CHEGOU_ATRASADO'\)/, arq);
    }
});
