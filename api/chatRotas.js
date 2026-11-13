const express = require('express');
const rotas = express.Router();
const controller = require('../controller/chatController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Responsável: só enxerga e escreve na própria conversa com a secretaria.
rotas.get('/minha', auth, exigirPapel('PAI'), controller.minhaConversa);
rotas.post('/minha', auth, exigirPapel('PAI'), controller.enviarResponsavel);

rotas.get('/nao-lidas', auth, exigirPapel('PAI', 'SECRETARIA', 'ADMIN'), controller.naoLidas);

// Secretaria/Admin: todas as conversas.
rotas.get('/conversas', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.conversas);
rotas.get('/responsaveis', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.buscarResponsaveis);
rotas.get('/conversas/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.conversaDoResponsavel);
rotas.post('/conversas/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), controller.responder);

module.exports = rotas;
