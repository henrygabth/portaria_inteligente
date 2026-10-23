const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const mock = (arquivo, exports) => {
    const id = require.resolve(path.join(raiz, arquivo));
    require.cache[id] = { id, filename: id, loaded: true, exports };
};

const gravados = [];
const db = {
    query: async (sql, params) => {
        gravados.push({ sql, params });
        if (sql.includes('SELECT email, tipo_usuario FROM usuarios')) return [[
            { email: 'secretaria@escola.test', tipo_usuario: 'SECRETARIA' },
            { email: 'porteiro@escola.test', tipo_usuario: 'PORTARIA' },
            { email: 'pai@example.test', tipo_usuario: 'SECRETARIA' }
        ]];
        if (sql.includes('FROM professores_turmas pt')) return [[
            { email: 'professor1@escola.test' }, { email: 'professor2@escola.test' }
        ]];
        if (sql.includes('INSERT IGNORE INTO alertas_email_envios')) return [{ affectedRows: 1 }];
        return [[]];
    }
};
mock('config/banco.js', db);
mock('model/pedidosModel.js', {
    buscarParaNotificacao: async id => ({ pedidos_saida_id: id, turma_id: 3, aluno_id: 7, nome_aluno: 'Aluno Teste', solicitante_id: 10, hora_prevista_retorno: new Date('2026-10-22T12:00:00-03:00') }),
    buscarDestinatariosPais: async () => [
        { email: 'pai@example.test' }, { email: 'mae@example.test' }
    ]
});
const alertas = require(path.join(raiz, 'model/alertasEmailModel.js'));

test('notifica todos os quatro grupos e não duplica e-mails', async () => {
    const d = await alertas.buscarDestinatarios({ turma_id: 3 });
    assert.equal(d.length, 6);
    assert.deepEqual(new Set(d.map(x => x.categoria)), new Set(['RESPONSAVEL', 'SECRETARIA', 'PORTARIA', 'PROFESSOR']));
    assert.equal(d.filter(x => x.email === 'pai@example.test').length, 1);
    assert.equal(d.filter(x => x.categoria === 'PROFESSOR').length, 2);
    assert(gravados.some(x => x.sql.includes('pt.turma_id = ?') && x.params[0] === 3));
});

test('cada evento usa a chave única por pedido, tipo e destinatário', async () => {
    gravados.length = 0;
    const qtd = await alertas.enfileirar(88, 'NAO_RETORNOU');
    assert.equal(qtd, 6);
    const ins = gravados.filter(x => x.sql.includes('INSERT IGNORE INTO alertas_email_envios'));
    assert.equal(ins.length, 6);
    assert(ins.every(x => x.params[0] === 88 && x.params[1] === 'NAO_RETORNOU'));
    await assert.rejects(alertas.enfileirar(88, 'DESCONHECIDO'), /inválido/);
});

test('consulta distingue atraso +5, não retornou +15 e chegou atrasado', async () => {
    gravados.length = 0;
    await alertas.listarEventosRecentes();
    const sql = gravados.at(-1).sql;
    assert.match(sql, /INTERVAL 5 MINUTE/);
    assert.match(sql, /INTERVAL 15 MINUTE/);
    assert.match(sql, /CHEGOU_ATRASADO/);
    assert.match(sql, /status = 'CONCLUIDA'/);
});

test('migration possui idempotência e pode ser revertida sem apagar envios', () => {
    const sql = fs.readFileSync(path.join(raiz, 'database/migration_alertas_email_up.sql'), 'utf8');
    const down = fs.readFileSync(path.join(raiz, 'database/migration_alertas_email_down.sql'), 'utf8');
    assert.match(sql, /UNIQUE KEY uq_alerta_destino \(pedido_id, tipo_evento, email_destino\)/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS alertas_email_envios/);
    assert.match(down, /SIGNAL SQLSTATE '45000'/);
});

test('somente ADMIN gerencia professores, inclusive cadastro genérico e ativação', () => {
    const rotas = fs.readFileSync(path.join(raiz, 'api/professoresRotas.js'),'utf8');
    const usuarios = fs.readFileSync(path.join(raiz, 'controller/usuariosController.js'),'utf8');
    assert.match(rotas, /rotas\.post\('\/', auth, exigirPapel\('ADMIN'\)/);
    assert.match(rotas, /rotas\.put\('\/:id\/turmas', auth, exigirPapel\('ADMIN'\)/);
    assert.match(rotas, /rotas\.get\('\/', auth, exigirPapel\('ADMIN'\)/);
    assert.match(usuarios, /:\s*\['PAI', 'PORTARIA'\]/);
    assert.match(usuarios, /const secretariaPodeGerir = \['PAI', 'PORTARIA', 'PORTEIRO'\]/);
});
