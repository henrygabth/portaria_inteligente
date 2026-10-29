// utils/emailsPais.js
// E-mails automáticos para os responsáveis (pais) sobre a saída do aluno:
//   SAIDA          -> o aluno saiu da escola
//   RETORNO        -> o aluno voltou no horário
//   RETORNO_ATRASO -> o aluno voltou, mas depois do horário previsto
//   NAO_RETORNOU   -> passou do horário previsto e o aluno ainda não voltou
// Cada responsável recebe o seu próprio e-mail (os endereços não ficam visíveis uns para os outros).
// Nenhuma função daqui lança erro: falha de e-mail nunca pode travar a portaria.

const pedidosModel = require('../model/pedidosModel');
const { enviarEmail } = require('./email');
const { montarEmailHtml } = require('./emailTemplate');

const TOLERANCIA_MIN = 5; // mesma tolerância usada no alerta de atraso

function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtHora(data) {
    return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function fmtData(data) {
    return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function linhaDestaque(rotulo, valor) {
    return `<p style="margin: 0 0 4px 0; color: #2d3748; font-size: 13px;"><strong>${rotulo}:</strong> ${valor}</p>`;
}

function quantoTempo(minutos) {
    if (minutos < 60) return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${h} hora${h === 1 ? '' : 's'}${m ? ` e ${m} min` : ''}`;
}

// Decide se um retorno foi atrasado e por quantos minutos (além da tolerância).
function calcularAtraso(pedido) {
    if (!pedido.hora_prevista_retorno || !pedido.hora_retorno_real) return 0;
    const diff = Math.round((new Date(pedido.hora_retorno_real) - new Date(pedido.hora_prevista_retorno)) / 60000);
    return diff > TOLERANCIA_MIN ? diff : 0;
}

function montarMensagem(tipo, pedido, nomeResponsavel) {
    const aluno = esc(pedido.nome_aluno);
    const turma = pedido.turma ? ` (turma ${esc(pedido.turma)})` : '';
    const saudacao = `Olá, <strong>${esc(nomeResponsavel)}</strong>.`;

    if (tipo === 'SAIDA') {
        const quando = pedido.hora_saida_real || new Date();
        let destaque = linhaDestaque('Horário da saída', `${fmtHora(quando)} de ${fmtData(quando)}`);
        if (pedido.hora_prevista_retorno) destaque += linhaDestaque('Retorno previsto', fmtHora(pedido.hora_prevista_retorno));
        return {
            subject: `Saída registrada - ${pedido.nome_aluno}`,
            text: `Olá ${nomeResponsavel}, o aluno ${pedido.nome_aluno} saiu da escola às ${fmtHora(quando)}.`,
            html: montarEmailHtml({
                titulo: 'Saída do aluno registrada',
                saudacao,
                paragrafos: [`O aluno <strong>${aluno}</strong>${turma} foi liberado pela portaria e saiu da escola.`],
                destaque,
                cor: 'azul'
            })
        };
    }

    if (tipo === 'RETORNO' || tipo === 'RETORNO_ATRASO') {
        const quando = pedido.hora_retorno_real || new Date();
        const minAtraso = calcularAtraso(pedido);
        const atrasado = tipo === 'RETORNO_ATRASO' || minAtraso > 0;

        let destaque = linhaDestaque('Horário do retorno', `${fmtHora(quando)} de ${fmtData(quando)}`);
        if (pedido.hora_prevista_retorno) destaque += linhaDestaque('Retorno previsto', fmtHora(pedido.hora_prevista_retorno));
        if (atrasado && minAtraso > 0) destaque += linhaDestaque('Atraso', quantoTempo(minAtraso));

        return {
            subject: `${atrasado ? 'Retorno com atraso' : 'Retorno registrado'} - ${pedido.nome_aluno}`,
            text: atrasado
                ? `Olá ${nomeResponsavel}, o aluno ${pedido.nome_aluno} voltou à escola às ${fmtHora(quando)}, depois do horário previsto.`
                : `Olá ${nomeResponsavel}, o aluno ${pedido.nome_aluno} voltou à escola às ${fmtHora(quando)}.`,
            html: montarEmailHtml({
                titulo: atrasado ? 'Aluno voltou com atraso' : 'Retorno do aluno registrado',
                saudacao,
                paragrafos: [
                    atrasado
                        ? `O aluno <strong>${aluno}</strong>${turma} voltou à escola, mas <strong>depois do horário previsto</strong>.`
                        : `O aluno <strong>${aluno}</strong>${turma} voltou à escola e o retorno foi registrado pela portaria.`
                ],
                destaque,
                cor: atrasado ? 'vermelho' : 'azul'
            })
        };
    }

    if (tipo === 'NAO_RETORNOU') {
        let destaque = linhaDestaque('Retorno previsto', fmtHora(pedido.hora_prevista_retorno));
        if (pedido.hora_saida_real) destaque += linhaDestaque('Saiu às', fmtHora(pedido.hora_saida_real));
        return {
            subject: `Atenção: aluno não retornou - ${pedido.nome_aluno}`,
            text: `Olá ${nomeResponsavel}, o aluno ${pedido.nome_aluno} não voltou à escola até o horário previsto (${fmtHora(pedido.hora_prevista_retorno)}).`,
            html: montarEmailHtml({
                titulo: 'Aluno ainda não retornou',
                saudacao,
                paragrafos: [
                    `O aluno <strong>${aluno}</strong>${turma} <strong>não voltou à escola</strong> até o horário previsto.`,
                    'Se você sabe onde ele está, ou se houve algum imprevisto, entre em contato com a secretaria da escola.'
                ],
                destaque,
                cor: 'vermelho'
            })
        };
    }

    return null;
}

// Envia o aviso para todos os responsáveis do aluno.
// Retorna { total, enviados, falhas } e nunca lança erro.
async function notificarResponsaveis(pedido_id, tipo, dadosPedido = null) {
    const resultado = { total: 0, enviados: 0, falhas: 0 };
    try {
        const pedido = dadosPedido || await pedidosModel.buscarParaNotificacao(pedido_id);
        if (!pedido) return resultado;

        const destinatarios = await pedidosModel.buscarDestinatariosPais(pedido);
        resultado.total = destinatarios.length;
        if (destinatarios.length === 0) {
            console.warn(`[emails-pais] Pedido ${pedido_id}: nenhum responsável com e-mail cadastrado (${tipo}).`);
            return resultado;
        }

        // Retorno: decide aqui se foi no horário ou atrasado
        let tipoFinal = tipo;
        if (tipo === 'RETORNO' && calcularAtraso(pedido) > 0) tipoFinal = 'RETORNO_ATRASO';

        for (const dest of destinatarios) {
            const msg = montarMensagem(tipoFinal, pedido, dest.nome);
            if (!msg) continue;
            try {
                await enviarEmail({ to: dest.email, subject: msg.subject, text: msg.text, html: msg.html });
                resultado.enviados++;
            } catch (err) {
                resultado.falhas++;
                console.error(`[emails-pais] Falha ao avisar ${dest.email} (${tipoFinal}, pedido ${pedido_id}): ${err.message}`);
            }
        }
    } catch (err) {
        console.error(`[emails-pais] Erro ao preparar aviso ${tipo} do pedido ${pedido_id}:`, err.message);
    }
    return resultado;
}

module.exports = { notificarResponsaveis, calcularAtraso, montarMensagem, TOLERANCIA_MIN };
