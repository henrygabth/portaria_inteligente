const express = require('express');
const rotas = express.Router();
rotas.param('id', (req, res, next, valor) => (/^[1-9]\d{0,9}$/.test(valor) ? next() : res.status(400).json({ erro: 'Identificador inválido.' })));
const ctl = require('../controller/auditoriaController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

rotas.get('/acoes', auth, exigirPapel('SECRETARIA', 'ADMIN'), ctl.acoes);
rotas.get('/', auth, exigirPapel('SECRETARIA', 'ADMIN'), ctl.listar);
rotas.get('/exportar', auth, exigirPapel('SECRETARIA', 'ADMIN'), ctl.exportar);
rotas.get('/pedido/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), ctl.trilhaPedido);
rotas.post('/identificacao', auth, exigirPapel('PORTARIA', 'PORTEIRO', 'SECRETARIA', 'ADMIN'), ctl.identificacao);

module.exports = rotas;
