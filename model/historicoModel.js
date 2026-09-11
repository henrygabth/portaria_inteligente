//historico model
const banco = require('../config/banco');

const historico = {
    registrar: async (pedido_id, usuario_id, status_anterior, status_novo, observacao = null) => {
        const sql = `
            INSERT INTO historico_pedidos 
            (pedido_id, usuario_id, status_anterior, status_novo, observacao) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await banco.query(sql, [
            pedido_id, usuario_id, status_anterior, status_novo, observacao
        ]);
        return resultado.insertId;
    },

    listarPorPedido: async (pedido_id) => {
        const sql = "SELECT * FROM historico_pedidos WHERE pedido_id = ? ORDER BY data_mudanca DESC";
        const [rows] = await banco.query(sql, [pedido_id]);
        return rows;
    }
};

module.exports = historico;
