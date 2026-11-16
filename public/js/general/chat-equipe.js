// chat-equipe.js — conversa interna entre a SECRETARIA e a PORTARIA (secretaria.html e portaria.html).
// Um canal único da escola: tudo o que um lado escreve aparece para todos do outro lado.
// Tempo real pela mesma conexão de tempo-real.js ('equipe:mensagem' e 'equipe:lida'); sem ela,
// a tela consulta o servidor a cada 8 s. Todo texto é escapado antes de ir para a página.
(function () {
    const API = '/api/chat/equipe';
    const TELA = 'tela-equipe';
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = id => document.getElementById(id);
    const RAPIDAS = {
        PORTARIA: ['Responsável chegou na portaria.', 'Aluno está na portaria sem liberação. Pode verificar?', 'Saída confirmada.', 'Aluno retornou à escola.'],
        SECRETARIA: ['Liberação aprovada, pode deixar sair.', 'Aguarde, estou verificando.', 'Não liberar, por favor.', 'Responsável já está a caminho.']
    };
    let meuLado = null, meuId = null, timer = null, vistoAte = 0;

    async function chamar(caminho = '', opcoes = {}) {
        const r = await fetch(API + caminho, {
            ...opcoes,
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
        });
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro || 'Falha ao falar com o servidor.');
        return dados;
    }
    const telaAberta = () => { const t = $(TELA); return !!t && t.style.display !== 'none' && !document.hidden; };
    const tempoRealOk = () => !!(window.PITempoReal && window.PITempoReal.conectado());
    const nomeLado = l => l === 'PORTARIA' ? 'Portaria' : 'Secretaria';
    const outroLado = () => meuLado === 'PORTARIA' ? 'SECRETARIA' : 'PORTARIA';

    function dia(v) {
        const d = new Date(v), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
        const igual = (a, b) => a.toDateString() === b.toDateString();
        return igual(d, hoje) ? 'Hoje' : igual(d, ontem) ? 'Ontem' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    }
    const hora = v => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    function desenhar(mensagens) {
        const el = $('equipeMensagens');
        if (!el) return;
        const noFim = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        let ultimoDia = '';
        el.innerHTML = mensagens.length ? mensagens.map(m => {
            const minha = m.remetente_id === meuId;
            const d = dia(m.criado_em);
            const separador = d !== ultimoDia ? `<div class="equipe-dia"><span>${esc(d)}</span></div>` : '';
            ultimoDia = d;
            const visto = minha && m.lado === meuLado && Number(m.mensagem_id) <= vistoAte;
            return separador + `<div class="chat-msg ${minha ? 'minha' : 'outro'} lado-${m.lado === 'PORTARIA' ? 'portaria' : 'secretaria'}">`
                + (minha ? '' : `<span class="chat-quem">${esc(m.remetente)} · ${nomeLado(m.lado)}</span>`)
                + `${esc(m.texto)}<small>${hora(m.criado_em)}${minha ? ` <i class="fas ${visto ? 'fa-check-double' : 'fa-check'}" title="${visto ? 'Visto pela ' + nomeLado(outroLado()) : 'Enviada'}"></i>` : ''}</small></div>`;
        }).join('') : `<p class="chat-vazio"><i class="fas fa-headset"></i><br>Nenhuma mensagem ainda.<br>Use este canal para combinar liberações e avisos rápidos com a ${nomeLado(outroLado() || 'SECRETARIA').toLowerCase()}.</p>`;
        if (noFim || !el.dataset.ok) el.scrollTop = el.scrollHeight;
        el.dataset.ok = '1';
    }

    async function carregar() {
        try {
            const dados = await chamar();
            meuLado = dados.meuLado; meuId = dados.meuId; vistoAte = Number(dados.vistoAte) || 0;
            desenharRapidas();
            desenhar(dados.mensagens || []);
            definirContador(0);
            $('equipeErro').textContent = '';
        } catch (err) { $('equipeErro').textContent = err.message; }
    }

    function definirContador(n) {
        const el = $('contadorEquipe');
        if (el) { el.textContent = n; el.style.display = n ? 'inline-block' : 'none'; }
        if (window.PINotif) window.PINotif.definir('equipe', n);
    }
    async function atualizarContador() {
        if (!localStorage.getItem('token')) return;
        try { const { naoLidas } = await chamar('/nao-lidas'); definirContador(naoLidas); } catch (_) { /* silencioso */ }
    }

    function desenharRapidas() {
        const caixa = $('equipeRapidas');
        if (!caixa || caixa.dataset.ok || !meuLado) return;
        caixa.dataset.ok = '1';
        caixa.innerHTML = RAPIDAS[meuLado].map(t => `<button type="button">${esc(t)}</button>`).join('');
        caixa.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            const area = $('equipeTexto');
            area.value = b.textContent; area.focus();
        }));
    }

    const novoUuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

    function ligarFormulario() {
        const form = $('equipeForm');
        if (!form || form.dataset.ligado) return;
        form.dataset.ligado = '1';
        const area = $('equipeTexto'), botao = form.querySelector('button[type=submit]');
        let ultima = { texto: null, uuid: null };
        area.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const texto = area.value.trim();
            if (!texto) return;
            if (ultima.texto !== texto) ultima = { texto, uuid: novoUuid() };
            botao.disabled = true; $('equipeErro').textContent = '';
            try {
                await chamar('', { method: 'POST', body: JSON.stringify({ texto, client_uuid: ultima.uuid }) });
                area.value = ''; ultima = { texto: null, uuid: null };
                await carregar();
            } catch (err) { $('equipeErro').textContent = err.message; }
            finally { botao.disabled = false; area.focus(); }
        });
    }

    function abrir() {
        ligarFormulario();
        if (window.PINotif) window.PINotif.pedirPermissao();
        carregar();
        clearInterval(timer);
        let tique = 0;
        timer = setInterval(() => { if (!document.hidden && (!tempoRealOk() || ++tique % 8 === 0)) carregar(); }, 8000);
    }

    function aoChegar(dados) {
        const m = dados && dados.mensagem;
        if (!m) return;
        const minha = meuId ? m.remetente_id === meuId : false;
        if (telaAberta()) { carregar(); return; }
        if (!minha && m.lado !== meuLado) {
            const titulo = `${nomeLado(m.lado)}: ${m.remetente}`;
            if (window.PINotif) window.PINotif.avisar({
                titulo, texto: m.texto, tag: 'pi-equipe',
                aoClicar: () => { if (typeof window.mostrarTela === 'function') window.mostrarTela(TELA); }
            });
        }
        atualizarContador();
    }

    window.PIEquipe = {
        aoMudarTela(id) { if (id === TELA) abrir(); else clearInterval(timer); },
        atualizarContador
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (!$(TELA)) return;
        // Descobre o próprio lado sem marcar nada como lido (o contador usa o mesmo papel do token).
        try {
            const u = JSON.parse(localStorage.getItem('usuario') || '{}');
            const papel = String(u.tipo_usuario || '').toUpperCase();
            meuLado = papel === 'PORTARIA' || papel === 'PORTEIRO' ? 'PORTARIA' : 'SECRETARIA';
            meuId = Number(u.id_usuario) || null;
        } catch (_) { /* sem dados locais */ }
        if (window.PINotif) {
            window.PINotif.fonte('equipe', {
                rotulo: meuLado === 'PORTARIA' ? 'Chat com a secretaria' : 'Chat com a portaria',
                icone: 'fa-headset', tela: TELA, pagina: meuLado === 'PORTARIA' ? 'portaria.html' : 'secretaria.html'
            });
        }
        atualizarContador();
        if (window.PITempoReal) {
            PITempoReal.on('equipe:mensagem', aoChegar);
            PITempoReal.on('equipe:lida', d => { if (telaAberta() && d && d.lado !== meuLado) carregar(); });
            PITempoReal.on('reconectado', () => { atualizarContador(); if (telaAberta()) carregar(); });
        }
        let tique = 0;
        setInterval(() => { if (!document.hidden && (!tempoRealOk() || ++tique % 6 === 0)) atualizarContador(); }, 20000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && telaAberta()) carregar(); });
    });
})();
