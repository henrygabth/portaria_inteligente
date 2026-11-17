// turmas (salas): cadastro feito pela secretaria na tela "Salas e Turmas".
const banco = require('../config/banco');

const turmas = {
    cadastrar: async (sala_turma, turno) => {
        const [resultado] = await banco.query('INSERT INTO turmas (sala_turma, turno) VALUES (?, ?)', [sala_turma, turno]);
        return resultado.insertId;
    },
    buscarPorId: async (id) => {
        const [rows] = await banco.query('SELECT id_turma, sala_turma, turno FROM turmas WHERE id_turma = ? LIMIT 1', [id]);
        return rows[0] || null;
    },
    buscarPorTurma: async (sala_turma) => {
        const [rows] = await banco.query('SELECT * FROM turmas WHERE sala_turma = ? LIMIT 1', [sala_turma]);
        return rows[0];
    },
    // Mesmo nome ignorando maiúsculas e espaços (evita "1º A" e "1º a" duplicadas).
    buscarMesmoNome: async (sala_turma, ignorarId = 0) => {
        const [rows] = await banco.query(
            'SELECT id_turma, sala_turma FROM turmas WHERE LOWER(TRIM(sala_turma)) = LOWER(TRIM(?)) AND id_turma <> ? LIMIT 1',
            [sala_turma, ignorarId]);
        return rows[0] || null;
    },
    buscarPorTurno: async (turno) => {
        const [rows] = await banco.query('SELECT * FROM turmas WHERE turno = ? ORDER BY sala_turma ASC', [turno]);
        return rows;
    },
    listarTodas: async () => {
        const [rows] = await banco.query('SELECT id_turma, sala_turma, turno FROM turmas ORDER BY sala_turma ASC');
        return rows;
    },
    // Lista com quantos alunos (ativos e no total) e professores cada turma tem.
    listarComResumo: async () => {
        const [rows] = await banco.query(`
            SELECT t.id_turma, t.sala_turma, t.turno,
                   (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id_turma AND (a.status IS NULL OR a.status = 'ATIVO')) AS alunos_ativos,
                   (SELECT COUNT(*) FROM alunos a WHERE a.turma_id = t.id_turma) AS alunos_total,
                   (SELECT COUNT(*) FROM professores_turmas pt WHERE pt.turma_id = t.id_turma) AS professores
            FROM turmas t ORDER BY t.sala_turma ASC`);
        return rows.map(r => ({ ...r, alunos_ativos: Number(r.alunos_ativos), alunos_total: Number(r.alunos_total), professores: Number(r.professores) }));
    },
    atualizar: async (id, sala_turma, turno) => {
        const [r] = await banco.query('UPDATE turmas SET sala_turma = ?, turno = ? WHERE id_turma = ?', [sala_turma, turno, id]);
        return r.affectedRows > 0;
    },
    // Só apaga turma vazia: sem alunos e sem professores vinculados.
    contarVinculos: async (id) => {
        const [[r]] = await banco.query(`SELECT
            (SELECT COUNT(*) FROM alunos WHERE turma_id = ?) AS alunos,
            (SELECT COUNT(*) FROM professores_turmas WHERE turma_id = ?) AS professores`, [id, id]);
        return { alunos: Number(r.alunos), professores: Number(r.professores) };
    },
    apagar: async (id) => {
        const [r] = await banco.query('DELETE FROM turmas WHERE id_turma = ?', [id]);
        return r.affectedRows > 0;
    }
};

module.exports = turmas;
