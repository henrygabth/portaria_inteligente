// responsaveisAlunosModel.js
const banco = require('../config/banco');

const responsaveisAlunos = {
    vincular: async (usuario_id, aluno_id, parentesco = null) => {
        const sql = `
            INSERT INTO responsaveis_alunos (usuario_id, aluno_id, parentesco)
            VALUES (?, ?, ?)
        `;
        const [resultado] = await banco.query(sql, [usuario_id, aluno_id, parentesco]);
        return resultado.insertId;
    },

    listarAlunosPorResponsavel: async (usuario_id) => {
        const sql = `
            SELECT a.aluno_id, a.nome, a.matricula, a.turma_id, t.sala_turma AS turma, r.parentesco
            FROM responsaveis_alunos r
            JOIN alunos a ON r.aluno_id = a.aluno_id
            LEFT JOIN turmas t ON a.turma_id = t.id_turma
            WHERE r.usuario_id = ?
        `;
        const [rows] = await banco.query(sql, [usuario_id]);
        return rows;
    },

    // Confere se o aluno realmente pertence a este responsável antes de deixar
    // criar um pedido de saída em nome dele.
    pertence: async (usuario_id, aluno_id) => {
        const sql = `
            SELECT 1 FROM responsaveis_alunos WHERE usuario_id = ? AND aluno_id = ? LIMIT 1
        `;
        const [rows] = await banco.query(sql, [usuario_id, aluno_id]);
        return rows.length > 0;
    }
};

module.exports = responsaveisAlunos;
