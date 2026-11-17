// tempo-real.js — conexão em tempo real com o servidor (Server-Sent Events).
// Uma conexão por aba, autenticada com o mesmo token das demais chamadas (cabeçalho
// Authorization, nada de token na URL). Reconecta sozinha com espera crescente; a cada
// reconexão avisa as telas ('reconectado') para recarregarem do banco o que possa ter passado.
// Uso: PITempoReal.on('chat:mensagem', dados => ...); PITempoReal.conectado()
(function () {
    const ouvintes = {};
    let conectado = false;
    let tentativas = 0;
    let controlador = null;
    let parado = false;

    function disparar(evento, dados) {
        (ouvintes[evento] || []).forEach(fn => { try { fn(dados); } catch (_) { /* um ouvinte com erro não derruba os outros */ } });
    }

    function processar(bloco) {
        let evento = 'message';
        const dados = [];
        for (const linha of bloco.split('\n')) {
            if (linha.startsWith('event:')) evento = linha.slice(6).trim();
            else if (linha.startsWith('data:')) dados.push(linha.slice(5).trim());
        }
        if (!dados.length) return; // comentário/batida
        let json = {};
        try { json = JSON.parse(dados.join('\n')); } catch (_) { return; }
        if (evento === 'pronto') return;
        disparar(evento, json);
    }

    async function abrir() {
        const token = localStorage.getItem('token');
        if (!token || parado) return;
        controlador = new AbortController();
        try {
            const resp = await fetch('/api/tempo-real/eventos', {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/event-stream' },
                signal: controlador.signal,
                cache: 'no-store'
            });
            if (resp.status === 401 || resp.status === 403) { parado = true; return; } // sessão acabou: as telas já tratam o login
            if (!resp.ok || !resp.body) throw new Error('Falha ao abrir a conexão.');
            const reconexao = tentativas > 0;
            conectado = true; tentativas = 0;
            if (reconexao) disparar('reconectado', {});
            const leitor = resp.body.getReader();
            const decodificador = new TextDecoder();
            let resto = '';
            for (;;) {
                const { value, done } = await leitor.read();
                if (done) break;
                resto += decodificador.decode(value, { stream: true }).replace(/\r\n/g, '\n');
                let fim;
                while ((fim = resto.indexOf('\n\n')) !== -1) {
                    processar(resto.slice(0, fim));
                    resto = resto.slice(fim + 2);
                }
            }
        } catch (_) { /* cai para a reconexão abaixo */ }
        conectado = false;
        if (parado) return;
        tentativas++;
        const espera = Math.min(1000 * 2 ** Math.min(tentativas, 4), 15000);
        setTimeout(abrir, espera);
    }

    window.PITempoReal = {
        on(evento, fn) { (ouvintes[evento] = ouvintes[evento] || []).push(fn); },
        conectado: () => conectado,
        iniciar() { if (!controlador && !parado) abrir(); }
    };

    document.addEventListener('DOMContentLoaded', () => window.PITempoReal.iniciar());
    // Voltar para a aba depois de um tempo: se a conexão caiu, as telas recarregam.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !conectado) disparar('reconectado', {}); });
})();
