// utils/agendador.js
// Tarefas de fundo, sem depender de nenhuma lib de cron externa:
//   1) Gerar os pedidos do dia a partir dos horários fixos (pedidos recorrentes).
//   2) Enviar alertas de atraso/não retorno/chegada atrasada a todos os grupos.
//   3) Guardar histórico e evitar envios repetidos por destinatário.
// Rodam de tempos em tempos enquanto o servidor Node estiver de pé.

const pedidosModel = require('../model/pedidosModel');
const pedidosRecorrentesModel = require('../model/pedidosRecorrentesModel');
const professoresModel = require('../model/professoresModel');
const db = require('../config/banco');

function hojeStr() {
    const agora = new Date(); // fuso do servidor = America/Sao_Paulo (definido no index.js)
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

// --------------------------------------------------------
// 1) Pedidos recorrentes: cria o pedido do dia a partir dos horários fixos ativos
// --------------------------------------------------------
let gerandoRecorrentes = false;

// Retorna a lista de recorrente_id para os quais um pedido foi criado agora.
async function gerarPedidosRecorrentesDoDia() {
    const criados = [];
    if (gerandoRecorrentes) return criados; // evita duas execuções ao mesmo tempo (duplicaria pedidos)
    gerandoRecorrentes = true;

    try {
        const dataStr = hojeStr();
        const diaSemana = new Date().getDay(); // 0=domingo ... 6=sábado

        const moldes = await pedidosRecorrentesModel.listarAtivosPorDia(diaSemana);

        for (const molde of moldes) {
            const jaExiste = await pedidosRecorrentesModel.existePedidoHoje(molde.recorrente_id, dataStr);
            if (jaExiste) continue;

            const horaPrevistaSaida = `${dataStr} ${molde.hora_saida}`;
            const horaPrevistaRetorno = molde.hora_retorno ? `${dataStr} ${molde.hora_retorno}` : null;

            // Horário fixo criado HOJE depois do horário de saída: vale só a partir da
            // próxima ocorrência (senão geraria uma solicitação para um horário que já passou).
            if (molde.data_criacao && new Date(molde.data_criacao) > new Date(horaPrevistaSaida.replace(' ', 'T'))) {
                continue;
            }

            await pedidosModel.cadastrar(
                molde.aluno_id,
                molde.nome_aluno,
                molde.turma_id,
                molde.usuario_id,
                horaPrevistaSaida,
                molde.motivo || 'Saída para Almoço',
                null,
                horaPrevistaRetorno,
                molde.recorrente_id
            );
            criados.push(molde.recorrente_id);
            console.log(`[agendador] Pedido recorrente ${molde.recorrente_id} gerado para ${molde.nome_aluno} (${dataStr})`);
        }
    } catch (error) {
        console.error('[agendador] Erro ao gerar pedidos recorrentes:', error);
    } finally {
        gerandoRecorrentes = false;
    }
    return criados;
}

// --------------------------------------------------------
// 2) Alertas por e-mail e comunicados do professor
// --------------------------------------------------------
const { processarAlertas } = require('./alertasEmail');
let verificandoAtrasos = false;

// Os comunicados são gravados mesmo quando o Brevo está indisponível.
async function avisarProfessoresSobreAtrasos() {
    const atrasados = await pedidosModel.listarEmAtrasoParaProfessor();
    for (const pedido of atrasados) {
        await professoresModel.registrarEvento(db, pedido.pedidos_saida_id, 'ATRASADO');
        if (pedido.nao_retornou) {
            await professoresModel.registrarEvento(db, pedido.pedidos_saida_id, 'NAO_RETORNOU');
        }
    }
}

async function verificarAtrasos() {
    if (verificandoAtrasos) return;
    verificandoAtrasos = true;
    try {
        try { await avisarProfessoresSobreAtrasos(); }
        catch (erro) { console.error('[agendador] Falha nos comunicados dos professores:', erro); }
        await processarAlertas();
    } catch (erro) {
        console.error('[agendador] Erro ao processar alertas por e-mail:', erro);
    } finally {
        verificandoAtrasos = false;
    }
}

// --------------------------------------------------------
// Inicialização: roda uma vez ao subir o servidor e depois em intervalos.
// --------------------------------------------------------
function iniciarAgendador() {
    // Pedidos recorrentes: ao iniciar (cobre reinícios no meio do dia) e a cada 5 minutos
    // (pega a virada de dia e horários fixos novos mesmo com o servidor sempre ligado).
    gerarPedidosRecorrentesDoDia();
    setInterval(gerarPedidosRecorrentesDoDia, 5 * 60 * 1000);

    // Atraso (+5 min), não retorno (+15 min) e chegada atrasada: a cada minuto.
    // Em produção, validar a migration de alertas antes de iniciar o servidor.
    verificarAtrasos();
    setInterval(verificarAtrasos, 60 * 1000);

    console.log('[agendador] Rotinas de pedidos recorrentes e alerta de atraso iniciadas.');
}

module.exports = { iniciarAgendador, gerarPedidosRecorrentesDoDia, verificarAtrasos };
