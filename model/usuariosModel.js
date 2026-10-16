const db = require('../config/banco');

const usuariosModel = {
    buscarPorEmail: async (email) => {
        const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        return rows[0] || null;
    },

    buscarPorNome: async (nome) => {
        // Nunca devolve a coluna `senha` (nem cpf) — este endpoint é usado só
        // pra localizar um usuário por nome, não é um "perfil completo".
        const [rows] = await db.query(
            'SELECT id_usuario, nome, email, telefone, tipo_usuario, status FROM usuarios WHERE nome LIKE ?',
            [`%${nome}%`]
        );
        return rows[0] || null;
    },

    buscarPorId: async (id) => {
        const [rows] = await db.query(
            'SELECT id_usuario, nome, email, telefone, tipo_usuario, status FROM usuarios WHERE id_usuario = ?',
            [id]
        );
        return rows[0] || null;
    },

    buscarContaPorId: async (id) => {
        const [rows] = await db.query(
            'SELECT id_usuario, nome, cpf, email, telefone, tipo_usuario FROM usuarios WHERE id_usuario = ?',
            [id]
        );
        return rows[0] || null;
    },

    // Usado para conferir a senha atual antes de permitir a troca (atualizarConta)
    buscarSenhaHashPorId: async (id) => {
        const [rows] = await db.query(
            'SELECT senha FROM usuarios WHERE id_usuario = ?',
            [id]
        );
        return rows[0] ? rows[0].senha : null;
    },

    cadastrar: async (nome, cpf, email, telefone, senhaHash, tipo_usuario, status) => {
        const [result] = await db.query(
            'INSERT INTO usuarios (nome, cpf, email, telefone, senha, tipo_usuario, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nome, cpf, email, telefone, senhaHash, tipo_usuario, status]
        );
        return result.insertId;
    },

    // Usada para migrar silenciosamente uma senha antiga em texto puro para bcrypt
    // assim que o usuário faz login com sucesso (ver usuariosController.login).
    atualizarSenha: async (id, senhaHash) => {
        await db.query('UPDATE usuarios SET senha = ? WHERE id_usuario = ?', [senhaHash, id]);
    },

    atualizarConta: async (id, nome, email, telefone, novaSenhaHash) => {
        if (novaSenhaHash) {
            await db.query(
                'UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), telefone = COALESCE(?, telefone), senha = ?, primeiro_acesso = 0 WHERE id_usuario = ?',
                [nome, email, telefone, novaSenhaHash, id]
            );
        } else {
            await db.query(
                'UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), telefone = COALESCE(?, telefone) WHERE id_usuario = ?',
                [nome, email, telefone, id]
            );
        }
    },

    // Perfil ativo = status diferente de '0'/'INATIVO' (usuários antigos podem ter NULL).
    estaAtivo: (usuario) => {
        const st = String(usuario?.status ?? '1').trim().toUpperCase();
        return st !== '0' && st !== 'INATIVO' && st !== 'DESATIVADO';
    },

    // Lista perfis para a tela "Gerenciar Perfis" (nunca devolve senha).
    listarPerfis: async (tipos) => {
        const placeholders = tipos.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT u.id_usuario, u.nome, u.email, u.telefone, u.tipo_usuario, u.status,
                    (SELECT GROUP_CONCAT(a.nome SEPARATOR ', ')
                       FROM responsaveis_alunos ra JOIN alunos a ON a.aluno_id = ra.aluno_id
                      WHERE ra.usuario_id = u.id_usuario) AS alunos
               FROM usuarios u
              WHERE u.tipo_usuario IN (${placeholders})
              ORDER BY u.nome`,
            tipos
        );
        return rows;
    },

    atualizarStatus: async (id, status) => {
        await db.query('UPDATE usuarios SET status = ? WHERE id_usuario = ?', [status, id]);
    },

    // Marca que o usuário já fez o primeiro login (o aviso de troca de senha só aparece uma vez).
    marcarPrimeiroAcessoConcluido: async (id) => {
        await db.query('UPDATE usuarios SET primeiro_acesso = 0 WHERE id_usuario = ?', [id]);
    },

    buscarStatusPorId: async (id) => {
        const [rows] = await db.query('SELECT status FROM usuarios WHERE id_usuario = ?', [id]);
        return rows[0] || null;
    },

    // Usado pelo alerta de atraso: lista os e-mails de quem deve ser avisado
    // (Secretaria e Portaria) quando um aluno não retorna no horário previsto.
    listarEmailsPorPapel: async (...papeis) => {
        const placeholders = papeis.map(() => '?').join(',');
        const sql = `SELECT nome, email FROM usuarios WHERE tipo_usuario IN (${placeholders}) AND email IS NOT NULL AND email != ''`;
        const [rows] = await db.query(sql, papeis);
        return rows;
    }
};

module.exports = usuariosModel;