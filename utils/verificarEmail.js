// utils/verificarEmail.js
// Verifica se um e-mail "existe de verdade" no sentido que dá para confirmar
// sem enviar nada: formato válido + o domínio existe e tem servidor de e-mail
// (registro MX, ou A/AAAA como alternativa, conforme a RFC 5321).
//
// Obs.: confirmar que a CAIXA específica existe (ex.: joao@gmail.com) exige
// conversar com o servidor SMTP do provedor (porta 25), o que a maioria das
// redes bloqueia e os provedores costumam mascarar. Por isso essa checagem
// pega e-mails com domínio inexistente ou digitado errado (gmial.com,
// hotmial.com...), que são a grande maioria dos erros de digitação.
const dns = require('dns').promises;

const REGEX_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// Domínios muito comuns e seus erros de digitação mais frequentes.
const CORRECOES_DOMINIO = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
    'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmaill.com': 'gmail.com',
    'gmail.com.br': 'gmail.com', 'gnail.com': 'gmail.com', 'hotmial.com': 'hotmail.com',
    'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmal.com': 'hotmail.com',
    'outlook.con': 'outlook.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com',
    'yahoo.con': 'yahoo.com', 'yahoo.com.com': 'yahoo.com', 'icloud.con': 'icloud.com'
};

const TIMEOUT_MS = 4000;

function comTimeout(promessa) {
    return Promise.race([
        promessa,
        new Promise((_, rejeita) => setTimeout(() => rejeita(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), TIMEOUT_MS))
    ]);
}

// Códigos de erro de DNS que significam "este domínio não existe / não recebe e-mail".
const SEM_DOMINIO = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

// Em redes que bloqueiam/derrubam DNS (comum em rede escolar), TODO domínio
// "não existe". Para não recusar e-mails bons por falha de rede, antes de
// declarar um domínio inexistente conferimos se o DNS resolve um domínio
// sabidamente real. Resultado em cache por 60s.
let dnsFuncionando = { valor: null, em: 0 };
async function dnsEstaFuncionando() {
    if (dnsFuncionando.valor !== null && Date.now() - dnsFuncionando.em < 60000) return dnsFuncionando.valor;
    let ok = false;
    try {
        ok = (await comTimeout(dns.resolveMx('gmail.com'))).length > 0;
    } catch (_) { ok = false; }
    dnsFuncionando = { valor: ok, em: Date.now() };
    return ok;
}

async function dominioRecebeEmail(dominio) {
    try {
        const mx = await comTimeout(dns.resolveMx(dominio));
        // "Null MX" (RFC 7505): o domínio declara que NÃO recebe e-mail.
        if (mx.length === 1 && mx[0].exchange === '') return { ok: false };
        if (mx.length > 0) return { ok: true };
    } catch (err) {
        if (!SEM_DOMINIO.has(err.code)) throw err; // falha de rede/DNS: quem chamou decide
    }

    // Sem MX: a RFC manda usar o registro A/AAAA do próprio domínio.
    for (const resolver of [dns.resolve4, dns.resolve6]) {
        try {
            const ips = await comTimeout(resolver(dominio));
            if (ips.length > 0) return { ok: true };
        } catch (err) {
            if (!SEM_DOMINIO.has(err.code)) throw err;
        }
    }

    if (!(await dnsEstaFuncionando())) {
        throw Object.assign(new Error('DNS indisponível'), { code: 'EDNSDOWN' });
    }
    return { ok: false };
}

// Retorna { valido, verificado, motivo, sugestao }
//  - valido:     pode ser aceito (false = deve ser recusado)
//  - verificado: true se o DNS confirmou o domínio; false se não deu para
//                checar (ex.: sem internet) e o e-mail foi aceito só pelo formato
async function verificarEmail(email) {
    const texto = String(email || '').trim().toLowerCase();

    if (!texto) {
        return { valido: false, verificado: false, motivo: 'Informe um e-mail.' };
    }
    if (texto.length > 150 || !REGEX_EMAIL.test(texto) || texto.includes('..')) {
        return { valido: false, verificado: false, motivo: 'O formato do e-mail é inválido.' };
    }

    const dominio = texto.split('@')[1];

    if (CORRECOES_DOMINIO[dominio]) {
        const sugestao = texto.split('@')[0] + '@' + CORRECOES_DOMINIO[dominio];
        return {
            valido: false,
            verificado: true,
            motivo: `O domínio "${dominio}" parece errado. Você quis dizer ${sugestao}?`,
            sugestao
        };
    }

    try {
        const { ok } = await dominioRecebeEmail(dominio);
        if (!ok) {
            return {
                valido: false,
                verificado: true,
                motivo: `O domínio "${dominio}" não existe ou não recebe e-mails. Confira se o e-mail foi digitado corretamente.`
            };
        }
        return { valido: true, verificado: true };
    } catch (err) {
        // Não foi possível consultar o DNS (sem internet, timeout...). Não
        // bloqueamos o cadastro por uma falha nossa: aceita pelo formato.
        console.warn(`[verificarEmail] DNS indisponível para ${dominio}: ${err.code || err.message}`);
        return { valido: true, verificado: false, motivo: 'Não foi possível confirmar o domínio agora; e-mail aceito apenas pelo formato.' };
    }
}

module.exports = { verificarEmail };
