// utils/push.js — Notificações no celular/computador mesmo com o sistema FECHADO (Web Push).
// Implementado só com o módulo crypto do Node (sem biblioteca nova):
//   - RFC 8292 (VAPID): o servidor se identifica para o serviço de push (Google, Apple, Mozilla).
//   - RFC 8291 (aes128gcm): o conteúdo vai criptografado; o serviço de push não consegue ler.
// As chaves VAPID vêm do .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). Se não existirem, o
// sistema gera um par na primeira vez e guarda na tabela config_sistema (não precisa configurar).
const crypto = require('crypto');

const b64u = buf => Buffer.from(buf).toString('base64url');
const deB64u = txt => Buffer.from(String(txt), 'base64url');

// ------------------------------------------------------------------ chaves VAPID
function gerarChavesVapid() {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { publica: b64u(ecdh.getPublicKey()), privada: b64u(ecdh.getPrivateKey()) };
}

function chavePrivadaParaAssinatura(publica, privada) {
    const pub = deB64u(publica);
    if (pub.length !== 65 || pub[0] !== 4) throw new Error('Chave pública VAPID inválida.');
    return crypto.createPrivateKey({
        format: 'jwk',
        key: { kty: 'EC', crv: 'P-256', d: b64u(deB64u(privada)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }
    });
}

// JWT ES256 que prova que a notificação veio deste servidor.
function cabecalhoVapid(endpoint, chaves, contato, agoraSeg = Math.floor(Date.now() / 1000)) {
    const aud = new URL(endpoint).origin;
    const cab = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const corpo = b64u(JSON.stringify({ aud, exp: agoraSeg + 12 * 3600, sub: contato }));
    const assinatura = crypto.sign('sha256', Buffer.from(`${cab}.${corpo}`),
        { key: chavePrivadaParaAssinatura(chaves.publica, chaves.privada), dsaEncoding: 'ieee-p1363' });
    return `vapid t=${cab}.${corpo}.${b64u(assinatura)}, k=${chaves.publica}`;
}

// ------------------------------------------------------------------ criptografia (RFC 8291)
// Devolve o corpo pronto para o POST: cabeçalho aes128gcm + texto cifrado.
function criptografar(texto, p256dh, authSecret, opcoes = {}) {
    const chaveCliente = deB64u(p256dh);
    const segredo = deB64u(authSecret);
    if (chaveCliente.length !== 65 || segredo.length < 16) throw new Error('Inscrição de notificação inválida.');

    const local = opcoes.ecdh || crypto.createECDH('prime256v1');
    if (!opcoes.ecdh) local.generateKeys();
    const chaveLocal = local.getPublicKey();
    const compartilhado = local.computeSecret(chaveCliente);
    const salt = opcoes.salt || crypto.randomBytes(16);

    const infoChave = Buffer.concat([Buffer.from('WebPush: info\0'), chaveCliente, chaveLocal]);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', compartilhado, segredo, infoChave, 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

    const cifra = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const claro = Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])]); // 0x02 = último bloco
    const cifrado = Buffer.concat([cifra.update(claro), cifra.final(), cifra.getAuthTag()]);

    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
    return Buffer.concat([salt, rs, Buffer.from([chaveLocal.length]), chaveLocal, cifrado]);
}

// Lado do navegador (usado só nos testes, para provar que a criptografia está correta).
function descriptografar(corpo, ecdhCliente, authSecret) {
    const salt = corpo.subarray(0, 16);
    const tamChave = corpo[20];
    const chaveServidor = corpo.subarray(21, 21 + tamChave);
    const cifrado = corpo.subarray(21 + tamChave);
    const compartilhado = ecdhCliente.computeSecret(chaveServidor);
    const infoChave = Buffer.concat([Buffer.from('WebPush: info\0'), ecdhCliente.getPublicKey(), chaveServidor]);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', compartilhado, deB64u(authSecret), infoChave, 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const dec = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    dec.setAuthTag(cifrado.subarray(cifrado.length - 16));
    const claro = Buffer.concat([dec.update(cifrado.subarray(0, cifrado.length - 16)), dec.final()]);
    return claro.subarray(0, claro.lastIndexOf(2)).toString('utf8');
}

