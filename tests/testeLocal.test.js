const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const raiz = path.join(__dirname, '..');
const { verificarEstrutura } = require('../utils/verificarEstrutura');

const nomes = [
    'usuarios', 'turmas', 'alunos', 'pedidos_saida', 'historico_pedidos',
    'responsaveis_alunos', 'pedidos_recorrentes', 'professores_turmas',
    'comunicados_professores', 'alertas_email_envios'
];
function bancoFalso(tabelas = nomes, perfilProfessor = true, aviso = true) {
    return {
        query: async sql => {
            if (sql.includes('information_schema.TABLES')) {
                return [tabelas.map(nome => ({ nome }))];
            }
            if (sql.includes('information_schema.COLUMNS')) {
                const colunas = [{ TABLE_NAME: 'usuarios', COLUMN_NAME: 'tipo_usuario',
                    COLUMN_TYPE: perfilProfessor ? "enum('PAI','ADMIN','PROFESSOR')" : "enum('PAI','ADMIN')" }];
                if (aviso) colunas.push({ TABLE_NAME: 'pedidos_saida', COLUMN_NAME: 'aviso_pais_atraso_enviado' });
                return [colunas];
            }
            throw new Error('Consulta inesperada no teste: ' + sql);
        }
    };
}

test('pré-verificação de esquema aceita banco com as tabelas e perfil professor', async () => {
    await verificarEstrutura(bancoFalso());
});

test('pré-verificação aponta tabelas ausentes, sem executá-las', async () => {
    await assert.rejects(verificarEstrutura(bancoFalso(nomes.filter(t => t !== 'comunicados_professores'))), /comunicados_professores/);
});

test('pré-verificação detecta migration de PROFESSOR ou aviso faltando', async () => {
    await assert.rejects(verificarEstrutura(bancoFalso(nomes, false)), /perfil PROFESSOR/);
    await assert.rejects(verificarEstrutura(bancoFalso(nomes, true, false)), /aviso_pais_atraso_enviado/);
});

test('instalador local seleciona portaria_teste e não cria banco original', () => {
    const sql = fs.readFileSync(path.join(raiz, 'database/instalar_banco_local.sql'), 'utf8');
    assert.match(sql, /USE portaria_teste;/);
    assert.doesNotMatch(sql, /USE projetocodemasters;/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS alertas_email_envios/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS comunicados_professores/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS responsaveis_alunos/);
});

test('modo local exige opt-in para habilitar agendador e e-mails reais', () => {
    const index = fs.readFileSync(path.join(raiz, 'index.js'), 'utf8');
    const email = fs.readFileSync(path.join(raiz, 'utils/email.js'), 'utf8');
    assert.match(index, /process\.env\.AGENDADOR_ATIVO/);
    assert.match(index, /PERMITIR_BANCO_REMOTO_TESTE/);
    assert.match(email, /process\.env\.MODO_TESTE_LOCAL === '1'/);
    assert.match(email, /EMAILS_REAIS_NO_TESTE/);
});
