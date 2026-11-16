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

// Remetente em domínio gratuito (gmail, hotmail...) não pode ser autenticado (SPF/DKIM/DMARC)
// pelo Brevo. Resultado: o Brevo troca o endereço por um @brevosend.com ou o Gmail/Outlook
// do destinatário rejeita/joga no spam. É a causa mais comum de "alguns e-mails não chegam".
const DOMINIOS_GRATUITOS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'yahoo.com.br', 'bol.com.br', 'uol.com.br', 'icloud.com'];
function remetenteGratuito() {
    const dominio = remetente().split('@')[1] || '';
    return DOMINIOS_GRATUITOS.includes(dominio.toLowerCase());
}
let avisouRemetente = false;
function avisarRemetenteGratuito() {
    if (avisouRemetente || !usaApi() || !remetenteGratuito()) return;
    avisouRemetente = true;
    console.warn(`[email] ATENÇÃO: o remetente ${remetente()} é de um provedor gratuito. O Brevo não consegue ` +
        'autenticar esse domínio e parte dos e-mails pode ir para o spam ou ser recusada. Use EMAIL_FROM com um ' +
        'domínio próprio autenticado no Brevo (Senders, Domains & Dedicated IPs > Domains).');
}

// Erros que valem nova tentativa: rede, tempo esgotado, limite de requisições (429) e
// instabilidade do provedor (5xx). Os outros (chave inválida, e-mail inválido, remetente não
// verificado...) não melhoram tentando de novo: são "permanentes".
function erroTemporario(err) {
    if (!err) return false;
    if (ERROS_DE_CONEXAO.includes(err.code)) return true;
    if (err.code === 'EAUTH') return false;
    // SMTP: 4xx = temporário, 5xx = permanente (o contrário do HTTP).
    if (err.responseCode) return Number(err.responseCode) >= 400 && Number(err.responseCode) < 500;
    const status = Number(err.status || 0);
    if (status === 429 || status >= 500) return true;
    if (!status && !err.code) return true; // falha desconhecida de rede: tenta de novo
    return false;
}

const espera = ms => new Promise(r => setTimeout(r, ms));

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
            erro.permanente = !erroTemporario(erro);
            if (resp.status === 401) erro.message += ' (confira BREVO_API_KEY no .env/Render)';
            if (resp.status === 429) erro.retryAfter = Number(resp.headers.get('retry-after')) || null;
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

async function enviarPorApi({ to, subject, text, html, fromName, tag }) {
    const destinatarios = (Array.isArray(to) ? to : String(to).split(','))
        .map(e => e.trim()).filter(Boolean).map(email => ({ email }));

    // A API não aceita imagem embutida (cid). Com BASE_URL em https, a logo passa a vir
    // do próprio site; sem isso, é removida para não aparecer como imagem quebrada.
    const base = String(process.env.BASE_URL || '').replace(/\/+$/, '');
    const htmlLimpo = !html ? html : (/^https:\/\//.test(base)
        ? html.replace(/src="cid:[^"]*"/gi, `src="${base}/img/logo_pi.png"`)
        : html.replace(/<img[^>]*src="cid:[^"]*"[^>]*>/gi, ''));

    const corpo = {
        sender: { name: fromName, email: remetente() },
        to: destinatarios,
        subject,
        textContent: text || undefined,
        htmlContent: htmlLimpo || undefined,
        // E-mail automático: respostas vão para a escola, se configurado.
        ...(process.env.EMAIL_REPLY_TO ? { replyTo: { email: process.env.EMAIL_REPLY_TO.trim() } } : {}),
        // Marca como transacional e agrupa no painel do Brevo (Transactional > Logs).
        tags: [tag || 'portaria-inteligente']
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
// Até 3 tentativas para falhas temporárias (rede, 429, 5xx), com espera crescente.
// Falha permanente sai na hora com err.permanente = true (a fila não insiste nela).
async function enviarEmail({ to, subject, text, html, fromName = 'Portaria Inteligente', tag, tentativas = 3 }) {
    avisarRemetenteGratuito();
    let ultimoErro;
    for (let i = 1; i <= tentativas; i++) {
        try {
            if (usaApi()) return await enviarPorApi({ to, subject, text, html, fromName, tag });
            return await enviarPorSmtp({ to, subject, text, html, fromName });
        } catch (err) {
            ultimoErro = err;
            if (err.permanente === undefined) err.permanente = !erroTemporario(err);
            if (err.permanente || i === tentativas) break;
            const ms = err.retryAfter ? Math.min(err.retryAfter * 1000, 30000) : 1500 * 2 ** (i - 1);
            console.warn(`[email] Falha temporária ao enviar para ${to} (${err.status || err.code || 'rede'}); nova tentativa em ${ms} ms.`);
            await espera(ms);
        }
    }
    throw ultimoErro;
}

async function verificarConexao() {
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

module.exports = { enviarEmail, verificarConexao, LOGO_CID, erroTemporario, remetenteGratuito };