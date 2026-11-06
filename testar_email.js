// Uso: node testar_email.js seu@email.com
require('dotenv').config({ override: true });
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const { enviarEmail, verificarConexao } = require('./utils/email');
const { montarEmailHtml } = require('./utils/emailTemplate');

(async () => {
    const pass = (process.env.EMAIL_PASS || '').replace(/[\s"']/g, '');
    console.log('SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com (padrão)');
    console.log('EMAIL_USER:', process.env.EMAIL_USER || '(não definido)');
    console.log('EMAIL_PASS: ' + pass.length + ' caracteres (Gmail deve ter 16)');

    const resultados = await verificarConexao();
    resultados.forEach(r => console.log(`Porta ${r.porta}:`, r.ok ? 'OK' : `FALHOU -> ${r.motivo}`));

    const destino = process.argv[2];
    if (!destino) return console.log('\nPara enviar um teste: node testar_email.js seu@email.com');

    try {
        await enviarEmail({
            to: destino,
            subject: 'Teste - Portaria Inteligente',
            text: 'Se você recebeu este e-mail, o envio está funcionando.',
            html: montarEmailHtml({ titulo: 'Teste de envio', saudacao: 'Olá!', paragrafos: ['O envio de e-mails está funcionando.'] })
        });
        console.log('E-mail de teste enviado para', destino);
    } catch (e) {
        console.error('Falha ao enviar:', e.message);
    }
})();