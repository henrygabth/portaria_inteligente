// chat.js — chat entre responsável e secretaria (home.html e secretaria.html).
// Tempo real: as mensagens chegam pela conexão aberta em tempo-real.js assim que são gravadas
// no banco. Se essa conexão estiver fora do ar, o chat volta sozinho a consultar o servidor a
// cada 8 s (conversa aberta) e 20 s (contador). Todo texto é escapado antes de ir para a página.
(function () {
    const API = '/api/chat';
    const token = () => localStorage.getItem('token');
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hora = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

    async function chamar(caminho, opcoes = {}) {
        const r = await fetch(API + caminho, {
            ...opcoes,
            headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
        });
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro || 'Falha ao falar com o servidor.');
        return dados;
    }

    function desenhar(el, mensagens, meuLado) {
        const noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        el.innerHTML = mensagens.length ? mensagens.map(m =>
            `<div class="chat-msg ${m.de === meuLado ? 'minha' : 'outro'}">`
            + (m.de === meuLado ? '' : `<span class="chat-quem">${m.de === 'SECRETARIA' ? 'Secretaria' : esc(m.remetente)}</span>`)
            + `${esc(m.texto)}<small>${hora(m.criado_em)}</small></div>`
        ).join('') : '<p class="chat-vazio">Nenhuma mensagem ainda. Escreva abaixo para começar.</p>';
        if (noFim || !el.dataset.ok) el.scrollTop = el.scrollHeight;
        el.dataset.ok = '1';
    }

    const tempoRealOk = () => !!(window.PITempoReal && window.PITempoReal.conectado());
    const novoUuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    const telaAberta = () => {
        const t = document.getElementById('tela-mensagens');
        return !!t && t.style.display !== 'none' && !document.hidden;
    };

    // ------------------------------------------------------------ avisos de nova mensagem
    function toast(titulo, texto, aoClicar) {
        const aviso = document.createElement('div');
        aviso.className = 'chat-toast';
        aviso.setAttribute('role', 'alert');
        aviso.innerHTML = `<strong>${esc(titulo)}</strong><span>${esc(texto.length > 90 ? texto.slice(0, 90) + '…' : texto)}</span>`;
        aviso.addEventListener('click', () => { aviso.remove(); aoClicar(); });
        document.body.appendChild(aviso);
        setTimeout(() => aviso.remove(), 9000);
    }
    function notificarNavegador(titulo, texto, tag) {
        if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
        try { new Notification(titulo, { body: texto, tag, icon: './img/logo_pi.png' }); } catch (_) { /* navegador sem suporte */ }
    }
    function pedirPermissaoNotificacao() {
        // Só pergunta uma vez e a pedido do uso (ao abrir Mensagens); respeita a escolha do usuário.
        if ('Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission(); } catch (_) { /* ignora */ }
        }
    }

    function ligarEnvio(form, area, erro, enviar) {
        const botao = form.querySelector('button');
        let ultima = { texto: null, uuid: null }; // mesma mensagem reenviada = mesmo identificador (sem duplicar)
        area.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
        });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const texto = area.value.trim();
            if (!texto) return;
            botao.disabled = true; erro.textContent = '';
            if (ultima.texto !== texto) ultima = { texto, uuid: novoUuid() };
            try { await enviar(texto, ultima.uuid); area.value = ''; ultima = { texto: null, uuid: null }; }
            catch (err) { erro.textContent = err.message; }
            finally { botao.disabled = false; area.focus(); }
        });
    }

    // ------------------------------------------------------------ contador do menu
    async function atualizarContador() {
        const el = document.getElementById('contadorChat');
        if (!el || !token()) return;
        try {
            const { naoLidas } = await chamar('/nao-lidas');
            el.textContent = naoLidas;
            el.style.display = naoLidas ? 'inline-block' : 'none';
        } catch (_) { /* silencioso: o menu continua funcionando */ }
    }

    // ------------------------------------------------------------ responsável
    let timerResp = null;
    async function carregarResp() {
        const el = document.getElementById('chatMensagens');
        if (!el) return;
        try {
            const { mensagens } = await chamar('/minha');
            desenhar(el, mensagens, 'RESPONSAVEL');
            atualizarContador();
        } catch (err) { document.getElementById('chatErro').textContent = err.message; }
    }
    function abrirResponsavel() {
        const form = document.getElementById('chatForm');
        if (form && !form.dataset.ligado) {
            form.dataset.ligado = '1';
            ligarEnvio(form, document.getElementById('chatTexto'), document.getElementById('chatErro'),
                async (texto, client_uuid) => { await chamar('/minha', { method: 'POST', body: JSON.stringify({ texto, client_uuid }) }); await carregarResp(); });
        }
        carregarResp();
        clearInterval(timerResp);
        let tique = 0;
        // Com o tempo real ligado, só confere de vez em quando (rede de segurança).
        timerResp = setInterval(() => { if (!document.hidden && (!tempoRealOk() || ++tique % 8 === 0)) carregarResp(); }, 8000);
    }

    // ------------------------------------------------------------ secretaria
    let timerSec = null;
    let atual = null; // { responsavel_id, nome }
    async function carregarConversas() {
        const lista = document.getElementById('chatLista');
        if (!lista) return;
        try {
            const conversas = await chamar('/conversas');
            lista.innerHTML = conversas.length ? conversas.map(c => `
                <button type="button" data-id="${c.responsavel_id}" data-nome="${esc(c.nome)}" class="${atual && atual.responsavel_id === c.responsavel_id ? 'ativa' : ''}">
                    <span class="chat-nome"><span>${esc(c.nome)}</span>${c.nao_lidas ? `<span class="notificacao-contador">${c.nao_lidas}</span>` : ''}</span>
                    ${c.alunos ? `<small>Aluno(s): ${esc(c.alunos)}</small>` : ''}
                    <small>${c.ultima_de === 'SECRETARIA' ? 'Você: ' : ''}${esc(c.ultima_texto)}</small>
                </button>`).join('') : '<p class="chat-vazio" style="padding:14px">Nenhuma conversa ainda. Use a busca para iniciar uma.</p>';
            lista.querySelectorAll('button').forEach(b => b.addEventListener('click', () =>
                abrirConversa({ responsavel_id: Number(b.dataset.id), nome: b.dataset.nome })));
        } catch (err) { lista.innerHTML = `<p class="chat-erro">${esc(err.message)}</p>`; }
        atualizarContador();
    }
    async function carregarConversaAtual() {
        if (!atual) return;
        try {
            const { mensagens } = await chamar(`/conversas/${atual.responsavel_id}`);
            desenhar(document.getElementById('chatMensagensSec'), mensagens, 'SECRETARIA');
        } catch (err) { document.getElementById('chatErroSec').textContent = err.message; }
    }
    async function abrirConversa(conv) {
        atual = conv;
        const el = document.getElementById('chatMensagensSec');
        el.dataset.ok = '';
        document.getElementById('chatTituloSec').textContent = conv.nome;
        document.getElementById('chatFormSec').style.display = 'flex';
        document.getElementById('chatErroSec').textContent = '';
        await carregarConversaAtual();
        carregarConversas();
    }
    async function buscar() {
        const termo = document.getElementById('chatBusca').value.trim();
        const lista = document.getElementById('chatLista');
        if (termo.length < 2) { carregarConversas(); return; }
        try {
            const achados = await chamar(`/responsaveis?busca=${encodeURIComponent(termo)}`);
            lista.innerHTML = achados.length ? achados.map(c => `
                <button type="button" data-id="${c.responsavel_id}" data-nome="${esc(c.nome)}">
                    <span class="chat-nome"><span>${esc(c.nome)}</span></span>
                    ${c.alunos ? `<small>Aluno(s): ${esc(c.alunos)}</small>` : ''}
                </button>`).join('') : '<p class="chat-vazio" style="padding:14px">Nenhum responsável encontrado.</p>';
            lista.querySelectorAll('button').forEach(b => b.addEventListener('click', () =>
                abrirConversa({ responsavel_id: Number(b.dataset.id), nome: b.dataset.nome })));
        } catch (err) { lista.innerHTML = `<p class="chat-erro">${esc(err.message)}</p>`; }
    }
    function abrirSecretaria() {
        const form = document.getElementById('chatFormSec');
        if (form && !form.dataset.ligado) {
            form.dataset.ligado = '1';
            ligarEnvio(form, document.getElementById('chatTextoSec'), document.getElementById('chatErroSec'), async (texto, client_uuid) => {
                if (!atual) throw new Error('Escolha uma conversa.');
                await chamar(`/conversas/${atual.responsavel_id}`, { method: 'POST', body: JSON.stringify({ texto, client_uuid }) });
                await carregarConversaAtual(); carregarConversas();
            });
            let espera;
            document.getElementById('chatBusca').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscar, 300); });
        }
        carregarConversas();
        clearInterval(timerSec);
        let tique = 0;
        timerSec = setInterval(() => {
            if (document.hidden) return;
            if (tempoRealOk() && ++tique % 8 !== 0) return;
            if (!document.getElementById('chatBusca').value.trim()) carregarConversas();
            carregarConversaAtual();
        }, 8000);
    }

    // ------------------------------------------------------------ chegada em tempo real
    const souSecretaria = () => !!document.getElementById('chatLista');
    function abrirTelaMensagens() { if (typeof mostrarTela === 'function') mostrarTela('tela-mensagens'); }

    function aoChegarMensagem(dados) {
        const m = dados && dados.mensagem;
        if (!m) return;
        const sec = souSecretaria();
        const meuLado = sec ? 'SECRETARIA' : 'RESPONSAVEL';
        const deles = m.de !== meuLado;
        const naConversa = sec ? (atual && atual.responsavel_id === m.responsavel_id) : true;
        if (telaAberta()) {
            // Conversa aberta e visível: a mensagem aparece na hora (e é marcada como lida ao carregar).
            if (sec) { carregarConversas(); if (naConversa) carregarConversaAtual(); else if (deles) toast(m.remetente, m.texto, () => abrirConversa({ responsavel_id: m.responsavel_id, nome: m.remetente })); }
            else carregarResp();
        } else if (deles) {
            // Outra tela ou aba em segundo plano: aviso visual dentro do sistema e do navegador.
            const titulo = sec ? `Nova mensagem de ${m.remetente}` : 'Nova mensagem da Secretaria';
            toast(titulo, m.texto, () => { abrirTelaMensagens(); if (sec) abrirConversa({ responsavel_id: m.responsavel_id, nome: m.remetente }); });
            notificarNavegador(titulo, m.texto, 'pi-chat-' + m.responsavel_id);
        }
        atualizarContador();
    }
    function ligarTempoReal() {
        if (!window.PITempoReal) return;
        PITempoReal.on('chat:mensagem', aoChegarMensagem);
        PITempoReal.on('chat:lida', () => atualizarContador());
        // Reconectou (ou voltou à aba): recarrega do banco o que pode ter passado.
        PITempoReal.on('reconectado', () => {
            atualizarContador();
            if (!telaAberta()) return;
            if (souSecretaria()) { carregarConversas(); carregarConversaAtual(); } else carregarResp();
        });
    }

    // Chamado pelo mostrarTela das duas páginas: liga/desliga a atualização automática.
    window.PIChat = {
        aoMudarTela(id) {
            if (id !== 'tela-mensagens') { clearInterval(timerResp); clearInterval(timerSec); return; }
            pedirPermissaoNotificacao();
            if (document.getElementById('chatLista')) abrirSecretaria(); else abrirResponsavel();
        },
        atualizarContador
    };
    document.addEventListener('DOMContentLoaded', () => {
        atualizarContador();
        ligarTempoReal();
        let tique = 0;
        setInterval(() => { if (!document.hidden && (!tempoRealOk() || ++tique % 6 === 0)) atualizarContador(); }, 20000);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden || !telaAberta()) return;
            if (souSecretaria()) { carregarConversas(); carregarConversaAtual(); } else carregarResp();
        });
    });
})();