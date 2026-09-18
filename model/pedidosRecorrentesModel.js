// pedidosRecorrentesModel.js
const db = require('../config/banco');

const pedidosRecorrentesModel = {
    cadastrar: async (aluno_id, usuario_id, dia_semana, hora_saida, hora_retorno, motivo) => {
        const [result] = await db.query(
            `INSERT INTO pedidos_recorrentes (aluno_id, usuario_id, dia_semana, hora_saida, hora_retorno, motivo, ativo)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [aluno_id, usuario_id, dia_semana, hora_saida, hora_retorno || null, motivo || null]
        );
        return result.insertId;
    },

    // Lista os moldes de um responsável, já com nome/turma do aluno pra exibir na tela.
    listarPorUsuario: async (usuario_id) => {
        const sql = `
            SELECT r.recorrente_id, r.aluno_id, r.dia_semana, r.hora_saida, r.hora_retorno,
                   r.motivo, r.ativo, a.nome AS nome_aluno, t.sala_turma AS turma
            FROM pedidos_recorrentes r
            JOIN alunos a ON r.aluno_id = a.aluno_id
            LEFT JOIN turmas t ON a.turma_id = t.id_turma
            WHERE r.usuario_id = ?
            ORDER BY r.dia_semana ASC, r.hora_saida ASC
        `;
        const [rows] = await db.query(sql, [usuario_id]);
        return rows;
    },

    // Todos os moldes ativos de um dia da semana específico (usado pelo gerador diário)
    listarAtivosPorDia: async (dia_semana) => {
        const sql = `
            SELECT r.recorrente_id, r.aluno_id, r.usuario_id, r.hora_saida, r.hora_retorno, r.motivo,
                   a.nome AS nome_aluno, a.turma_id
            FROM pedidos_recorrentes r
            JOIN alunos a ON r.aluno_id = a.aluno_id
            WHERE r.ativo = 1 AND r.dia_semana = ? AND (a.status IS NULL OR UPPER(a.status) = 'ATIVO')
        `;
        const [rows] = await db.query(sql, [dia_semana]);
        return rows;
    },

    alternarStatus: async (recorrente_id, usuario_id, ativo) => {
        const [result] = await db.query(
            'UPDATE pedidos_recorrentes SET ativo = ? WHERE recorrente_id = ? AND usuario_id = ?',
            [ativo ? 1 : 0, recorrente_id, usuario_id]
        );
        return result.affectedRows > 0;
    },

    remover: async (recorrente_id, usuario_id) => {
        const [result] = await db.query(
            'DELETE FROM pedidos_recorrentes WHERE recorrente_id = ? AND usuario_id = ?',
            [recorrente_id, usuario_id]
        );
        return result.affectedRows > 0;
    },

    // Evita gerar duas vezes o pedido do mesmo molde no mesmo dia (ex: se o
    // servidor reiniciar várias vezes durante o dia).
    existePedidoHoje: async (recorrente_id, dataStr) => {
        const [rows] = await db.query(
            `SELECT 1 FROM pedidos_saida WHERE recorrente_id = ? AND DATE(data_criacao) = ? LIMIT 1`,
            [recorrente_id, dataStr]
        );
        return rows.length > 0;
    }
};

module.exports = pedidosRecorrentesModel;