// ------------------------------------------------------------------ envio
let chavesEmMemoria = null;
async function obterChaves() {
    if (chavesEmMemoria) return chavesEmMemoria;
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        chavesEmMemoria = { publica: process.env.VAPID_PUBLIC_KEY.trim(), privada: process.env.VAPID_PRIVATE_KEY.trim() };
        return chavesEmMemoria;
    }
    const db = require('../config/banco');
    const [rows] = await db.query("SELECT valor FROM config_sistema WHERE chave = 'vapid' LIMIT 1");
    if (rows[0]) { chavesEmMemoria = JSON.parse(rows[0].valor); return chavesEmMemoria; }
    const novas = gerarChavesVapid();
    // INSERT IGNORE: se dois processos gerarem ao mesmo tempo, vale o primeiro e todos releem.
    await db.query("INSERT IGNORE INTO config_sistema (chave, valor) VALUES ('vapid', ?)", [JSON.stringify(novas)]);
    const [releitura] = await db.query("SELECT valor FROM config_sistema WHERE chave = 'vapid' LIMIT 1");
    chavesEmMemoria = JSON.parse(releitura[0].valor);
    console.log('[push] Chaves de notificação geradas e guardadas no banco (config_sistema).');
    return chavesEmMemoria;
}

function contato() {
    const email = process.env.PUSH_CONTATO || process.env.EMAIL_REMETENTE || process.env.EMAIL_USER || 'contato@portariainteligente.app';
    return /^mailto:|^https:/.test(email) ? email : `mailto:${email}`;
}

// Envia para UMA inscrição. Devolve { ok, expirada } — expirada = apagar do banco.
async function enviarParaInscricao(inscricao, mensagem, opcoes = {}) {
    const chaves = await obterChaves();
    const corpo = criptografar(JSON.stringify(mensagem), inscricao.p256dh, inscricao.auth);
    const fazerFetch = opcoes.fetch || globalThis.fetch;
    const resp = await fazerFetch(inscricao.endpoint, {
        method: 'POST',
        headers: {
            Authorization: cabecalhoVapid(inscricao.endpoint, chaves, contato()),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(opcoes.ttl ?? 6 * 3600),
            Urgency: opcoes.urgencia || 'high',
            ...(mensagem.tag ? { Topic: String(mensagem.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {})
        },
        body: corpo,
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    if (resp.status === 404 || resp.status === 410) return { ok: false, expirada: true };
    if (!resp.ok) return { ok: false, expirada: false, status: resp.status };
    return { ok: true };
}

// Envia para todos os aparelhos de uma lista de usuários. Nunca lança erro.
async function enviarParaUsuarios(ids, mensagem) {
    const lista = [...new Set((ids || []).map(Number).filter(n => n > 0))];
    if (!lista.length) return 0;
    let enviados = 0;
    try {
        const pushModel = require('../model/pushModel');
        const inscricoes = await pushModel.listarPorUsuarios(lista);
        await Promise.all(inscricoes.map(async ins => {
            try {
                const r = await enviarParaInscricao(ins, mensagem);
                if (r.ok) { enviados++; pushModel.marcarEnvio(ins.inscricao_id).catch(() => {}); }
                else if (r.expirada) await pushModel.removerPorId(ins.inscricao_id);
            } catch (err) {
                console.error(`[push] Falha ao enviar para a inscrição ${ins.inscricao_id}:`, err.message);
            }
        }));
    } catch (err) {
        console.error('[push] Falha ao enviar notificações:', err.message);
    }
    return enviados;
}

async function enviarParaPapeis(papeis, mensagem) {
    try {
        const pushModel = require('../model/pushModel');
        return enviarParaUsuarios(await pushModel.usuariosComPapel(papeis), mensagem);
    } catch (err) {
        console.error('[push] Falha ao localizar destinatários:', err.message);
        return 0;
    }
}

module.exports = {
    gerarChavesVapid, cabecalhoVapid, criptografar, descriptografar, obterChaves,
    enviarParaInscricao, enviarParaUsuarios, enviarParaPapeis,
    _limparCache: () => { chavesEmMemoria = null; }
};
