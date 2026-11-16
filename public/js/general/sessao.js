// sessao.js — comportamentos de sessão comuns a todos os painéis:
//  1) No PRIMEIRO acesso, leva o usuário à troca obrigatória de senha.
//  2) Se a secretaria desativar o perfil durante uma sessão aberta, desloga na hora.
(function () {
    // ---------- 2) perfil desativado: qualquer resposta 403 { perfilDesativado } ----------
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async function (...args) {
        const resposta = await fetchOriginal(...args);
        // Senha trocada em outro aparelho (ou sessão invalidada): volta para o login.
        if (resposta.status === 401 && localStorage.getItem('token')) {
            try {
                const corpo = await resposta.clone().json();
                if (corpo && corpo.sessaoExpirada) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('usuario');
                    alert(corpo.erro || 'Sua sessão expirou. Faça login novamente.');
                    window.location.href = 'login.html';
                }
            } catch (_) { /* resposta sem JSON: ignora */ }
        }
        if (resposta.status === 403) {
            try {
                const corpo = await resposta.clone().json();
                if (corpo && corpo.trocarSenha) { irParaTrocaSenha(); return resposta; }
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

    // ---------- 1) primeiro acesso: troca de senha obrigatória ----------
    // O servidor recusa qualquer ação com 403 { trocarSenha } até a senha nova ser definida.
    function irParaTrocaSenha() {
        if (/trocar-senha\.html$/.test(window.location.pathname)) return;
        const atual = window.location.pathname.split('/').pop() || 'home.html';
        window.location.href = `trocar-senha.html?depois=${encodeURIComponent(atual)}`;
    }
    window.PISessao = Object.assign(window.PISessao || {}, { irParaTrocaSenha });
    try { localStorage.removeItem('sugerirTrocaSenha'); } catch (_) { /* sem storage */ }
})();
