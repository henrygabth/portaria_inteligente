const express = require('express');
const rotas = express.Router();

// Importar o controller
const turmasController = require('../controller/turmasController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Todas as rotas exigem usuário autenticado.
// Cadastro de turma fica restrito à Secretaria/Admin; leitura, a qualquer usuário logado
// (o front-end usa /turmas para popular selects em várias telas).
rotas.get('/', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.listarTodas);
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.cadastrar);
rotas.get('/buscarPorTurma', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.buscarPorTurma);
rotas.get('/buscarPorTurno', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.buscarPorTurno);

module.exports = rotas;
