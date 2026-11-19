// Rota pública da página de apresentação (conheca.html).
const express = require('express');
const rotas = express.Router();
const contatoController = require('../controller/contatoController');
const { limitar } = require('../utils/seguranca');

rotas.post('/', limitar({ nome: 'contato-comercial', max: 5, janelaMs: 60 * 60 * 1000, mensagem: 'Você já enviou alguns pedidos. Tente de novo mais tarde.' }), contatoController.enviar);

module.exports = rotas;
