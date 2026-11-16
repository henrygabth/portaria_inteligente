// utils/seguranca.js
// Proteções gerais do servidor, sem dependências externas:
//   - cabeçalhos de segurança (equivalente ao básico do "helmet");
//   - limitador de tentativas em memória (login, recuperação de senha, API em geral);
//   - validação de senha e escape de HTML para e-mails.
// O limitador vale para 1 instância (caso do Render). Com várias instâncias seria preciso
// guardar os contadores num lugar compartilhado (ex.: Redis).

// ------------------------------------------------------------ cabeçalhos
function cabecalhosSeguranca(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // As telas usam alguns onclick="" e estilos inline, por isso 'unsafe-inline' continua
    // permitido. Mesmo assim a política bloqueia scripts de outros domínios, plugins,
    // <base> trocado, envio de formulário para fora e a página dentro de iframe.
    // VLibras (tradução para Libras do Governo Federal) só é carregado quando a pessoa liga
    // no menu de acessibilidade; ele usa WebGL/WebAssembly, por isso o 'unsafe-eval' e os workers.
    const VLIBRAS = 'https://vlibras.gov.br https://*.vlibras.gov.br';
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net ${VLIBRAS}`,
        `style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com ${VLIBRAS}`,
        `font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com ${VLIBRAS}`,
        `img-src 'self' data: blob: ${VLIBRAS}`,
        `connect-src 'self' ${VLIBRAS}`,
        `media-src 'self' blob: ${VLIBRAS}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
    ].join('; '));
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    // Respostas da API têm dados pessoais: nada de cache em navegador/proxy.
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
}

// ------------------------------------------------------------ limitador
const baldes = new Map(); // chave -> { contagem, expira }

function limparExpirados() {
    const agora = Date.now();
    for (const [chave, b] of baldes) if (b.expira <= agora) baldes.delete(chave);
}
const faxina = setInterval(limparExpirados, 60 * 1000);
if (faxina.unref) faxina.unref();

/**
 * Cria um middleware que limita requisições por janela de tempo.
 * @param {object} op
 * @param {string} op.nome      prefixo da chave (separa um limitador do outro)
 * @param {number} op.max       requisições permitidas na janela
 * @param {number} op.janelaMs  tamanho da janela
 * @param {(req)=>string} [op.chave] parte extra da chave (ex.: e-mail digitado)
 * @param {string} [op.mensagem]
 */
function limitar({ nome, max, janelaMs, chave, mensagem }) {
    return (req, res, next) => {
        const extra = chave ? String(chave(req) || '').toLowerCase().slice(0, 150) : '';
        const id = `${nome}|${req.ip}|${extra}`;
        const agora = Date.now();
        let b = baldes.get(id);
        if (!b || b.expira <= agora) { b = { contagem: 0, expira: agora + janelaMs }; baldes.set(id, b); }
        b.contagem++;
        if (b.contagem > max) {
            const segundos = Math.ceil((b.expira - agora) / 1000);
            res.setHeader('Retry-After', String(segundos));
            return res.status(429).json({
                erro: mensagem || `Muitas tentativas. Tente novamente em ${Math.ceil(segundos / 60)} minuto(s).`
            });
        }
        next();
    };
}

function zerarLimites() { baldes.clear(); }

// ------------------------------------------------------------ validações
const SENHA_MIN = 8;
const SENHA_MAX = 72; // limite do bcrypt: o que passar disso seria ignorado

function validarSenha(senha) {
    if (typeof senha !== 'string') return 'Informe a senha.';
    if (senha.length < SENHA_MIN) return `A senha deve ter pelo menos ${SENHA_MIN} caracteres.`;
    if (Buffer.byteLength(senha, 'utf8') > SENHA_MAX) return `A senha deve ter no máximo ${SENHA_MAX} caracteres.`;
    if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return 'A senha deve ter letras e números.';
    return null;
}

const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]{2,}$/;
function emailValido(email) {
    const e = String(email || '').trim();
    return e.length <= 150 && EMAIL_RE.test(e);
}

function escaparHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function idPositivo(valor) {
    const n = Number(valor);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

module.exports = {
    cabecalhosSeguranca, limitar, zerarLimites,
    validarSenha, emailValido, escaparHtml, idPositivo,
    SENHA_MIN, SENHA_MAX
};
