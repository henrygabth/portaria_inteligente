const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
function mock(file, value) {
    const id = require.resolve(path.join(raiz, file));
    require.cache[id] = { id, filename: id, loaded: true, exports: value };
}
let enviados = [];
const acoes = [];
let status = 'EM_SAIDA';
mock('utils/email.js', {
    enviarEmail: async ({ to }) => {
        enviados.push(to);
        if (to === 'falha@example.test') throw Error('Serviço de e-mail indisponível');
    }
});
mock('utils/emailTemplate.js', { montarEmailHtml: () => '<p>Alerta</p>' });
mock('model/pedidosModel.js', {
    buscarParaNotificacao: async () => ({
        status, nome_aluno: 'Aluno Teste', turma: '1º A', turma_id: 2,
        hora_prevista_retorno: new Date('2026-10-22T12:00:00-03:00')
    })
});
mock('model/ocorrenciasModel.js', { registrar: async (...args) => { acoes.push(['ocorrencia', ...args]); } });
mock('model/alertasEmailModel.js', {
    listarEventosRecentes: async () => [{ pedido_id: 15, tipo: 'ATRASADO' }],
    enfileirar: async (...args) => { acoes.push(['enfileirar', ...args]); },
    listarEnviosPendentes: async () => [
        { envio_id: 1, pedido_id: 15, tipo_evento: 'ATRASADO', email_destino: 'pai@example.test', categoria: 'RESPONSAVEL' },
        { envio_id: 2, pedido_id: 15, tipo_evento: 'ATRASADO', email_destino: 'falha@example.test', categoria: 'SECRETARIA' },
        { envio_id: 3, pedido_id: 15, tipo_evento: 'ATRASADO', email_destino: 'prof@example.test', categoria: 'PROFESSOR' }
    ],
    reservarEnvio: async () => true,
    destinatarioAindaAutorizado: async () => true,
    concluirEnvio: async id => { acoes.push(['concluir', id]); },
    falharEnvio: async id => { acoes.push(['falhou', id]); },
    descartarEnvio: async id => { acoes.push(['descartado', id]); }
});
const alertas = require(path.join(raiz, 'utils/alertasEmail.js'));

test('falha do Brevo não bloqueia os demais destinatários e e-mails são individuais', async () => {
    status = 'EM_SAIDA'; enviados = []; acoes.length = 0;
    await alertas.processarAlertas();
    assert.deepEqual(enviados, ['pai@example.test', 'falha@example.test', 'prof@example.test']);
    assert(acoes.some(x => x[0] === 'falhou' && x[1] === 2));
    assert(acoes.some(x => x[0] === 'concluir' && x[1] === 3));
});

test('alerta pendente de atraso é descartado após aluno retornar', async () => {
    status = 'CONCLUIDA'; enviados = []; acoes.length = 0;
    await alertas.processarAlertas();
    assert.equal(enviados.length, 0);
    assert.equal(acoes.filter(x => x[0] === 'descartado').length, 3);
});
