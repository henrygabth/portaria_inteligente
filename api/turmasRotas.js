const express = require('express');
const rotas = express.Router();

// Importar o controller
const turmasController = require('../controller/turmasController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Todas as rotas exigem usuário autenticado.
// Cadastro de turma fica restrito à Secretaria/Admin; leitura, a qualquer usuário logado
// (o front-end usa /turmas para popular selects em várias telas).
rotas.get('/', auth, turmasController.listarTodas);
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.cadastrar);
rotas.get('/buscarPorTurma', auth, turmasController.buscarPorTurma);
rotas.get('/buscarPorTurno', auth, turmasController.buscarPorTurno);

module.exports = rotas;
