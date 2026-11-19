// Pedidos de demonstração/orçamento enviados pela página pública "conheca.html".
const banco = require('../config/banco');

module.exports = {
    cadastrar: async c => {
        const [r] = await banco.query(
            `INSERT INTO contatos_comerciais (nome, escola, cargo, email, telefone, alunos, mensagem)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [c.nome, c.escola, c.cargo, c.email, c.telefone, c.alunos, c.mensagem]
        );
        return r.insertId;
    },
    // Quem recebe o aviso de novo contato: os administradores ativos.
    emailsAdmins: async () => {
        const [linhas] = await banco.query(
            "SELECT email FROM usuarios WHERE tipo_usuario = 'ADMIN' AND (status IS NULL OR UPPER(TRIM(status)) NOT IN ('0', 'INATIVO', 'DESATIVADO')) AND email IS NOT NULL");
        return linhas.map(l => l.email);
    }
};
