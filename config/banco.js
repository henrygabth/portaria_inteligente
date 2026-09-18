const mysql = require('mysql2/promise');

// Credenciais de banco não têm mais fallback embutido no código: se o .env
// não estiver configurado, a aplicação falha na inicialização em vez de
// silenciosamente conectar com credenciais fixas presentes no repositório.
const camposObrigatorios = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const faltando = camposObrigatorios.filter((campo) => !process.env[campo]);

if (faltando.length > 0) {
    throw new Error(
        `Configuração de banco incompleta. Defina no .env: ${faltando.join(', ')}`
    );
}

const conexaoBanco = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = conexaoBanco;