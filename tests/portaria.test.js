const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const raiz = path.join(__dirname,'..');
function simularModulo(arquivo,exports) {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename:id, loaded:true, exports };
}
let chamadas = [];
const pedidos = {
  buscarPorStatus: async status => { chamadas.push(status); return [{ status }]; },
  obterStatus: async () => 'PENDENTE',
  buscarHistorico: async () => ['histórico']
};
simularModulo('model/pedidosModel.js', pedidos);
simularModulo('model/alunosModel.js', {});
simularModulo('model/responsaveisAlunosModel.js', {});
simularModulo('utils/email.js', { enviarEmail: async () => {} });
simularModulo('utils/emailTemplate.js', { montarEmailHtml: () => '' });
simularModulo('utils/emailsPais.js', { notificarResponsaveis: async () => ({}) });
const ctl = require(path.join(raiz, 'controller/pedidosController.js'));
function resposta() {
    return { code:200, dados:null, status(c){this.code=c;return this;}, json(d){this.dados=d;return this;} };
}

test('portaria: backend rejeita PENDENTE, RECUSADA, CANCELADA e status vazio', async () => {
    for (const status of ['PENDENTE','RECUSADA','CANCELADA',undefined]) {
        const res = resposta();
        const antes = chamadas.length;
        await ctl.listarPorStatus({ usuario: {tipo_usuario:'PORTARIA'}, query:{status} }, res);
        assert.equal(res.code,403);
        assert.equal(chamadas.length,antes);
    }
});
test('portaria: lista somente APROVADA, EM_SAIDA e CONCLUIDA', async () => {
    for (const status of ['APROVADA','EM_SAIDA','CONCLUIDA']) {
        const res = resposta();
        await ctl.listarPorStatus({ usuario: { tipo_usuario:'PORTEIRO'}, query:{status} }, res);
        assert.equal(res.code,200);
        assert.deepEqual(res.dados,[{status}]);
    }
});
test('portaria: bloqueia consulta direta ao histórico pendente e por solicitante', async () => {
    const historico = resposta();
    await ctl.buscarHistorico({usuario:{tipo_usuario:'PORTARIA'},params:{id:'10'}},historico);
    assert.equal(historico.code,404);
    const solicitante = resposta();
    await ctl.buscarPorSolicitante({usuario:{tipo_usuario:'PORTARIA',id_usuario:8},params:{id:'8'}},solicitante);
    assert.equal(solicitante.code,403);
});
