require('dotenv').config({ override: true });
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
const nodemailer = require('nodemailer');
const path = require('path');

const destino = process.argv[2];
if (!destino) { console.log('Uso: node diagnostico_email.js seu@email.com'); process.exit(1); }

const porta = Number(process.env.SMTP_PORT) || 587;
const user = process.env.EMAIL_USER;
const pass = (process.env.EMAIL_PASS || '').replace(/[\s"']/g, '');
const from = process.env.EMAIL_FROM || user;

function transporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: porta,
        secure: porta === 465, requireTLS: porta !== 465,
        auth: { user, pass }, family: 4,
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000
    });
}

async function passo(nome, msg) {
    const t0 = Date.now();
    try {
        const info = await transporter().sendMail({ from: `"Portaria Inteligente" <${from}>`, to: destino, ...msg });
        console.log(`[OK]   ${nome} (${Date.now() - t0} ms) -> ${info.response}`);
    } catch (e) {
        console.log(`[ERRO] ${nome} (${Date.now() - t0} ms) -> code=${e.code} comando=${e.command} resposta=${e.response || ''} msg=${e.message}`);
    }
}

(async () => {
    console.log(`Host ${process.env.SMTP_HOST}:${porta}`);
    await passo('1. texto simples', { subject: 'Teste 1 - texto', text: 'texto simples' });
    await passo('2. html pequeno', { subject: 'Teste 2 - html', text: 'x', html: '<b>html pequeno</b>' });
    await passo('3. com logo anexada', {
        subject: 'Teste 3 - logo', text: 'x',
        html: '<img src="cid:logo_portaria"> com logo',
        attachments: [{ filename: 'logo.png', path: path.join(__dirname, 'utils', 'logo_portaria.png'), cid: 'logo_portaria' }]
    });
})();