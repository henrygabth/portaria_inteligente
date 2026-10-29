const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');

function ler(p) { return fs.readFileSync(path.join(raiz, p), 'utf8'); }

test('portaria é operacional: registra saída, sem aprovar ou recusar', () => {
    const rotas = ler('api/pedidosRotas.js');
    const tela = ler('public/js/general/portaria.js');
    assert.match(rotas, /aprovar\/:id'.*SECRETARIA.*ADMIN/s);
    assert.match(rotas, /rejeitar\/:id'.*SECRETARIA.*ADMIN/s);
    assert.match(rotas, /liberar\/:id'.*PORTEIRO.*PORTARIA.*ADMIN/s);
    assert.match(tela, /Registrar Saída/);
    assert.doesNotMatch(tela, /> Liberar</);
});

test('professor recebe comunicados de saída e retorno por turma', () => {
    const pedidos = ler('model/pedidosModel.js');
    const professor = ler('model/professoresModel.js');
    assert.match(pedidos, /EM_SAIDA: 'SAIDA'/);
    assert.match(pedidos, /CONCLUIDA: 'RETORNO'/);
    assert.match(professor, /pt\.turma_id = p\.turma_id/);
    assert.match(professor, /UNIQUE|INSERT IGNORE/);
});

test('atraso e não retorno avisam os quatro grupos e geram rastreabilidade', () => {
    const alertas = ler('model/alertasEmailModel.js');
    const ocorrencias = ler('database/migration_ocorrencias_responsabilidade_up.sql');
    assert.match(alertas, /RESPONSAVEL/);
    assert.match(alertas, /SECRETARIA/);
    assert.match(alertas, /PORTARIA/);
    assert.match(alertas, /PROFESSOR/);
    assert.match(ocorrencias, /uq_ocorrencia_pedido_tipo/);
    assert.match(ocorrencias, /NAO_RETORNOU/);
});

test('documento de validação com a Ivone não fixa responsabilidade institucional no software', () => {
    const doc = ler('VALIDACAO_FLUXO_IVONE.md');
    assert.match(doc, /Ivone/);
    assert.match(doc, /A secretaria analisa e \*\*aprova ou recusa\*\*/);
    assert.match(doc, /responsabilidade institucional/);
});
