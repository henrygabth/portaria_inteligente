// utils/avisosChat.js
// Aviso por e-mail de mensagem NÃO LIDA no chat entre responsável e secretaria.
// Quem está com o sistema aberto já recebe o aviso na tela (sino, som e notificação do
// navegador). O e-mail é para quem está fora: se a mensagem continuar sem leitura depois de
// CHAT_AVISO_MINUTOS (padrão 2), manda um e-mail, no máximo um a cada 30 minutos por conversa
// e direção, para não lotar a caixa de ninguém nem gastar a cota do Brevo.
const chat = require('../model/chatModel');
const { enviarEmail } = require('./email');
const { montarEmailHtml } = require('./emailTemplate');
const { escaparHtml } = require('./seguranca');

const MINUTOS = Math.max(1, Number(process.env.CHAT_AVISO_MINUTOS) || 2);
const INTERVALO = 30;
let rodando = false;

function base() { return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''); }
const resumo = t => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 160 ? s.slice(0, 157) + '…' : s; };

function emailParaResponsavel(c) {
    const qtd = c.total === 1 ? 'uma nova mensagem' : `${c.total} novas mensagens`;
    return {
        to: c.responsavel_email,
        subject: `Você tem ${qtd} da secretaria`,
        tag: 'chat-aviso-responsavel',
        text: `Olá, ${c.responsavel_nome}. A secretaria da escola enviou ${qtd} para você no Portaria Inteligente: "${resumo(c.ultimo_texto)}". Responda pelo sistema: ${base()}/home.html?tela=tela-mensagens`,
        html: montarEmailHtml({
            titulo: 'Nova mensagem da secretaria',
            saudacao: `Olá, <strong>${escaparHtml(c.responsavel_nome)}</strong>.`,
            paragrafos: [`A secretaria da escola enviou ${qtd} para você.`],
            destaque: `<p style="margin:0;font-size:14px;color:#2d3748;">“${escaparHtml(resumo(c.ultimo_texto))}”</p>`,
            botao: { texto: 'Ler e responder', url: `${base()}/home.html?tela=tela-mensagens` },
            rodape: 'Você recebeu este aviso porque a mensagem ainda não foi lida no sistema.'
        })
    };
}

function emailParaSecretaria(c, destino) {
    const qtd = c.total === 1 ? 'uma nova mensagem' : `${c.total} novas mensagens`;
    const alunos = c.alunos ? ` (responsável por ${c.alunos})` : '';
    return {
        to: destino.email,
        subject: `${c.responsavel_nome} enviou ${qtd}`,
        tag: 'chat-aviso-secretaria',
        text: `${c.responsavel_nome}${alunos} enviou ${qtd} pelo Portaria Inteligente: "${resumo(c.ultimo_texto)}". Responda pelo sistema: ${base()}/secretaria.html?tela=tela-mensagens`,
        html: montarEmailHtml({
            titulo: 'Mensagem de responsável aguardando resposta',
            saudacao: `Olá, <strong>${escaparHtml(destino.nome || 'secretaria')}</strong>.`,
            paragrafos: [`<strong>${escaparHtml(c.responsavel_nome)}</strong>${escaparHtml(alunos)} enviou ${qtd} que ainda não foi lida.`],
            destaque: `<p style="margin:0;font-size:14px;color:#2d3748;">“${escaparHtml(resumo(c.ultimo_texto))}”</p>`,
            botao: { texto: 'Abrir conversa', url: `${base()}/secretaria.html?tela=tela-mensagens` },
            rodape: 'Aviso enviado porque a mensagem está sem leitura há alguns minutos.'
        })
    };
}

async function processarAvisosChat() {
    if (rodando) return 0;
    rodando = true;
    let enviados = 0;
    try {
        const pendentes = await chat.pendentesDeAvisoEmail(MINUTOS, INTERVALO);
        if (!pendentes.length) return 0;
        const secretaria = pendentes.some(c => c.de === 'RESPONSAVEL') ? await chat.emailsSecretaria() : [];
        for (const c of pendentes) {
            try {
                if (c.de === 'SECRETARIA') {
                    if (c.responsavel_email) { await enviarEmail({ ...emailParaResponsavel(c), tentativas: 2 }); enviados++; }
                } else {
                    for (const destino of secretaria) { await enviarEmail({ ...emailParaSecretaria(c, destino), tentativas: 2 }); enviados++; }
                }
                // Registra mesmo se ninguém tinha e-mail: evita tentar de novo a cada minuto.
                await chat.registrarAvisoEmail(c.responsavel_id, c.de, c.ultimo_id);
            } catch (err) {
                console.error(`[avisosChat] Falha ao avisar conversa ${c.responsavel_id}:`, err.message);
                // Falha permanente (e-mail inválido etc.): marca para não insistir para sempre.
                if (err.permanente) await chat.registrarAvisoEmail(c.responsavel_id, c.de, c.ultimo_id).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[avisosChat] Erro ao verificar mensagens não lidas:', err.message);
    } finally {
        rodando = false;
    }
    return enviados;
}

module.exports = { processarAvisosChat, emailParaResponsavel, emailParaSecretaria };
