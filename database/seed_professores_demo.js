// Cria dados FICTÍCIOS. Só execute em uma cópia isolada do banco.
// Uso: ALLOW_DEMO_SEED=1 node database/seed_professores_demo.js
require('dotenv').config({ override: true });
if (process.env.ALLOW_DEMO_SEED !== '1') {
    console.error('Seed bloqueado. Use somente em banco de teste: ALLOW_DEMO_SEED=1.');
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
        await conn.commit();
        console.log('Seed de DEMONSTRAÇÃO criado. Usuário:', email);
        console.log('Senha inicial apenas para teste: Troque-esta-senha-123!');
        console.log('Turmas:', turmas.join(', '));
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
