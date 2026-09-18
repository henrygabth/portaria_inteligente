const API_URL_RESET = 'http://localhost:3000/api';

function pegarTokenDaURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
}

document.addEventListener('DOMContentLoaded', () => {
    const token = pegarTokenDaURL();
    const form = document.getElementById('resetForm');

    if (!token) {
        alert('Link inválido ou expirado. Solicite a recuperação de senha novamente.');
        window.location.href = 'recover_password.html';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const novaSenha = document.getElementById('novaSenha').value;
        const confirmarSenha = document.getElementById('confirmarSenha').value;
        const erroDiferente = document.getElementById('senha-diferente-error');

        if (novaSenha !== confirmarSenha) {
            erroDiferente.style.display = 'block';
            return;
        }
        erroDiferente.style.display = 'none';

        const btn = document.getElementById('reset-button');
        btn.disabled = true;

        try {
            const resp = await fetch(`${API_URL_RESET}/usuarios/redefinir-senha`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, novaSenha })
            });

            const data = await resp.json();

            if (resp.ok) {
                alert('Senha redefinida com sucesso! Faça login com a nova senha.');
                window.location.href = 'login.html';
            } else {
                alert('Erro: ' + (data.erro || 'Não foi possível redefinir a senha.'));
            }
        } catch (err) {
            alert('Erro de conexão com o servidor.');
        } finally {
            btn.disabled = false;
        }
    });
});
