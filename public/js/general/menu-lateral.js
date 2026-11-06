// menu-lateral.js — menu lateral FIXO em todas as telas.
// Fica aberto o tempo todo (no computador) e só recolhe quando a pessoa clica no X da barra.
// A escolha fica salva e vale para todas as telas. No celular o menu começa recolhido
// (senão cobriria o conteúdo) e abre/fecha no mesmo botão.
// Este arquivo vai no <head>: a classe é aplicada antes da página aparecer (sem "piscar").
(function () {
    const celular = () => window.innerWidth <= 768;
    const chave = () => (celular() ? 'pi_menu_celular' : 'pi_menu_desktop');
    const raiz = document.documentElement;

    function recolhidoSalvo() {
        try {
            const v = localStorage.getItem(chave());
            if (v === 'recolhido') return true;
            if (v === 'aberto') return false;
        } catch (_) { /* sem storage */ }
        return celular();
    }
    function aplicar(recolhido) { raiz.classList.toggle('menu-recolhido', recolhido); }
    aplicar(recolhidoSalvo());

    // Telas com várias "abas" fecham o menu no celular ao escolher uma opção.
    window.fecharMenuNoCelular = function () {
        if (!celular()) return;
        aplicar(true);
        try { localStorage.setItem(chave(), 'recolhido'); } catch (_) { /* ignora */ }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const botao = document.getElementById('menuToggle');
        if (botao) {
            botao.setAttribute('role', 'button');
            botao.setAttribute('tabindex', '0');
            botao.setAttribute('aria-label', 'Recolher ou abrir o menu');
            const alternar = () => {
                const recolher = !raiz.classList.contains('menu-recolhido');
                aplicar(recolher);
                try { localStorage.setItem(chave(), recolher ? 'recolhido' : 'aberto'); } catch (_) { /* ignora */ }
            };
            botao.addEventListener('click', alternar);
            botao.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
        }
        // Garante o estado certo se a janela mudar de tamanho (ex.: girar o celular).
        let ultimo = celular();
        window.addEventListener('resize', () => { if (celular() !== ultimo) { ultimo = celular(); aplicar(recolhidoSalvo()); } });
    });
})();
