const express = require('express');
const rotas = express.Router();
const pedidosController = require('../controller/pedidosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Rotas do fluxo de saída de alunos
rotas.post('/cadastrar', auth, pedidosController.cadastrar);

// Só a Secretaria (ou Admin) pode aprovar/rejeitar um pedido.
rotas.put('/aprovar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.aprovar);
rotas.put('/rejeitar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.rejeitar);

// Só a Portaria (ou Admin) pode liberar, registrar retorno ou cancelar.
rotas.put('/liberar/:id', auth, exigirPapel('PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.liberar);
rotas.put('/retorno/:id', auth, exigirPapel('PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.retorno);
rotas.put('/cancelar/:id', auth, exigirPapel('PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.cancelarPortaria);

rotas.get('/listarPorStatus', auth, pedidosController.listarPorStatus);

// Histórico do responsável (Pai)
rotas.get('/solicitante/:id', auth, pedidosController.buscarPorSolicitante);

// Auditoria: linha do tempo completa de um pedido específico
rotas.get('/historico/:id', auth, pedidosController.buscarHistorico);

module.exports = rotas;
