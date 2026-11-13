const express = require('express');
const rotas = express.Router();
const responsaveisAlunosController = require('../controller/responsaveis_alunosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Retorna os alunos vinculados ao responsável (Pai) autenticado.
// Usado para preencher automaticamente o select de aluno na tela de solicitação.
rotas.get('/meus-alunos', auth, exigirPapel('PAI'), responsaveisAlunosController.listarMeusAlunos);

module.exports = rotas;
