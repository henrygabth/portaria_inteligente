// pwa.js — registra o service worker e oferece "Instalar aplicativo".
(function () {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
    const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const dispensado = () => { try { return localStorage.getItem('pi-instalar-dispensado') === '1'; } catch (_) { return false; } };
    let pedido = null;

    function aviso(texto, comBotao) {
        if (instalado() || dispensado() || document.querySelector('.pi-instalar')) return;
        const el = document.createElement('div');
        el.className = 'pi-instalar'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Instalar aplicativo');
        el.innerHTML = '<img src="/img/icones/icone-192.png" alt="" width="40" height="40"><p>' + texto + '</p>'
            + (comBotao ? '<button type="button" class="pi-instalar-sim">Instalar</button>' : '')
            + '<button type="button" class="pi-instalar-nao" aria-label="Agora não">&times;</button>';
        document.body.appendChild(el);
        el.addEventListener('click', async e => {
            if (e.target.closest('.pi-instalar-sim') && pedido) {
                pedido.prompt(); await pedido.userChoice.catch(() => null); pedido = null; el.remove();
            } else if (e.target.closest('.pi-instalar-nao')) {
                try { localStorage.setItem('pi-instalar-dispensado', '1'); } catch (_) {}
                el.remove();
            }
        });
    }
    // Samsung Internet gera o app de um jeito antigo, e o Google Play Protect bloqueia
    // ("App de risco bloqueado... versão mais antiga do Android"). Pelo Chrome o app é gerado
    // pelo próprio Google e instala sem aviso: então, no navegador da Samsung, indicamos o Chrome.
    const samsung = /SamsungBrowser/i.test(navigator.userAgent);
    function abrirNoChrome() {
        const url = new URL(location.href);
        location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.android.chrome')};end`;
    }
    if (samsung && !instalado()) {
        window.addEventListener('load', () => setTimeout(() => {
            aviso('<strong>Instale pelo Chrome</strong>Por este navegador o Android mostra um alerta indevido.', true);
            const botao = document.querySelector('.pi-instalar-sim');
            if (botao) { botao.textContent = 'Abrir no Chrome'; botao.addEventListener('click', e => { e.stopPropagation(); abrirNoChrome(); }); }
        }, 2500));
    }
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault(); pedido = e;
        if (samsung) return; // já mostramos o aviso para abrir no Chrome
        aviso('<strong>Portaria Inteligente no celular</strong>Instale como aplicativo e abra direto da tela inicial.', true);
    });
    window.addEventListener('appinstalled', () => { const el = document.querySelector('.pi-instalar'); if (el) el.remove(); });
    // iPhone/iPad não têm o botão automático: explica como instalar pelo Safari.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    if (ios && !instalado()) window.addEventListener('load', () => setTimeout(() =>
        aviso('<strong>Instale no iPhone</strong>Toque em Compartilhar e depois em “Adicionar à Tela de Início”.', false), 2500));
})();
