// push-cliente.js — liga/desliga os avisos no celular (Web Push) neste aparelho.
// Funciona com o sistema FECHADO. No iPhone, só depois de instalar o app na tela de início.
(function () {
    const token = () => { try { return localStorage.getItem('token'); } catch (_) { return null; } };
    const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window &&
        (location.protocol === 'https:' || location.hostname === 'localhost');
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    async function api(rota, corpo) {
        const r = await fetch('/api/push/' + rota, {
            method: corpo ? 'POST' : 'GET',
            headers: { Authorization: `Bearer ${token()}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
            body: corpo ? JSON.stringify(corpo) : undefined
        });
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro || 'Falha na comunicação com o servidor.');
        return dados;
    }
    const chaveBytes = b64 => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
    async function registro() {
        const reg = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.register('/sw.js');
        return navigator.serviceWorker.ready.then(() => reg);
    }

    // 'indisponivel' | 'instalar-ios' | 'negado' | 'ativo' | 'inativo'
    async function estado() {
        if (ios && !instalado()) return 'instalar-ios';
        if (!suportado()) return 'indisponivel';
        if (Notification.permission === 'denied') return 'negado';
        try { const reg = await navigator.serviceWorker.getRegistration('/'); return reg && await reg.pushManager.getSubscription() ? 'ativo' : 'inativo'; }
        catch (_) { return 'inativo'; }
    }

    async function ativar() {
        if (!suportado()) throw new Error(ios && !instalado() ? 'No iPhone, instale o app na tela de início primeiro (Compartilhar → Adicionar à Tela de Início).' : 'Este navegador não recebe notificações.');
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') throw new Error('Você não permitiu as notificações. Dá para liberar nas configurações do navegador.');
        const reg = await registro();
        const { chave } = await api('chave');
        let inscricao = await reg.pushManager.getSubscription();
        // Chave do servidor mudou (ex.: configurada no .env depois): refaz a inscrição.
        if (inscricao && inscricao.options && inscricao.options.applicationServerKey) {
            const atual = btoa(String.fromCharCode(...new Uint8Array(inscricao.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            if (atual !== chave.replace(/=+$/, '')) { await inscricao.unsubscribe(); inscricao = null; }
        }
        if (!inscricao) inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) });
        const aparelho = (navigator.userAgentData && navigator.userAgentData.platform) || (navigator.platform || '').slice(0, 40);
        return api('inscrever', { inscricao: inscricao.toJSON(), aparelho: `${aparelho}${instalado() ? ' (app)' : ''}` });
    }

    async function desativar() {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const inscricao = reg && await reg.pushManager.getSubscription();
        if (!inscricao) return { mensagem: 'As notificações já estavam desligadas.' };
        await api('cancelar', { endpoint: inscricao.endpoint }).catch(() => {});
        await inscricao.unsubscribe();
        return { mensagem: 'Notificações desligadas neste aparelho.' };
    }

    // Mantém o servidor com a inscrição atual (o navegador pode trocá-la sozinho de tempos em tempos).
    async function sincronizar() {
        if (!token() || (await estado()) !== 'ativo') return;
        try { await ativar(); } catch (_) { /* tenta de novo na próxima visita */ }
    }

    // Convite discreto, uma vez, para o responsável na tela inicial.
    async function convidar() {
        const usuario = (() => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch (_) { return {}; } })();
        if (!/home\.html$|\/$/.test(location.pathname) || !['PAI', 'RESPONSAVEL'].includes(String(usuario.tipo_usuario || '').toUpperCase())) return;
        try { if (localStorage.getItem('pi-push-convite') === '1') return; } catch (_) { return; }
        const st = await estado();
        if (st !== 'inativo') return;
        const el = document.createElement('div');
        el.className = 'pi-instalar pi-push-convite'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Ativar avisos no celular');
        el.innerHTML = '<span class="pi-push-icone" aria-hidden="true"><i class="fas fa-bell"></i></span><p><strong>Quer ser avisado no celular?</strong>Saiba na hora quando a saída for aprovada e quando seu filho sair ou voltar.</p>'
            + '<button type="button" class="pi-instalar-sim">Ativar</button><button type="button" class="pi-instalar-nao" aria-label="Agora não">&times;</button>';
        document.body.appendChild(el);
        el.addEventListener('click', async e => {
            if (e.target.closest('.pi-instalar-nao')) { try { localStorage.setItem('pi-push-convite', '1'); } catch (_) {} el.remove(); return; }
            if (!e.target.closest('.pi-instalar-sim')) return;
            try { await ativar(); el.querySelector('p').innerHTML = '<strong>Pronto!</strong>Você vai receber os avisos neste aparelho.'; }
            catch (err) { el.querySelector('p').innerHTML = '<strong>Não deu certo</strong>' + String(err.message).replace(/</g, '&lt;'); }
            try { localStorage.setItem('pi-push-convite', '1'); } catch (_) {}
            el.querySelector('.pi-instalar-sim').remove();
            setTimeout(() => el.remove(), 6000);
        });
    }

    window.PIPush = { estado, ativar, desativar, testar: () => api('testar', {}), suportado };
    window.addEventListener('load', () => { if (!token()) return; sincronizar(); setTimeout(convidar, 1500); });
})();
