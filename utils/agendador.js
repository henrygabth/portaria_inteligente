// utils/agendador.js
// Duas tarefas de fundo, sem depender de nenhuma lib de cron externa:
//   1) Gerar os pedidos do dia a partir dos moldes recorrentes ativos.
//   2) Verificar pedidos com retorno atrasado e notificar secretaria/portaria.
// Ambas rodam de tempos em tempos enquanto o servidor Node estiver de pé.

const pedidosModel = require('../model/pedidosModel');
const pedidosRecorrentesModel = require('../model/pedidosRecorrentesModel');
const usuariosModel = require('../model/usuariosModel');
const { enviarEmail } = require('./email');
const { montarEmailHtml } = require('./emailTemplate');

function hojeStr() {
    const agora = new Date();
    const offsetMs = agora.getTimezoneOffset() * 60000;
    return new Date(agora.getTime() - offsetMs).toISOString().slice(0, 10);
}

// --------------------------------------------------------
// 1) Pedidos recorrentes: cria o pedido do dia a partir dos moldes ativos
// --------------------------------------------------------
async function gerarPedidosRecorrentesDoDia() {
    try {
        const dataStr = hojeStr();
        const diaSemana = new Date().getDay(); // 0=domingo ... 6=sábado

        const moldes = await pedidosRecorrentesModel.listarAtivosPorDia(diaSemana);

        for (const molde of moldes) {
            const jaExiste = await pedidosRecorrentesModel.existePedidoHoje(molde.recorrente_id, dataStr);
            if (jaExiste) continue;

            const horaPrevistaSaida = `${dataStr} ${molde.hora_saida}`;
            const horaPrevistaRetorno = molde.hora_retorno ? `${dataStr} ${molde.hora_retorno}` : null;

            await pedidosModel.cadastrar(
                molde.aluno_id,
                molde.nome_aluno,
                molde.turma_id,
                molde.usuario_id,
                horaPrevistaSaida,
                molde.motivo || 'Saída recorrente',
                null,
                horaPrevistaRetorno,
                molde.recorrente_id
            );
            console.log(`[agendador] Pedido recorrente ${molde.recorrente_id} gerado para ${molde.nome_aluno} (${dataStr})`);
        }
    } catch (error) {
        console.error('[agendador] Erro ao gerar pedidos recorrentes:', error);
    }
}

// --------------------------------------------------------
// 2) Alerta de atraso no retorno
// --------------------------------------------------------
async function verificarAtrasos() {
    try {
        const atrasados = await pedidosModel.buscarAtrasadosParaAlerta();
        if (atrasados.length === 0) return;

        const destinatarios = await usuariosModel.listarEmailsPorPapel('SECRETARIA', 'PORTEIRO', 'PORTARIA');
        if (destinatarios.length === 0) {
            console.warn('[agendador] Há pedidos atrasados, mas nenhum usuário de SECRETARIA/PORTARIA tem e-mail cadastrado.');
        }

        for (const pedido of atrasados) {
            const horaPrevista = new Date(pedido.hora_prevista_retorno).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            if (destinatarios.length > 0) {
                const html = montarEmailHtml({
                    titulo: 'Aluno com retorno em atraso',
                    saudacao: 'Atenção:',
                    paragrafos: [
                        `O aluno <strong>${pedido.nome_aluno}</strong>${pedido.turma ? ` (turma ${pedido.turma})` : ''} não retornou até o horário previsto.`,
                    ],
                    destaque: `<p style="margin: 0; color: #2d3748; font-size: 13px;"><strong>Retorno previsto:</strong> ${horaPrevista}</p>`,
                    cor: 'vermelho'
                });

                try {
                    await enviarEmail({
                        to: destinatarios.map(d => d.email).join(','),
                        subject: `Atraso no retorno - ${pedido.nome_aluno}`,
                        text: `O aluno ${pedido.nome_aluno} não retornou até o horário previsto (${horaPrevista}).`,
                        html
                    });
                } catch (erroEmail) {
                    console.error('[agendador] Erro ao enviar alerta de atraso por e-mail:', erroEmail);
                    continue; // não marca como enviado; tenta de novo no próximo ciclo
                }
            }

            await pedidosModel.marcarAlertaEnviado(pedido.pedidos_saida_id);
        }
    } catch (error) {
        console.error('[agendador] Erro ao verificar atrasos:', error);
    }
}

// --------------------------------------------------------
// Inicialização: roda uma vez ao subir o servidor e depois em intervalos.
// --------------------------------------------------------
function iniciarAgendador() {
    // Pedidos recorrentes: uma vez ao iniciar (cobre reinícios no meio do dia)
    // e depois checa a cada hora (pega a virada de dia mesmo com servidor sempre ligado).
    gerarPedidosRecorrentesDoDia();
    setInterval(gerarPedidosRecorrentesDoDia, 60 * 60 * 1000);

    // Alerta de atraso: verifica a cada 1 minuto.
    setInterval(verificarAtrasos, 60 * 1000);

    console.log('[agendador] Rotinas de pedidos recorrentes e alerta de atraso iniciadas.');
}

module.exports = { iniciarAgendador, gerarPedidosRecorrentesDoDia, verificarAtrasos };
