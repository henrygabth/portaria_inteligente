// Alertas de atraso / não retorno / chegada atrasada, em envios individuais.
// Usa o mesmo serviço Brevo/SMTP já existente; falhas não bloqueiam a portaria.
const { enviarEmail } = require('./email');
const { montarEmailHtml } = require('./emailTemplate');
const pedidos = require('../model/pedidosModel');
const alertas = require('../model/alertasEmailModel');

function escapar(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hora(data) {
    return data ? new Date(data).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    }) : 'não informado';
}

function mensagem(tipo, pedido) {
    const nome = escapar(pedido.nome_aluno);
    const turma = pedido.turma ? ` (turma ${escapar(pedido.turma)})` : '';
    const destaques = [
        `<strong>Retorno previsto:</strong> ${hora(pedido.hora_prevista_retorno)}`,
        pedido.hora_saida_real ? `<strong>Saída registrada:</strong> ${hora(pedido.hora_saida_real)}` : null,
        tipo === 'CHEGOU_ATRASADO' ? `<strong>Retorno registrado:</strong> ${hora(pedido.hora_retorno_real)}` : null
    ].filter(Boolean).map(x => `<p style="margin:0 0 5px 0">${x}</p>`).join('');
    const infos = {
        ATRASADO: {
            titulo: 'Atenção: atraso no retorno',
            assunto: `Atraso no retorno - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} está com o retorno atrasado e ainda não consta como tendo retornado à escola.`
        },
        NAO_RETORNOU: {
            titulo: 'Atenção: aluno ainda não retornou',
            assunto: `Aluno não retornou - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} continua sem registro de retorno, mais de 15 minutos após o horário previsto.`
        },
        CHEGOU_ATRASADO: {
            titulo: 'Retorno registrado com atraso',
            assunto: `Aluno retornou com atraso - ${pedido.nome_aluno}`,
            descricao: `O aluno <strong>${nome}</strong>${turma} <strong>retornou à escola</strong>, mas depois do horário previsto.`
        }
    };
    const info = infos[tipo];
    if (!info) throw new Error('Tipo de alerta desconhecido.');
    return {
        subject: info.assunto,
        text: info.descricao.replace(/<[^>]*>/g, '') + ` Retorno previsto: ${hora(pedido.hora_prevista_retorno)}.`,
        html: montarEmailHtml({
            titulo: info.titulo,
            saudacao: 'Comunicado automático do Portaria Inteligente:',
            paragrafos: [info.descricao, 'Em caso de dúvidas, procure a secretaria da escola.'],
            destaque: destaques,
            cor: 'vermelho'
        })
    };
}

async function processarAlertas() {
    // A coleta de eventos e o envio são independentes: uma falha não perde fila.
    const eventos = await alertas.listarEventosRecentes();
    for (const ev of eventos) {
        try {
            await alertas.enfileirar(ev.pedido_id, ev.tipo);
        } catch (erro) {
            console.error(`[alertas] Falha ao preparar ${ev.tipo} do pedido ${ev.pedido_id}:`, erro.message);
        }
    }
    const pendentes = await alertas.listarEnviosPendentes();
    for (const item of pendentes) {
        if (!(await alertas.reservarEnvio(item.envio_id))) continue;
        try {
            const pedido = await pedidos.buscarParaNotificacao(item.pedido_id);
            if (!pedido) throw new Error('Pedido não encontrado ao enviar alerta.');
            if (item.tipo_evento !== 'CHEGOU_ATRASADO' && pedido.status !== 'EM_SAIDA') {
                await alertas.descartarEnvio(item.envio_id, 'Aluno já retornou à escola.');
                continue;
            }
            if (!(await alertas.destinatarioAindaAutorizado(item, pedido))) {
                await alertas.descartarEnvio(item.envio_id, 'Professor não está mais vinculado à turma.');
                continue;
            }
            await enviarEmail({ to: item.email_destino, ...mensagem(item.tipo_evento, pedido) });
            await alertas.concluirEnvio(item.envio_id);
        } catch (erro) {
            console.error(`[alertas] Envio ${item.envio_id} falhou:`, erro.message);
            try { await alertas.falharEnvio(item.envio_id, erro); }
            catch (erroBanco) { console.error('[alertas] Falha ao registrar tentativa:', erroBanco.message); }
        }
    }
}
module.exports = { processarAlertas, mensagem };
