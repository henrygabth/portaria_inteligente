// Testes sem MySQL/serviços externos: validam escopo das consultas e transições.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const raiz = path.join(__dirname, '..');
function simularModulo(arquivo, exports) {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename: id, loaded: true, exports };
}
let consultas = [];
const banco = {
    async query(sql, params) {
        consultas.push({ sql, params });
        if (sql.includes('COUNT(*) AS total')) return [[{ total: 2 }]];
        return [[]];
    }
};
simularModulo('config/banco.js', banco);
const prof = require(path.join(raiz, 'model/professoresModel.js'));

test('comunicados sempre vinculados ao professor da sessão e à turma dele', async () => {
    consultas = [];
    const r = await prof.comunicados(41, { turma_id: '2', tipo: 'SAIDA', data: '2026-10-22', pagina: '1' });
    assert.deepEqual(r, { itens: [], temMais: false, pagina: 1 });
    const q = consultas.at(-1);
    assert.match(q.sql, /c\.professor_id = \?/);
    assert.match(q.sql, /pt\.turma_id = c\.turma_id AND pt\.professor_id = c\.professor_id/);
    assert.deepEqual(q.params, [41, 2, 'SAIDA', '2026-10-22', 51, 0]);
});

test('impede filtros arbitrários e dados fora do escopo', async () => {
    consultas = [];
    await assert.rejects(() => prof.comunicados(4, { tipo: "SAIDA' OR 1=1" }), /Filtro inválido/);
    await assert.rejects(() => prof.comunicados(4, { turma_id: '-1' }), /Filtro inválido/);
    await assert.rejects(() => prof.comunicados(4, { pagina: '5 OR 1=1' }), /Página inválida/);
    assert.equal(consultas.length, 0);
});

test('o evento do professor usa a turma do pedido e escrita parametrizada', async () => {
    consultas = [];
    await prof.registrarEvento(banco, 91, 'SAIDA');
    const q = consultas.at(-1);
    assert.match(q.sql, /INSERT IGNORE INTO comunicados_professores/);
    assert.match(q.sql, /pt\.turma_id = p\.turma_id/);
    assert.deepEqual(q.params[0], 'SAIDA');
    assert.equal(q.params[2], 91);
    await assert.rejects(() => prof.registrarEvento(banco, 91, 'APAGAR'), /Tipo de comunicado inválido/);
});

test('migration obriga não duplicação e rollback não apaga dados existentes', () => {
    const up = fs.readFileSync(path.join(raiz, 'database/migration_professores_up.sql'), 'utf8');
    const down = fs.readFileSync(path.join(raiz, 'database/migration_professores_down.sql'), 'utf8');
    assert.match(up, /UNIQUE KEY uq_comunicado \(professor_id, pedido_id, tipo\)/);
    assert.match(up, /PRIMARY KEY \(professor_id, turma_id\)/);
    assert.match(down, /SIGNAL SQLSTATE '45000'/);
});
