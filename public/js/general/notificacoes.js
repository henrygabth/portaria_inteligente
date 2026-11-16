// notificacoes.js — central de notificações dos painéis (responsável, secretaria e portaria).
//  - Sino na barra do topo com o total de mensagens não lidas e um menu com cada origem;
//  - aviso na tela (canto inferior), som curto e notificação do navegador quando chega algo;
//  - o título da aba ganha "(N)" enquanto houver mensagens não lidas.
// Uso pelos módulos de chat:
//   PINotif.fonte('chat', { rotulo: 'Mensagens', icone: 'fa-comments', tela: 'tela-mensagens' });
//   PINotif.definir('chat', 3);
//   PINotif.avisar({ titulo, texto, tag, aoClicar });
(function () {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fontes = {};          // nome -> { rotulo, icone, tela, total }
    const tituloOriginal = document.title;
    const CHAVE_SOM = 'pi-notif-som';
    let somLigado = (() => { try { return localStorage.getItem(CHAVE_SOM) !== '0'; } catch (_) { return true; } })();
    let audio = null;
    let sino = null, contador = null, menu = null;

    // ------------------------------------------------------------ som (sem arquivo: gerado na hora)
    function contextoAudio() {
        if (!audio) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            try { audio = new Ctx(); } catch (_) { return null; }
        }
        return audio;
    }
    // Navegadores só liberam som depois de um clique/tecla na página: destrava no primeiro gesto.
    ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => {
        const ctx = contextoAudio();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }, { once: true, passive: true }));

    function tocar() {
        if (!somLigado) return;
        const ctx = contextoAudio();
        if (!ctx || ctx.state !== 'running') return;
        const agora = ctx.currentTime;
        [[880, 0], [1320, 0.13]].forEach(([freq, atraso]) => {
            const osc = ctx.createOscillator(), vol = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            vol.gain.setValueAtTime(0.0001, agora + atraso);
            vol.gain.exponentialRampToValueAtTime(0.18, agora + atraso + 0.02);
            vol.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.22);
            osc.connect(vol).connect(ctx.destination);
            osc.start(agora + atraso); osc.stop(agora + atraso + 0.25);
        });
    }

    // ------------------------------------------------------------ sino na barra do topo
    function montarSino() {
        const nav = document.querySelector('.navbar');
        if (!nav || sino) return;
        const caixa = document.createElement('div');
        caixa.className = 'pi-sino-caixa';
        caixa.innerHTML = `
            <button type="button" class="pi-sino" aria-haspopup="true" aria-expanded="false" title="Notificações">
                <i class="fas fa-bell"></i><span class="pi-sino-contador" hidden>0</span>
            </button>
            <div class="pi-sino-menu" role="menu" hidden>
                <div class="pi-sino-topo"><strong>Notificações</strong>
                    <button type="button" class="pi-sino-som" title="Ligar/desligar o som"></button></div>
                <div class="pi-sino-lista"></div>
                <button type="button" class="pi-sino-permitir" hidden><i class="fas fa-desktop"></i> Avisar também fora do sistema</button>
            </div>`;
        const tema = document.getElementById('themeToggle');
        if (tema) nav.insertBefore(caixa, tema); else nav.appendChild(caixa);
        sino = caixa.querySelector('.pi-sino');
        contador = caixa.querySelector('.pi-sino-contador');
        menu = caixa.querySelector('.pi-sino-menu');

        sino.addEventListener('click', e => { e.stopPropagation(); alternarMenu(); });
        document.addEventListener('click', e => { if (!caixa.contains(e.target)) fecharMenu(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenu(); });
        caixa.querySelector('.pi-sino-som').addEventListener('click', () => {
            somLigado = !somLigado;
            try { localStorage.setItem(CHAVE_SOM, somLigado ? '1' : '0'); } catch (_) { /* sem storage */ }
            desenharMenu();
            if (somLigado) tocar();
        });
        caixa.querySelector('.pi-sino-permitir').addEventListener('click', () => {
            fecharMenu();
            if (!window.PIPush) return pedirPermissao();
            PIPush.ativar()
                .then(r => avisoNaTela('Avisos no celular', r.mensagem || 'Ativados neste aparelho.'))
                .catch(err => avisoNaTela('Avisos no celular', err.message));
        });
        desenhar();
    }
    function alternarMenu() { if (menu.hidden) { desenharMenu(); menu.hidden = false; sino.setAttribute('aria-expanded', 'true'); } else fecharMenu(); }
    function fecharMenu() { if (menu && !menu.hidden) { menu.hidden = true; sino.setAttribute('aria-expanded', 'false'); } }

    function irPara(f) {
        fecharMenu();
        if (typeof window.mostrarTela === 'function' && document.getElementById(f.tela)) window.mostrarTela(f.tela);
        else if (f.pagina) window.location.href = `${f.pagina}?tela=${f.tela}`;
    }

    function desenharMenu() {
        if (!menu) return;
        const lista = menu.querySelector('.pi-sino-lista');
        const itens = Object.entries(fontes);
        lista.innerHTML = itens.length ? itens.map(([nome, f]) => `
            <button type="button" class="pi-sino-item ${f.total ? 'tem' : ''}" data-fonte="${esc(nome)}" role="menuitem">
                <i class="fas ${esc(f.icone)}"></i>
                <span><strong>${esc(f.rotulo)}</strong><small>${f.total ? `${f.total} ${f.total === 1 ? 'mensagem não lida' : 'mensagens não lidas'}` : 'Nada novo'}</small></span>
                ${f.total ? `<em>${f.total > 99 ? '99+' : f.total}</em>` : ''}
            </button>`).join('') : '<p class="pi-sino-vazio">Nada por aqui.</p>';
        lista.querySelectorAll('.pi-sino-item').forEach(b => b.addEventListener('click', () => irPara(fontes[b.dataset.fonte])));
        menu.querySelector('.pi-sino-som').innerHTML = somLigado ? '<i class="fas fa-volume-high"></i> Som ligado' : '<i class="fas fa-volume-xmark"></i> Som desligado';
        const permitir = menu.querySelector('.pi-sino-permitir');
        if (window.PIPush) {
            // Avisos no celular (chegam mesmo com o sistema fechado).
            PIPush.estado().then(st => {
                permitir.hidden = !['inativo', 'instalar-ios'].includes(st);
                permitir.innerHTML = '<i class="fas fa-mobile-screen"></i> Receber avisos no celular';
            });
        } else permitir.hidden = !('Notification' in window) || Notification.permission !== 'default';
    }

    function total() { return Object.values(fontes).reduce((s, f) => s + (f.total || 0), 0); }
    function desenhar() {
        const n = total();
        document.title = n ? `(${n > 99 ? '99+' : n}) ${tituloOriginal}` : tituloOriginal;
        if (contador) {
            contador.hidden = !n;
            contador.textContent = n > 99 ? '99+' : n;
            sino.classList.toggle('tem', !!n);
            sino.title = n ? `${n} ${n === 1 ? 'mensagem não lida' : 'mensagens não lidas'}` : 'Notificações';
        }
        if (menu && !menu.hidden) desenharMenu();
    }

    // ------------------------------------------------------------ avisos
    function pedirPermissao() {
        if ('Notification' in window && Notification.permission === 'default') {
            try { Notification.requestPermission().then(desenharMenu).catch(() => {}); } catch (_) { /* navegador antigo */ }
        }
    }
    function avisoNaTela(titulo, texto, aoClicar) {
        let pilha = document.querySelector('.pi-toasts');
        if (!pilha) { pilha = document.createElement('div'); pilha.className = 'pi-toasts'; document.body.appendChild(pilha); }
        while (pilha.children.length >= 3) pilha.firstChild.remove();
        const aviso = document.createElement('div');
        aviso.className = 'chat-toast';
        aviso.setAttribute('role', 'alert');
        const curto = String(texto || '');
        aviso.innerHTML = `<button type="button" class="pi-toast-fechar" aria-label="Fechar">&times;</button>
            <strong><i class="fas fa-comment-dots"></i> ${esc(titulo)}</strong><span>${esc(curto.length > 110 ? curto.slice(0, 110) + '…' : curto)}</span>`;
        aviso.addEventListener('click', e => {
            aviso.remove();
            if (!e.target.closest('.pi-toast-fechar') && aoClicar) aoClicar();
        });
        pilha.appendChild(aviso);
        setTimeout(() => aviso.remove(), 10000);
    }
    function avisoNavegador(titulo, texto, tag, aoClicar) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try {
            const n = new Notification(titulo, { body: texto, tag, icon: './img/logo_pi.png', renotify: true });
            n.onclick = () => { window.focus(); n.close(); if (aoClicar) aoClicar(); };
        } catch (_) { /* celular: só funciona com service worker; o aviso na tela já cobre */ }
    }

    // Avisa sobre algo novo. Na tela: aviso + som. Fora da aba (minimizada, outra aba): notificação
    // do sistema operacional também.
    function avisar({ titulo, texto, tag, aoClicar }) {
        avisoNaTela(titulo, texto, aoClicar);
        tocar();
        if (document.hidden) avisoNavegador(titulo, texto, tag, aoClicar);
        if (sino) { sino.classList.remove('balancar'); void sino.offsetWidth; sino.classList.add('balancar'); }
    }

    // Atraso no retorno (secretaria e portaria): aviso imediato, mesmo sem estar na tela de atrasos.
    function ouvirAtrasos() {
        if (!window.PITempoReal || ouvirAtrasos.feito) return;
        ouvirAtrasos.feito = true;
        PITempoReal.on('alerta:atraso', d => avisar({ titulo: d.titulo || 'Atraso no retorno', texto: d.texto || '', tag: `atraso-${d.pedido_id}`,
            aoClicar: () => { const t = ['tela-retorno', 'tela-painel'].find(id => document.getElementById(id)); if (t && typeof window.mostrarTela === 'function') window.mostrarTela(t); } }));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ouvirAtrasos); else setTimeout(ouvirAtrasos, 0);

    window.PINotif = {
        fonte(nome, dados) { fontes[nome] = { total: 0, ...(fontes[nome] || {}), ...dados }; desenhar(); },
        definir(nome, n) { if (!fontes[nome]) return; fontes[nome].total = Math.max(0, Number(n) || 0); desenhar(); },
        avisar,
        pedirPermissao,
        total
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarSino); else montarSino();
})();
