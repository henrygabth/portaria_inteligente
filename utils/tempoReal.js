// utils/tempoReal.js
// Comunicação em tempo real (Server-Sent Events) sem dependências novas.
//  - O navegador abre UMA conexão GET /api/tempo-real/eventos (autenticada por JWT no
//    cabeçalho Authorization, igual às demais rotas) e recebe eventos do servidor.
//  - Para enviar, o navegador continua usando as rotas POST normais (ex.: /api/chat/minha).
//  - Tudo que chega por aqui já foi gravado no MySQL ANTES de ser emitido: se a conexão
//    cair, nada se perde; ao reconectar a tela recarrega do banco.
// Funciona em uma instância de servidor (o caso do Render com 1 instância). Se um dia houver
// várias instâncias, será preciso um canal compartilhado (ex.: Redis) entre elas.

const MAX_CONEXOES_POR_USUARIO = 5;
const INTERVALO_BATIDA_MS = 25000;

const clientes = new Map();   // id_usuario -> Set<cliente>
let temporizador = null;

function papelDe(usuario) { return String(usuario?.tipo_usuario || '').toUpperCase(); }

function escrever(cliente, texto) {
    try { cliente.res.write(texto); return true; }
    catch (_) { remover(cliente); return false; }
}

function remover(cliente) {
    const conjunto = clientes.get(cliente.id);
    if (conjunto) {
        conjunto.delete(cliente);
        if (!conjunto.size) clientes.delete(cliente.id);
    }
    if (!clientes.size && temporizador) { clearInterval(temporizador); temporizador = null; }
    try { cliente.res.end(); } catch (_) { /* conexão já encerrada */ }
}

function iniciarBatida() {
    if (temporizador) return;
    // Mantém a conexão viva atrás de proxies e fecha as que passaram da validade do token
    // (o navegador reconecta e, sem token válido, é mandado de volta ao login).
    temporizador = setInterval(() => {
        const agora = Date.now() / 1000;
        for (const conjunto of [...clientes.values()]) {
            for (const cliente of [...conjunto]) {
                if (cliente.expira && cliente.expira <= agora) { remover(cliente); continue; }
                escrever(cliente, ': batida\n\n');
            }
        }
    }, INTERVALO_BATIDA_MS);
    if (temporizador.unref) temporizador.unref();
}

// Handler da rota. Exige req.usuario (preenchido pelo middleware auth).
function conectar(req, res) {
    const usuario = req.usuario;
    if (!usuario || !usuario.id_usuario) return res.status(401).json({ erro: 'Não autenticado.' });
    res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    if (res.flushHeaders) res.flushHeaders();

    const cliente = { id: Number(usuario.id_usuario), papel: papelDe(usuario), expira: Number(usuario.exp) || null, res };
    let conjunto = clientes.get(cliente.id);
    if (!conjunto) { conjunto = new Set(); clientes.set(cliente.id, conjunto); }
    // Muitas abas abertas: fecha a mais antiga em vez de acumular conexões.
    while (conjunto.size >= MAX_CONEXOES_POR_USUARIO) remover(conjunto.values().next().value);
    conjunto.add(cliente);

    res.write('retry: 3000\n\n');
    escrever(cliente, `event: pronto\ndata: ${JSON.stringify({ em: Date.now() })}\n\n`);
    iniciarBatida();
    req.on('close', () => remover(cliente));
}

function montar(evento, dados) {
    return `event: ${evento}\ndata: ${JSON.stringify(dados ?? {})}\n\n`;
}

// Envia a um usuário específico (todas as abas dele).
function publicarParaUsuario(idUsuario, evento, dados) {
    const conjunto = clientes.get(Number(idUsuario));
    if (!conjunto) return 0;
    const texto = montar(evento, dados);
    let enviados = 0;
    for (const cliente of [...conjunto]) if (escrever(cliente, texto)) enviados++;
    return enviados;
}

// Envia a todos de um ou mais perfis (ex.: SECRETARIA e ADMIN, que atendem o chat).
function publicarParaPapeis(papeis, evento, dados) {
    const lista = papeis.map(p => String(p).toUpperCase());
    const texto = montar(evento, dados);
    let enviados = 0;
    for (const conjunto of [...clientes.values()]) {
        for (const cliente of [...conjunto]) {
            if (lista.includes(cliente.papel) && escrever(cliente, texto)) enviados++;
        }
    }
    return enviados;
}

function totalConexoes() {
    let total = 0;
    for (const c of clientes.values()) total += c.size;
    return total;
}

// Só para testes/encerramento do servidor.
function encerrarTodos() {
    for (const conjunto of [...clientes.values()]) for (const c of [...conjunto]) remover(c);
    if (temporizador) { clearInterval(temporizador); temporizador = null; }
}

module.exports = { conectar, publicarParaUsuario, publicarParaPapeis, totalConexoes, encerrarTodos };
