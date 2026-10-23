// Cria dados FICTÍCIOS. Só execute em uma cópia isolada do banco.
// Uso: ALLOW_DEMO_SEED=1 node database/seed_professores_demo.js
require('dotenv').config({ override: true });
if (process.env.ALLOW_DEMO_SEED !== '1') {
    console.error('Seed bloqueado. Use somente em banco de teste: ALLOW_DEMO_SEED=1.');
    process.exit(1);
}
if (process.env.MODO_TESTE_LOCAL !== '1') {
    console.error('Seed permitido apenas em MODO_TESTE_LOCAL=1.');
    process.exit(1);
}
const host = String(process.env.DB_HOST || '').trim().toLowerCase();
if (!['localhost', '127.0.0.1', '::1'].includes(host) &&
    process.env.PERMITIR_BANCO_REMOTO_TESTE !== '1') {
    console.error('Seed bloqueado: banco remoto sem autorização explícita. Nunca use o banco de produção.');
    process.exit(1);
}
const db = require('../config/banco');
const bcrypt = require('bcrypt');

async function executar() {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const turmas = [];
        for (const nome of ['DEMO Almoço - Sala A', 'DEMO Almoço - Sala B']) {
            const [existentes] = await conn.query('SELECT id_turma FROM turmas WHERE sala_turma = ? LIMIT 1', [nome]);
            if (existentes.length) turmas.push(existentes[0].id_turma);
            else {
                const [r] = await conn.query('INSERT INTO turmas (sala_turma, turno) VALUES (?, ?)', [nome, 'Manhã']);
                turmas.push(r.insertId);
            }
        }
        const email = 'professor.demo@example.invalid'; // domínio inexistente de propósito
        let professor;
        const [encontrados] = await conn.query('SELECT id_usuario FROM usuarios WHERE email = ? AND tipo_usuario = ?', [email, 'PROFESSOR']);
        if (encontrados.length) professor = encontrados[0].id_usuario;
        else {
            const hash = await bcrypt.hash('Troque-esta-senha-123!', 10);
            const [r] = await conn.query(`INSERT INTO usuarios (nome, cpf, email, telefone, senha, tipo_usuario, status)
              VALUES (?, ?, ?, ?, ?, 'PROFESSOR', '1')`, ['Professor de Demonstração', '99900000001', email, null, hash]);
            professor = r.insertId;
        }
        for (const turma of turmas) {
            await conn.query('INSERT IGNORE INTO professores_turmas (professor_id, turma_id) VALUES (?, ?)', [professor, turma]);
        }
        const alunos = [
            ['Aluno Demo 1', 'DEMO-ALUNO-001', turmas[0]],
            ['Aluno Demo 2', 'DEMO-ALUNO-002', turmas[0]],
            ['Aluno Demo 3', 'DEMO-ALUNO-003', turmas[1]]
        ];
        for (const [nome, matricula, turma] of alunos) {
            const [existe] = await conn.query('SELECT aluno_id FROM alunos WHERE matricula = ? LIMIT 1', [matricula]);
            if (!existe.length) {
                await conn.query(`INSERT INTO alunos (nome, matricula, turma_id, status)
                    VALUES (?, ?, ?, 'ATIVO')`, [nome, matricula, turma]);
            }
        }
        // Contas fictícias para testar todo o fluxo sem depender de usuários reais.
        // Todos os e-mails usam .invalid para impedir entregas externas.
        const senhaPadrao = 'Troque-esta-senha-123!';
        const hashPadrao = await bcrypt.hash(senhaPadrao, 10);
        const contas = [
            ['Admin Demo', '99900000002', 'admin.demo@example.invalid', 'ADMIN'],
            ['Secretaria Demo', '99900000003', 'secretaria.demo@example.invalid', 'SECRETARIA'],
            ['Portaria Demo', '99900000004', 'portaria.demo@example.invalid', 'PORTARIA'],
            ['Responsável Demo', '99900000005', 'responsavel.demo@example.invalid', 'PAI']
        ];
        let responsavelId;
        for (const [nome, cpf, emailConta, papel] of contas) {
            const [existente] = await conn.query('SELECT id_usuario FROM usuarios WHERE email = ? LIMIT 1', [emailConta]);
            let idUsuario;
            if (existente.length) idUsuario = existente[0].id_usuario;
            else {
                const [resultado] = await conn.query(`INSERT INTO usuarios
                    (nome, cpf, email, telefone, senha, tipo_usuario, status)
                    VALUES (?, ?, ?, ?, ?, ?, '1')`,
                    [nome, cpf, emailConta, '11999990000', hashPadrao, papel]);
                idUsuario = resultado.insertId;
            }
            if (papel === 'PAI') responsavelId = idUsuario;
        }
        for (const matricula of ['DEMO-ALUNO-001', 'DEMO-ALUNO-002', 'DEMO-ALUNO-003']) {
            const [registros] = await conn.query('SELECT aluno_id FROM alunos WHERE matricula = ?', [matricula]);
            if (registros.length) {
                await conn.query(`INSERT IGNORE INTO responsaveis_alunos
                    (usuario_id, aluno_id, parentesco) VALUES (?, ?, 'Responsável')`,
                    [responsavelId, registros[0].aluno_id]);
            }
        }
        await conn.commit();
        console.log('Seed de DEMONSTRAÇÃO criado. Usuário:', email);
        console.log('Senha inicial apenas para teste: Troque-esta-senha-123!');
        console.log('Turmas:', turmas.join(', '));
        console.log('Contas de teste: admin.demo@example.invalid, secretaria.demo@example.invalid,');
        console.log('  portaria.demo@example.invalid, responsavel.demo@example.invalid, professor.demo@example.invalid');
        console.log('Senha compartilhada EXCLUSIVAMENTE PARA TESTES:', senhaPadrao);
    } catch (err) {
        await conn.rollback();
        console.error('Seed não aplicado:', err.message);
        process.exitCode = 1;
    } finally {
        conn.release();
        await db.end();
    }
}
executar().catch(e => { console.error(e.message); process.exitCode = 1; });
