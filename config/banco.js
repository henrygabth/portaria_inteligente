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
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// O horário previsto de saída/retorno vem do navegador (horário local da escola),
// mas NOW() do MySQL usa o fuso do servidor de banco. Se os dois fusos forem
// diferentes, "atrasado", "pedido do dia" etc. ficam errados. Aqui a sessão de
// cada conexão passa a usar o mesmo fuso do servidor Node.
function offsetLocal() {
    // O index.js já fixou process.env.TZ (America/Sao_Paulo), então isto devolve -03:00.
    const min = -new Date().getTimezoneOffset();
    const sinal = min >= 0 ? '+' : '-';
    const abs = Math.abs(min);
    return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

conexaoBanco.pool.on('connection', (conn) => {
    conn.query(`SET time_zone = '${offsetLocal()}'`, (err) => {
        if (err) console.warn('[banco] Não foi possível ajustar o fuso horário da sessão:', err.message);
    });
});

module.exports = conexaoBanco;