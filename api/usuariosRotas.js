const express = require('express');
const rotas = express.Router();
const usuariosController = require('../controller/usuariosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Rotas públicas (não exigem login)
rotas.post('/login', usuariosController.login);
rotas.post('/recuperar-senha', usuariosController.solicitarRecuperacao);
rotas.post('/redefinir-senha', usuariosController.redefinirSenha);

// Cadastro direto (self-service) fica restrito à própria equipe interna já logada,
// evitando que qualquer pessoa de fora crie uma conta escolhendo o próprio papel.
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.cadastrar);

// Apenas a Secretaria (ou Admin) pode criar a conta de um responsável (Pai)
rotas.post('/vincular-responsavel', auth, exigirPapel('SECRETARIA', 'ADMIN'), usuariosController.criarResponsavel);

rotas.get('/buscarPorNome', auth, usuariosController.buscarPorNome);
rotas.get('/buscarPorId/:id', auth, usuariosController.buscarPorId);

// Rotas protegidas por JWT
rotas.get('/conta', auth, usuariosController.getConta);
rotas.put('/conta', auth, usuariosController.atualizarConta);
rotas.put('/:id', auth, usuariosController.atualizarConta);

module.exports = rotas;
