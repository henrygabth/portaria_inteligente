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

<<<<<<< HEAD
// Alerta de atraso: pedidos com aluno em saída além do horário previsto de retorno
rotas.get('/atrasados', auth, exigirPapel('SECRETARIA', 'PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.listarAtrasados);

// Painel de estatísticas (dashboard) da secretaria
rotas.get('/estatisticas', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.estatisticas);

=======
>>>>>>> 4f592c031e07562a0df70c9cabbe1e2474f1b4e7
module.exports = rotas;
