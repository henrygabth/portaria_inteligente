
const mysql = require('mysql2/promise');

// ==========================================
// CERTIFICADO SSL DO AIVEN
// ==========================================

const CERTIFICADO_AIVEN = `-----BEGIN CERTIFICATE-----
MIIERDCCAqygAwIBAgIUH2hEquwxzh4dL/jqDdYvTD7OATcwDQYJKoZIhvcNAQEM
BQAwOjE4MDYGA1UEAwwvYmZmMTAyYTUtY2U2Yi00Y2QyLWE2MGYtZmIzMzU2NmNi
YzlkIFByb2plY3QgQ0EwHhcNMjYxMTA2MTExNzI3WhcNMzYxMTAzMTExNzI3WjA6
MTgwNgYDVQQDDC9iZmYxMDJhNS1jZTZiLTRjZDItYTYwZi1mYjMzNTY2Y2JjOWQg
UHJvamVjdCBDQTCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCCAYoCggGBAKjmYHMx
pg5O51kDSLnN9ZbPUIWerw3lxaGJmz2qkaByz3/IVmcOFLcS8kqT+8QDrnMJSxcU
cFXKdQRajyA+184IkbIxi+Rmb30u+3JW7nFgz512317IJrgBLUAjwPlQqhQWYQOG
9E7cWgCP6fmFtYDdhGUhAYQF6OY+SV7fWKBOASZG42SCMB3NweCorBvPdEcLqbPK
6DEZrY4mQjbNYULkALSyNVGmQLVQVA2ylXv6BwLkoZeGwSjMF19J5mTUqqxljN95
8R16AJU/TULxm+Y0jp0oR9xxa9JZdqKoT5UrseUe6I4SfCPTE+G7XcySD2EsvWXV
OLsAqO66H7cQwDak2EKjI/7a6XX33b39J1aCwTmfteJsggakVu97ZVeCOBuoxu1I
ZPX/XrcGB6uOPZzorcZ6fqygo7rsofauhqkIb8wC383iPDhM6dcBTVBpwJZcdtDF
iK177PSeB42EFGvtzEKrsYtjKihJD6VRm8nsEMsX0gOlo8s37mVtwJbCJwIDAQAB
o0IwQDAdBgNVHQ4EFgQUYZ3JS9fPF0hzl4+0qz1FvHjZEhowEgYDVR0TAQH/BAgw
BgEB/wIBADALBgNVHQ8EBAMCAQYwDQYJKoZIhvcNAQEMBQADggGBADMrcCB2H25S
Q32eUstpeiBvVwT4gv5k9DEPj29EXi8M/8qSiJUQvmVCzM2P93CijKk/ow+x4BfO
uLQeP6L0c4zG08WkEacGaIuiIf4JjZQDNSpleFxD7EqzKeVhgMaFf5V/mEhaH+er
ROF73v+hLsKqrGXc0E5f/rhxymMeBoVex4kcZxshk3vLPIk/pvP8MhaXlRhyykYB
sKE8Y4c5i5Y8BIuHuwD9ug4W2YRi3HYt7HXSFh76/0rGaFnAw/KwM1JnDjfJKy6Q
l3+jsLwoHFRBIMht4a+d7ee2iV2nVCa2lM+1HOvJbDoM3+5rPu6o6+G06ARPS++p
/99JgRyvAla4DQwXomSIY5vc1AkpMfbMWhajb4hLoMWkI4TGHoINsZKo1Ei4WY35
aPlonk/cWSv9Tc+QRq6hAkg8Y5ScIKKQTiyWAyFHcg7YpD7HN8f02hgAY0zQeeZv
p57csoNYgnGEMmU6DComjaBDw8kkIe0vQ/hSlGZWeBrnmqgQu9SynA==
-----END CERTIFICATE-----`;

// ==========================================
// VALIDAR VARIÁVEIS DE AMBIENTE
// ==========================================

const camposObrigatorios = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME'
];

const faltando = camposObrigatorios.filter(
    campo => !process.env[campo]
);

if (faltando.length > 0) {
    throw new Error(
        `Configuração de banco incompleta: ${faltando.join(', ')}`
    );
}

// ==========================================
// CONFIGURAÇÃO DA CONEXÃO
// ==========================================

const host = process.env.DB_HOST;

const usandoAiven = host
    .toLowerCase()
    .endsWith('.aivencloud.com');

const configBanco = {
    host: host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000,

    charset: 'utf8mb4'
};

// ==========================================
// SSL SE O BANCO ESTIVER NO AIVEN
// ==========================================

if (usandoAiven) {
    configBanco.ssl = {
        ca: CERTIFICADO_AIVEN,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
    };
}

const conexaoBanco = mysql.createPool(configBanco);

// ==========================================
// FUSO HORÁRIO - SÃO PAULO
// ==========================================

function offsetLocal() {
    const min = -new Date().getTimezoneOffset();
    const sinal = min >= 0 ? '+' : '-';
    const abs = Math.abs(min);

    return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

conexaoBanco.pool.on('connection', (conn) => {
    conn.query(
        `SET time_zone = '${offsetLocal()}'`,
        (err) => {
            if (err) {
                console.warn(
                    '[banco] Não foi possível ajustar o fuso horário:',
                    err.message
                );
            }
        }
    );
});

// ==========================================
// EXPORTAÇÃO
// ==========================================

module.exports = conexaoBanco;
