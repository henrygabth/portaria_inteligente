// utils/email.js
// Centraliza o envio de e-mails transacionais do sistema (fora do fluxo de
// criação de conta/recuperação de senha, que já tem seu próprio transporter
// em usuariosController.js). Usado hoje pelo cancelamento/recusa de pedidos.
const nodemailer = require('nodemailer');

function getTransporter() {
    const emailUser = process.env.EMAIL_USER || 'portariainteligente950@gmail.com';
    const emailPass = process.env.EMAIL_PASS;

    if (!emailPass) {
        console.error('ALERTA: process.env.EMAIL_PASS nao esta definido no .env!');
    }

    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: emailUser, pass: emailPass },
        // Em algumas redes/máquinas o Node tenta resolver o smtp.gmail.com
        // para um endereço IPv6 que não tem rota configurada, e a conexão
        // cai com ECONNREFUSED. Forçar IPv4 evita esse problema.
        family: 4
    });
}

async function enviarEmail({ to, subject, text, html }) {
    const emailSistema = process.env.EMAIL_USER || 'portariainteligente950@gmail.com';
    const transporter = getTransporter();

    await transporter.sendMail({
        from: `"Portaria Inteligente" <${emailSistema}>`,
        to,
        subject,
        text,
        html
    });
}

module.exports = { enviarEmail };
