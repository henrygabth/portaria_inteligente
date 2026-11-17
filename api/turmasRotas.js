const express = require('express');
const rotas = express.Router();
rotas.param('id', (req, res, next, valor) => (/^[1-9]\d{0,9}$/.test(valor) ? next() : res.status(400).json({ erro: 'Identificador inválido.' })));

const turmasController = require('../controller/turmasController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Turmas (salas): só Secretaria/Admin cadastram, alteram e removem.
rotas.get('/', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.listarTodas);
rotas.get('/resumo', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.resumo);
rotas.post('/cadastrar', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.cadastrar);
rotas.put('/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.atualizar);
rotas.delete('/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.apagar);
rotas.get('/buscarPorTurma', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.buscarPorTurma);
rotas.get('/buscarPorTurno', auth, exigirPapel('SECRETARIA', 'ADMIN'), turmasController.buscarPorTurno);

module.exports = rotas;
