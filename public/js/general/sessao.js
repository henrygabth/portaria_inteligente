// sessao.js — comportamentos de sessão comuns a todos os painéis:
//  1) Sugere trocar a senha logo após o PRIMEIRO login do usuário.
//  2) Se a secretaria desativar o perfil durante uma sessão aberta, desloga na hora.
(function () {
    // ---------- 2) perfil desativado: qualquer resposta 403 { perfilDesativado } ----------
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async function (...args) {
        const resposta = await fetchOriginal(...args);
        if (resposta.status === 403) {
            try {
                const corpo = await resposta.clone().json();
                if (corpo && corpo.perfilDesativado) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('usuario');
                    alert(corpo.erro || 'Este perfil foi desativado.');
                    window.location.href = 'login.html';
                }
            } catch (_) { /* resposta sem JSON: ignora */ }
        }
        return resposta;
    };

    // ---------- 1) sugestão de troca de senha no primeiro login ----------
    function mostrarSugestaoTrocaSenha() {
        let pendente = false;
        try { pendente = localStorage.getItem('sugerirTrocaSenha') === '1'; } catch (_) { /* sem storage */ }
        if (!pendente || !localStorage.getItem('token')) return;
        // Na própria tela "Minha Conta" não faz sentido sugerir ir para ela.
        if (/conta\.html$/.test(window.location.pathname)) return;

        const estilo = document.createElement('style');
        estilo.textContent = `
            .aviso-senha-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 3000;
                display: flex; align-items: center; justify-content: center; padding: 20px; }
            .aviso-senha-box { background: var(--card-bg, #fff); color: var(--text-color, #333); width: 100%; max-width: 440px;
                border-radius: 12px; padding: 28px 26px; box-shadow: 0 12px 40px rgba(0,0,0,.3); text-align: center; }
            .aviso-senha-box .aviso-senha-icone { font-size: 40px; color: #0052cc; margin-bottom: 10px; }
            .aviso-senha-box h2 { margin: 0 0 10px; font-size: 21px; color: var(--dark-blue, #0A192F); }
            .aviso-senha-box p { margin: 0 0 22px; line-height: 1.5; font-size: 15px; }
            .aviso-senha-acoes { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
            .aviso-senha-acoes button { width: auto; padding: 11px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
            .aviso-senha-ok { background: #0052cc; color: #fff; border: 2px solid #0052cc; }
            .aviso-senha-ok:hover { background: #003d99; border-color: #003d99; }
            .aviso-senha-depois { background: transparent; color: var(--text-color, #333); border: 2px solid var(--border-color, #ccc); }
            .aviso-senha-depois:hover { background: rgba(128,128,128,.12); }
        `;
        document.head.appendChild(estilo);

        const overlay = document.createElement('div');
        overlay.className = 'aviso-senha-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `
            <div class="aviso-senha-box">
                <div class="aviso-senha-icone"><i class="fas fa-key"></i></div>
                <h2>Que tal trocar a sua senha?</h2>
                <p>Este é o seu primeiro acesso. Por segurança, recomendamos trocar a senha inicial por uma só sua, que só você conheça.</p>
                <div class="aviso-senha-acoes">
                    <button type="button" class="aviso-senha-ok">Trocar senha agora</button>
                    <button type="button" class="aviso-senha-depois">Agora não</button>
                </div>
            </div>`;

        function fechar() {
            try { localStorage.removeItem('sugerirTrocaSenha'); } catch (_) { /* ignora */ }
            overlay.remove();
            estilo.remove();
        }

        overlay.querySelector('.aviso-senha-ok').addEventListener('click', () => {
            fechar();
            window.location.href = 'conta.html';
        });
        overlay.querySelector('.aviso-senha-depois').addEventListener('click', fechar);
        document.body.appendChild(overlay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mostrarSugestaoTrocaSenha);
    } else {
        mostrarSugestaoTrocaSenha();
    }
})();
