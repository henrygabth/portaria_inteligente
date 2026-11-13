// foto-aluno.js — foto 3x4 do aluno (vínculo, solicitação, secretaria e portaria).
// - PIFoto.html(id, {tamanho:'p'|'m'|'g'}) devolve o quadro da foto; a imagem é buscada sozinha quando
//   o quadro aparece na tela (a foto exige login, por isso não é um <img src> simples).
// - Clicar na foto abre ampliada (o porteiro confere o rosto do aluno).
// - PIFoto.preparar(arquivo) recorta no formato 3x4 e comprime em JPEG antes de enviar.
(function () {
    const TOKEN = () => localStorage.getItem('token');
    const cache = new Map();      // id -> Promise<url|null>
    const versao = new Map();     // id -> carimbo para furar o cache do navegador após trocar a foto
    const LARGURA = 300, ALTURA = 400;

    const escAttr = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    async function buscar(id) {
        const v = versao.get(id);
        const resp = await fetch(`/api/alunos/${id}/foto${v ? `?v=${v}` : ''}`, { headers: { 'Authorization': `Bearer ${TOKEN()}` } });
        if (!resp.ok) return null;
        return URL.createObjectURL(await resp.blob());
    }
    function carregar(id) {
        if (!cache.has(id)) cache.set(id, buscar(id).catch(() => null));
        return cache.get(id);
    }

    function quadro(id, tamanho, nome) {
        const base = `foto-aluno foto-${tamanho || 'm'}`;
        if (!id) return `<span class="${base}" aria-label="Aluno sem foto"><i class="fas fa-user"></i></span>`;
        return `<span class="${base}" data-foto-aluno="${Number(id)}" data-nome="${escAttr(nome || '')}" aria-label="Foto do aluno"><i class="fas fa-user"></i></span>`;
    }

    async function hidratar(el) {
        if (el.dataset.fotoCarregada) return;
        el.dataset.fotoCarregada = '1';
        const url = await carregar(Number(el.dataset.fotoAluno));
        if (!url) { el.classList.add('sem-foto'); el.title = 'Aluno sem foto cadastrada'; return; }
        el.classList.remove('sem-foto');
        el.innerHTML = `<img src="${url}" alt="Foto 3x4 do aluno ${escAttr(el.dataset.nome)}" loading="lazy">`;
        el.classList.add('com-foto');
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.title = 'Clique para ampliar';
    }

    // Só carrega quando o quadro fica visível (telas escondidas e listas longas não disparam pedidos).
    const observador = ('IntersectionObserver' in window)
        ? new IntersectionObserver(itens => itens.forEach(i => { if (i.isIntersecting) { observador.unobserve(i.target); hidratar(i.target); } }), { rootMargin: '120px' })
        : null;
    function observar(el) { if (observador) observador.observe(el); else hidratar(el); }

    function varrer(raiz) {
        if (raiz.nodeType !== 1) return;
        if (raiz.matches && raiz.matches('[data-foto-aluno]')) observar(raiz);
        raiz.querySelectorAll && raiz.querySelectorAll('[data-foto-aluno]:not([data-foto-carregada])').forEach(observar);
    }
    new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(varrer))).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => varrer(document.body));

    // ----- ampliar
    function ampliar(el) {
        const img = el.querySelector('img');
        if (!img) return;
        const fundo = document.createElement('div');
        fundo.className = 'foto-lightbox';
        fundo.innerHTML = `<figure><img src="${img.src}" alt="${escAttr(img.alt)}"><figcaption>${escAttr(el.dataset.nome)}</figcaption></figure>`;
        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', aoTecla); };
        const aoTecla = e => { if (e.key === 'Escape') fechar(); };
        fundo.addEventListener('click', fechar);
        document.addEventListener('keydown', aoTecla);
        document.body.appendChild(fundo);
    }
    document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('.foto-aluno.com-foto'); if (el) ampliar(el); });
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('com-foto')) { e.preventDefault(); ampliar(e.target); } });

    // ----- preparar (recorte 3x4 + compressão) e enviar
    function carregarImagem(arquivo) {
        return new Promise((ok, erro) => {
            const url = URL.createObjectURL(arquivo);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); ok(img); };
            img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não foi possível ler esta imagem. Use uma foto JPG, PNG ou WEBP.')); };
            img.src = url;
        });
    }
    async function preparar(arquivo) {
        if (!arquivo || !/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error('Escolha uma imagem JPG, PNG ou WEBP.');
        if (arquivo.size > 15 * 1024 * 1024) throw new Error('A imagem é muito grande (máximo 15 MB).');
        const img = await carregarImagem(arquivo);
        const alvo = ALTURA / LARGURA;                       // proporção 3:4 (altura/largura)
        let sw = img.naturalWidth, sh = img.naturalHeight;
        if (sh / sw > alvo) sh = sw * alvo; else sw = sh / alvo;   // recorte centralizado
        const sx = (img.naturalWidth - sw) / 2, sy = Math.max(0, (img.naturalHeight - sh) / 4); // um pouco mais para cima: rosto
        const canvas = document.createElement('canvas');
        canvas.width = LARGURA; canvas.height = ALTURA;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, LARGURA, ALTURA);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, LARGURA, ALTURA);
        for (const qualidade of [0.88, 0.8, 0.7, 0.6]) {
            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', qualidade));
            if (blob && blob.size <= 350 * 1024) return blob;
        }
        throw new Error('Não foi possível reduzir a foto. Tente outra imagem.');
    }
    async function enviar(id, blob) {
        const resp = await fetch(`/api/alunos/${id}/foto`, { method: 'PUT', headers: { 'Authorization': `Bearer ${TOKEN()}`, 'Content-Type': 'image/jpeg' }, body: blob });
        const dados = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(dados.erro || 'Falha ao enviar a foto.');
        // Atualiza as fotos já exibidas desse aluno nesta página.
        versao.set(Number(id), Date.now()); cache.delete(Number(id));
        document.querySelectorAll(`[data-foto-aluno="${Number(id)}"]`).forEach(el => { delete el.dataset.fotoCarregada; el.classList.remove('com-foto'); hidratar(el); });
        return dados;
    }

    // Liga um <input type="file"> a um quadro de pré-visualização; a foto pronta fica em input._fotoPronta.
    function ligarCampo(input, previa) {
        input.addEventListener('change', async () => {
            input._fotoPronta = null;
            const arquivo = input.files && input.files[0];
            if (!arquivo) { previa.innerHTML = '<i class="fas fa-user"></i>'; previa.classList.remove('com-foto'); return; }
            try {
                const blob = await preparar(arquivo);
                input._fotoPronta = blob;
                previa.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Pré-visualização da foto 3x4">`;
                previa.classList.add('com-foto');
            } catch (err) {
                input.value = ''; alert(err.message);
                previa.innerHTML = '<i class="fas fa-user"></i>'; previa.classList.remove('com-foto');
            }
        });
    }

    window.PIFoto = { html: (id, opc = {}) => quadro(id, opc.tamanho, opc.nome), preparar, enviar, ligarCampo, carregar };
})();
