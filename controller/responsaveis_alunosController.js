// responsaveis_alunosController.js
const responsaveisAlunos = require('../model/responsaveisAlunosModel');

const responsaveisAlunosController = {
    // PAI: lista os alunos vinculados à própria conta, para preencher
    // automaticamente o formulário de solicitação de saída.
    listarMeusAlunos: async (req, res) => {
        try {
            const usuario_id = req.usuario.id_usuario;
            const alunos = await responsaveisAlunos.listarAlunosPorResponsavel(usuario_id);
            res.json(alunos);
        } catch (error) {
            console.error('Erro ao listar alunos do responsável:', error);
            res.status(500).json({ erro: 'Erro ao buscar alunos vinculados' });
        }
    }
};

module.exports = responsaveisAlunosController;
