// utils/email.js
// Ponto ÚNICO de envio de e-mails do sistema.
// Se BREVO_API_KEY estiver no .env, envia pela API HTTPS do Brevo (porta 443,
// raramente bloqueada). Senão, usa SMTP (Gmail ou qualquer outro servidor).
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOGO_PATH = path.join(__dirname, 'logo_portaria.png');
const LOGO_CID = 'logo_portaria';
const BREVO_API = 'https://api.brevo.com/v3';

const ERROS_DE_CONEXAO = ['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'ENETUNREACH', 'EHOSTUNREACH', 'EDNS', 'ESOCKETTIMEDOUT'];

// ---------------------------------------------------------------- API Brevo
function usaApi() {
    return !!(process.env.BREVO_API_KEY || '').trim();
}

function remetente() {
    const user = (process.env.EMAIL_USER || '').trim();
    return (process.env.EMAIL_FROM || user || 'portariainteligente950@gmail.com').trim();
}

async function chamarApi(metodo, rota, corpo) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const resp = await fetch(BREVO_API + rota, {
            method: metodo,
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': process.env.BREVO_API_KEY.trim()
            },
            body: corpo ? JSON.stringify(corpo) : undefined,
            signal: controller.signal
        });
        const texto = await resp.text();
        let dados = {};
        try { dados = texto ? JSON.parse(texto) : {}; } catch (_) { dados = { message: texto }; }
        if (!resp.ok) {
            const erro = new Error(`Brevo API ${resp.status}: ${dados.message || texto || 'erro desconhecido'}`);
            erro.status = resp.status;
            throw erro;
        }
        return dados;
    } catch (err) {
        if (err.name === 'AbortError') {
            const e = new Error('Tempo esgotado ao falar com a API do Brevo (20s). A rede pode estar bloqueando api.brevo.com.');
            e.code = 'ETIMEDOUT';
            throw e;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function enviarPorApi({ to, subject, text, html, fromName }) {
    const destinatarios = (Array.isArray(to) ? to : String(to).split(','))
        .map(e => e.trim()).filter(Boolean).map(email => ({ email }));

    // A API não aceita imagem embutida (cid); remove a logo para não aparecer
    // como imagem quebrada.
    const htmlLimpo = html ? html.replace(/<img[^>]*src="cid:[^"]*"[^>]*>/gi, '') : html;

    const corpo = {
        sender: { name: fromName, email: remetente() },
        to: destinatarios,
        subject,
        textContent: text || undefined,
        htmlContent: htmlLimpo || undefined
    };
    if (!corpo.htmlContent && !corpo.textContent) corpo.textContent = ' ';

    const info = await chamarApi('POST', '/smtp/email', corpo);
    console.log(`[email] Enviado para ${to} (API Brevo) id=${info.messageId}`);
    return info;
}

// --------------------------------------------------------------------- SMTP
function configSmtp() {
    const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const user = (process.env.EMAIL_USER || 'portariainteligente950@gmail.com').trim();
    const pass = (process.env.EMAIL_PASS || '').replace(/[\s"']/g, '');
    const from = remetente();
    const ehGmail = host === 'smtp.gmail.com';
    const portaPadrao = Number(process.env.SMTP_PORT) || (ehGmail ? 465 : 587);
    const portas = ehGmail ? [portaPadrao, portaPadrao === 465 ? 587 : 465] : [portaPadrao];
    return { host, user, pass, from, portas };
}

function criarTransporter(host, porta, user, pass) {
    return nodemailer.createTransport({
        host, port: porta,
        secure: porta === 465,
        requireTLS: porta !== 465,
        auth: { user, pass },
        family: 4,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
}

function descreverErroSmtp(err, cfg) {
    if (err && err.code === 'EAUTH') {
        return `Login recusado pelo servidor de e-mail (EAUTH) para o usuário "${cfg.user}" (senha com ${cfg.pass.length} caracteres). Confira EMAIL_USER e EMAIL_PASS no .env.`;
    }
    if (err && ERROS_DE_CONEXAO.includes(err.code)) {
        return `Falha de conexão com ${cfg.host} (${err.code}). A rede/firewall pode estar bloqueando ou derrubando o SMTP. Use BREVO_API_KEY no .env para enviar pela API (porta 443).`;
    }
    return err && err.message ? err.message : String(err);
}

async function enviarPorSmtp({ to, subject, text, html, fromName }) {
    const cfg = configSmtp();
    if (!cfg.pass) throw new Error('EMAIL_PASS não está definido no .env');

    const mensagem = { from: `"${fromName}" <${cfg.from}>`, to, subject, text, html };
    if (html && html.includes(`cid:${LOGO_CID}`) && fs.existsSync(LOGO_PATH)) {
        mensagem.attachments = [{ filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID }];
    }

    let ultimoErro;
    for (const porta of cfg.portas) {
        try {
            const info = await criarTransporter(cfg.host, porta, cfg.user, cfg.pass).sendMail(mensagem);
            console.log(`[email] Enviado para ${to} (${cfg.host}:${porta}) id=${info.messageId}`);
            return info;
        } catch (err) {
            ultimoErro = err;
            console.error(`[email] Falha em ${cfg.host}:${porta} -> ${err.code || ''} ${err.responseCode || ''} usuário="${cfg.user}"`);
            if (!ERROS_DE_CONEXAO.includes(err.code)) break;
        }
    }
    ultimoErro.message = descreverErroSmtp(ultimoErro, cfg);
    throw ultimoErro;
}

// ------------------------------------------------------------- Interface
// Em homologação no Render, nenhum e-mail real sai por padrão.
// A aplicação usa a mesma rotina de simulação que já existia no teste local.
function enviosSimulados() {
    const ambienteSeguro = process.env.MODO_TESTE_LOCAL === '1' || process.env.AMBIENTE === 'homologacao';
    return ambienteSeguro && process.env.EMAILS_REAIS_NO_TESTE !== '1';
}

async function enviarEmail({ to, subject, text, html, fromName = 'Portaria Inteligente' }) {
    if (enviosSimulados()) {
        // Entrega simulada apenas no ambiente de teste. Evita enviar mensagens
        // reais a responsáveis/professores durante a homologação.
        console.log(`[email][SIMULADO] Destinatário: ${to} | Assunto: ${subject}`);
        return { messageId: 'simulado-local', simulado: true };
    }
    if (usaApi()) return enviarPorApi({ to, subject, text, html, fromName });
    return enviarPorSmtp({ to, subject, text, html, fromName });
}

async function verificarConexao() {
    if (enviosSimulados()) {
        return [{ porta: 'Simulação local', ok: true, simulado: true }];
    }
    if (usaApi()) {
        try {
            await chamarApi('GET', '/account');
            return [{ porta: 'API Brevo (443)', ok: true }];
        } catch (err) {
            return [{ porta: 'API Brevo (443)', ok: false, codigo: err.code, motivo: err.message }];
        }
    }
    const cfg = configSmtp();
    const resultados = [];
    for (const porta of cfg.portas) {
        try {
            await criarTransporter(cfg.host, porta, cfg.user, cfg.pass).verify();
            resultados.push({ porta, ok: true });
        } catch (err) {
            resultados.push({ porta, ok: false, codigo: err.code, motivo: descreverErroSmtp(err, cfg) });
        }
    }
    return resultados;
}

module.exports = { enviarEmail, verificarConexao, LOGO_CID };