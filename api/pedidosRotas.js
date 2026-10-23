const express = require('express');
const rotas = express.Router();
const pedidosController = require('../controller/pedidosController');
const { auth, exigirPapel } = require('../middlewares/authenticar');

// Rotas do fluxo de saída de alunos
rotas.post('/cadastrar', auth, exigirPapel('PAI', 'SECRETARIA', 'ADMIN'), pedidosController.cadastrar);

// Só a Secretaria (ou Admin) pode aprovar/rejeitar um pedido.
rotas.put('/aprovar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.aprovar);
rotas.put('/rejeitar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.rejeitar);

// Só a Portaria (ou Admin) registra saída/retorno. Cancelamento compete à secretaria.
rotas.put('/liberar/:id', auth, exigirPapel('PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.liberar);
rotas.put('/retorno/:id', auth, exigirPapel('PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.retorno);
rotas.put('/cancelar/:id', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.cancelarSecretaria);

// Listas gerais de pedidos: só a equipe da escola (responsáveis usam /solicitante/:id).
rotas.get('/listarPorStatus', auth, exigirPapel('SECRETARIA', 'PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.listarPorStatus);

// Histórico geral da secretaria (tudo que já saiu da fila de pendentes)
rotas.get('/historico-geral', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.historicoGeral);

// Histórico do responsável (Pai)
rotas.get('/solicitante/:id', auth, pedidosController.buscarPorSolicitante);

// Auditoria: linha do tempo completa de um pedido específico
rotas.get('/historico/:id', auth, exigirPapel('SECRETARIA', 'PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.buscarHistorico);

// Alerta de atraso: pedidos com aluno em saída além do horário previsto de retorno
rotas.get('/atrasados', auth, exigirPapel('SECRETARIA', 'PORTEIRO', 'PORTARIA', 'ADMIN'), pedidosController.listarAtrasados);

// Painel de estatísticas (dashboard) da secretaria
rotas.get('/estatisticas', auth, exigirPapel('SECRETARIA', 'ADMIN'), pedidosController.estatisticas);

module.exports = rotas;
