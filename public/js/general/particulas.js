// particulas.js — fundo animado de pontinhos (particles.js) compartilhado por TODAS as telas.
// Basta incluir este script: ele cria o #particles-js se a página não tiver, carrega a
// biblioteca se ela ainda não estiver na página, acompanha o tema claro/escuro e
// expõe window.iniciarParticulas(tema) para as telas que já chamam essa função.
//
// Páginas com fundo em degradê azul (login, cadastro, recuperar senha, conta) usam
// <body data-fundo="gradiente"> e recebem pontinhos claros.
(function () {
    const URL_LIB = 'https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js';
    let temaIniciado = null;
    let carregandoLib = null;

    // Aplica o tema salvo o quanto antes (evita piscar claro -> escuro ao abrir a tela).
    try {
        if (localStorage.getItem('theme') === 'dark' && !document.documentElement.getAttribute('data-theme')) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    } catch (_) { /* sem storage: segue no tema claro */ }

    function ehGradiente() {
        return !!(document.body && document.body.dataset.fundo === 'gradiente');
    }

    function temaAtual() {
        if (ehGradiente()) return 'gradiente';
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function garantirContainer() {
        let el = document.getElementById('particles-js');
        if (!el) {
            el = document.createElement('div');
            el.id = 'particles-js';
            document.body.insertBefore(el, document.body.firstChild);
        }
        return el;
    }

    function carregarBiblioteca() {
        if (window.particlesJS) return Promise.resolve();
        if (!carregandoLib) {
            carregandoLib = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = URL_LIB;
                s.onload = resolve;
                s.onerror = () => { carregandoLib = null; reject(new Error('Não foi possível carregar o particles.js')); };
                document.head.appendChild(s);
            });
        }
        return carregandoLib;
    }

    function destruirAnterior() {
        if (window.pJSDom && window.pJSDom.length > 0) {
            window.pJSDom.forEach(dom => { try { dom.pJS.fn.vendors.destroypJS(); } catch (_) { /* já destruído */ } });
            window.pJSDom = [];
        }
    }

    async function iniciarParticulas(tema) {
        if (!document.body) return;
        const modo = tema === 'dark' || tema === 'light' || tema === 'gradiente' ? tema : temaAtual();
        const container = garantirContainer();
        // Mesmo tema e animação já rodando: não reinicia à toa.
        if (modo === temaIniciado && container.querySelector('canvas')) return;
        try {
            await carregarBiblioteca();
        } catch (erro) {
            console.warn('[particulas]', erro.message);
            return;
        }
        destruirAnterior();
        temaIniciado = modo;

        const corPonto = modo === 'gradiente' ? '#ffffff' : '#0052cc';
        const corLinha = modo === 'light' ? '#0A192F' : '#FFFFFF';
        const celular = window.innerWidth <= 768;

        window.particlesJS('particles-js', {
            particles: {
                number: { value: celular ? 70 : 150, density: { enable: true, value_area: 800 } },
                color: { value: corPonto },
                shape: { type: 'circle' },
                opacity: { value: modo === 'gradiente' ? 0.45 : 0.5 },
                size: { value: 3, random: true },
                line_linked: { enable: true, distance: 150, color: corLinha, opacity: modo === 'gradiente' ? 0.25 : 0.2, width: 1 },
                move: { enable: true, speed: 2 }
            },
            retina_detect: true
        });
    }

    window.iniciarParticulas = iniciarParticulas;

    function iniciar() {
        garantirContainer();
        iniciarParticulas();
        // Trocou o tema (por qualquer tela ou botão): refaz as cores dos pontinhos.
        new MutationObserver(() => {
            if (temaAtual() !== temaIniciado) iniciarParticulas();
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
