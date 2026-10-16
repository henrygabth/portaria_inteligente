// utils/agendador.js
// Tarefas de fundo, sem depender de nenhuma lib de cron externa:
//   1) Gerar os pedidos do dia a partir dos horários fixos (pedidos recorrentes).
//   2) Alertar secretaria/portaria quando um aluno não volta no horário previsto.
//   3) Avisar os PAIS por e-mail quando o aluno não voltou no horário previsto.
// Rodam de tempos em tempos enquanto o servidor Node estiver de pé.

const pedidosModel = require('../model/pedidosModel');
const pedidosRecorrentesModel = require('../model/pedidosRecorrentesModel');
const usuariosModel = require('../model/usuariosModel');
const { enviarEmail } = require('./email');
const { montarEmailHtml } = require('./emailTemplate');
const { notificarResponsaveis } = require('./emailsPais');

function hojeStr() {
    const agora = new Date();
    const offsetMs = agora.getTimezoneOffset() * 60000;
    return new Date(agora.getTime() - offsetMs).toISOString().slice(0, 10);
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
// 2) Alerta de atraso no retorno -> secretaria e portaria
// --------------------------------------------------------
async function alertarEscolaSobreAtrasos() {
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
                console.error('[agendador] Erro ao enviar alerta de atraso por e-mail:', erroEmail.message);
                continue; // não marca como enviado; tenta de novo no próximo ciclo
            }
        }

        await pedidosModel.marcarAlertaEnviado(pedido.pedidos_saida_id);
    }
}

// --------------------------------------------------------
// 3) "Aluno não voltou" -> e-mail para os pais
// --------------------------------------------------------
async function avisarPaisQueNaoVoltou() {
    const pedidos = await pedidosModel.buscarNaoRetornaramParaPais();

    for (const pedido of pedidos) {
        const r = await notificarResponsaveis(pedido.pedidos_saida_id, 'NAO_RETORNOU');
        // Marca como avisado se enviou para todos, ou se não há ninguém com e-mail
        // (evita ficar tentando para sempre). Se houve falha, tenta de novo no próximo ciclo.
        if (r.falhas === 0) {
            await pedidosModel.marcarAvisoPaisEnviado(pedido.pedidos_saida_id);
        }
    }
}

let verificandoAtrasos = false;

async function verificarAtrasos() {
    if (verificandoAtrasos) return;
    verificandoAtrasos = true;
    try {
        await alertarEscolaSobreAtrasos();
    } catch (error) {
        console.error('[agendador] Erro no alerta de atraso para a escola:', error);
    }
    try {
        await avisarPaisQueNaoVoltou();
    } catch (error) {
        console.error('[agendador] Erro ao avisar os pais sobre aluno que não voltou:', error);
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

    // Atrasos / aluno que não voltou: verifica a cada 1 minuto.
    setInterval(verificarAtrasos, 60 * 1000);

    console.log('[agendador] Rotinas de pedidos recorrentes e alerta de atraso iniciadas.');
}

module.exports = { iniciarAgendador, gerarPedidosRecorrentesDoDia, verificarAtrasos };
