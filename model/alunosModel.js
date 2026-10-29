//Banco de Dados
//alunos model
const banco = require('../config/banco');

const alunos = {
    cadastrar: async (nome, matricula, turma_id, data_nascimento, status, data_criacao) => {
        const sql = `
            INSERT INTO alunos (nome, matricula, turma_id, data_nascimento, status, data_criacao) 
            VALUES (?,?,?,?,?,?)
        `;
        const [resultado] = await banco.query(sql, [
            nome, matricula, turma_id, data_nascimento, status, data_criacao
        ]);
        return resultado.insertId;
    },

    buscarTodos: async () => {
        const sql = "SELECT * FROM alunos ORDER BY nome";
        const [resultado] = await banco.query(sql);
        return resultado;
    },

    atualizar: async (nome, matricula, turma_id, data_nascimento, status, data_criacao, aluno_id) => {
        const sql = `
            UPDATE alunos 
            SET nome = ?, matricula = ?, turma_id = ?, data_nascimento = ?, status = ?, data_criacao = ? 
            WHERE aluno_id = ?
        `;
        const [resultado] = await banco.query(sql, [
            nome, matricula, turma_id, data_nascimento, status, data_criacao, aluno_id
        ]);
        return resultado.affectedRows > 0;
    },

    apagar: async (id) => {
        const sql = "DELETE FROM alunos WHERE aluno_id = ?";
        const [resultado] = await banco.query(sql, [id]);
        return resultado.affectedRows > 0;
    },

    buscarPorNome: async (nome) => {
        const sql = "SELECT * FROM alunos WHERE nome = ?";
        const [resultado] = await banco.query(sql, [nome]);
        return resultado;
    },

    buscarPorId: async (id) => {
        const sql = "SELECT * FROM alunos WHERE aluno_id = ?";
        const [resultado] = await banco.query(sql, [id]);
        return resultado;
    },

    buscarPorMatricula: async (matricula) => {
        const sql = "SELECT * FROM alunos WHERE matricula = ?";
        const [resultado] = await banco.query(sql, [matricula]);
        return resultado;
    },

    buscarPorTurma: async (turma_id) => {
        const sql = "SELECT * FROM alunos WHERE turma_id = ? ORDER BY nome";
        const [resultado] = await banco.query(sql, [turma_id]);
        return resultado;
    },

    buscarPorStatus: async (status) => {
        const sql = "SELECT * FROM alunos WHERE status = ? ORDER BY nome";
        const [resultado] = await banco.query(sql, [status]);
        return resultado;
    },

    // Usado pela tela "Gerenciar Alunos" da secretaria: troca de turma na
    // virada de ano letivo e/ou desativação do aluno, sem exigir reenviar
    // todos os outros campos do cadastro.
    atualizarTurmaEStatus: async (aluno_id, turma_id, status) => {
        const sql = `
            UPDATE alunos
            SET turma_id = COALESCE(?, turma_id), status = COALESCE(?, status)
            WHERE aluno_id = ?
        `;
        const [resultado] = await banco.query(sql, [turma_id ?? null, status ?? null, aluno_id]);
        return resultado.affectedRows > 0;
    },

    // Busca um aluno pelo nome + turma; se não existir, cria. Usado ao vincular um responsável.
    buscarOuCriar: async (nome, turma_id) => {
        const [existente] = await banco.query(
            "SELECT * FROM alunos WHERE nome = ? AND turma_id <=> ? LIMIT 1",
            [nome, turma_id]
        );
        if (existente.length > 0) return existente[0].aluno_id;

        const [resultado] = await banco.query(
            "INSERT INTO alunos (nome, matricula, turma_id, data_nascimento, status, data_criacao) VALUES (?, ?, ?, NULL, 'ATIVO', NOW())",
            [nome, `AUTO-${Date.now()}`, turma_id]
        );
        return resultado.insertId;
    }
};

module.exports = alunos;
