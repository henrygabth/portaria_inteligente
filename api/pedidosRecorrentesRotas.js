const express = require('express');
const rotas = express.Router();
const controller = require('../controller/pedidosRecorrentesController');
const { auth } = require('../middlewares/authenticar');

// Todas as rotas são do próprio Pai autenticado (dono do molde).
rotas.post('/cadastrar', auth, controller.cadastrar);
rotas.get('/meus', auth, controller.listarMeus);
rotas.put('/status/:id', auth, controller.alternarStatus);
rotas.delete('/:id', auth, controller.remover);

module.exports = rotas;
