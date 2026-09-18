const express = require('express');
const rotas = express.Router();

// Importar o controller
const alunosController = require('../controller/alunosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Todas as rotas exigem usuário autenticado.
// Cadastro, atualização e exclusão de alunos ficam restritos à Secretaria/Admin.
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.cadastrar);
rotas.get('/buscarTodos', auth, alunosController.listarTodos);
rotas.put('/atualizar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.atualizar);
rotas.put('/turma-status/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.atualizarTurmaEStatus);
rotas.delete('/apagar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), alunosController.apagar);
rotas.get('/buscarPorNome', auth, alunosController.buscarPorNome);
rotas.get('/buscarPorId', auth, alunosController.buscarPorId);
rotas.get('/buscarPorMatricula', auth, alunosController.buscarPorMatricula);
rotas.get('/buscarPorTurma', auth, alunosController.buscarPorTurma);
rotas.get('/buscarPorStatus', auth, alunosController.buscarPorStatus);

module.exports = rotas;
