const API_PROF = '/api/professores';
const tokenProfessor = () => localStorage.getItem('token');
const escProf = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const horarioProf = valor => valor ? new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
let turmas = [];
let alunos = [];
let telaAtual = 'tela-painel';
let paginaAtual = 1;

async function consultarProf(caminho, opcoes = {}) {
    const resp = await fetch(`${API_PROF}${caminho}`, {
        ...opcoes,
        headers: { 'Authorization': `Bearer ${tokenProfessor()}`, ...(opcoes.headers || {}) }
    });
    if (!resp.ok) {
        if ([401, 403].includes(resp.status)) throw new Error('Acesso não autorizado. Entre com o perfil de professor.');
        const dados = await resp.json().catch(() => ({}));
        throw new Error(dados.erro || 'Falha ao consultar informações.');
    }
    return resp.json();
}
function mostrarTela(id) {
    telaAtual = id;
    for (const tela of ['tela-painel', 'tela-comunicados']) document.getElementById(tela).style.display = tela === id ? 'block' : 'none';
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('menuToggle')?.classList.remove('active');
    atualizarProfessor();
}
function logout() { localStorage.removeItem('token'); localStorage.removeItem('usuario'); location.href = 'login.html'; }
function popularTurmas() {
    for (const id of ['filtroTurmaPainel', 'filtroTurmaCom']) {
        const select = document.getElementById(id);
        const atual = select.value;
        select.innerHTML = `<option value="">${id === 'filtroTurmaPainel' ? 'Todas as minhas turmas' : 'Todas'}</option>` +
            turmas.map(t => `<option value="${t.id_turma}">${escProf(t.sala_turma)}</option>`).join('');
        if (turmas.some(t => String(t.id_turma) === atual)) select.value = atual;
    }
}
function atualizarFiltroAlunos() {
    const turmaId = document.getElementById('filtroTurmaCom').value;
    const sel = document.getElementById('filtroAlunoCom');
    const antigo = sel.value;
    const filtrados = alunos.filter(a => !turmaId || String(a.id_turma) === turmaId);
    sel.innerHTML = '<option value="">Todos</option>' + filtrados.map(a => `<option value="${a.aluno_id}">${escProf(a.nome)}</option>`).join('');
    if (filtrados.some(a => String(a.aluno_id) === antigo)) sel.value = antigo;
}
const estados = { DENTRO: 'Dentro da escola', SAIU: 'Saiu', ATRASADO: 'Atrasado', NAO_RETORNOU: 'Não voltou' };
const tipos = { APROVADA: 'Saída aprovada', SAIDA: 'Saiu', RETORNO: 'Voltou', ATRASADO: 'Atrasado', NAO_RETORNOU: 'Não voltou' };

async function carregarPainel() {
    const tabela = document.getElementById('tabelaPainel');
    try {
        alunos = await consultarProf('/painel');
        atualizarFiltroAlunos();
        const filtro = document.getElementById('filtroTurmaPainel').value;
        const dados = alunos.filter(a => !filtro || String(a.id_turma) === filtro);
        const contagem = { DENTRO: 0, SAIU: 0, ATRASADO: 0, NAO_RETORNOU: 0 };
        for (const a of dados) contagem[a.situacao] = (contagem[a.situacao] || 0) + 1;
        document.getElementById('resumoProfessor').innerHTML = Object.keys(contagem).map(s =>
            `<div class="resumo-card"><h3>${contagem[s]}</h3><p>${estados[s]}</p></div>`).join('');
        tabela.innerHTML = dados.length ? dados.map(a => `<tr>
           <td>${escProf(a.nome)}</td><td>${escProf(a.turma)}</td>
           <td><span class="prof-tag ${a.situacao.toLowerCase()}">${estados[a.situacao] || 'Dentro'}</span></td>
           <td>${horarioProf(a.hora_saida_real)}</td><td>${horarioProf(a.hora_prevista_retorno)}</td>
           <td>${horarioProf(a.hora_retorno_real)}</td></tr>`).join('') :
           `<tr><td colspan="6">${turmas.length ? 'Nenhum aluno nessa turma.' : 'Você ainda não possui turmas vinculadas. Solicite o vínculo à secretaria.'}</td></tr>`;
    } catch (err) { tabela.innerHTML = `<tr><td colspan="6">${escProf(err.message)}</td></tr>`; }
}
async function carregarComunicados() {
    const tbody = document.getElementById('tabelaComunicados');
    const p = new URLSearchParams();
    for (const [id, chave] of [['filtroTurmaCom','turma_id'],['filtroAlunoCom','aluno_id'],['filtroTipoCom','tipo'],['filtroDataCom','data']]) {
        const v = document.getElementById(id).value;
        if (v) p.set(chave, v);
    }
    p.set('pagina', paginaAtual);
    try {
        const dados = await consultarProf(`/comunicados?${p}`);
        document.getElementById('paginaAnterior').disabled = paginaAtual <= 1;
        document.getElementById('paginaProxima').disabled = !dados.temMais;
        document.getElementById('numeroPagina').textContent = `Página ${paginaAtual}`;
        for (const id of ['contadorPagina','contadorMenu']) document.getElementById(id).textContent = dados.naoLidos;
        tbody.innerHTML = dados.comunicados.length ? dados.comunicados.map(c => `<tr class="${c.lido ? '' : 'comunicado-novo'}">
          <td>${horarioProf(c.data_evento)}</td><td>${escProf(c.aluno || c.mensagem.split(':')[0])}</td>
          <td>${escProf(c.turma)}</td><td><span class="prof-tag ${c.tipo.toLowerCase()}">${tipos[c.tipo]}</span> ${escProf(c.mensagem)}</td>
          <td>${c.lido ? 'Lido' : 'Não lido'}</td><td>${c.lido ? '-' : `<button class="btn-professor" data-lido="${c.comunicado_id}">Marcar lido</button>`}</td>
        </tr>`).join('') : '<tr><td colspan="6">Nenhum comunicado para estes filtros.</td></tr>';
        tbody.querySelectorAll('[data-lido]').forEach(btn => btn.addEventListener('click', () => marcarLido(btn.dataset.lido)));
    } catch (err) { tbody.innerHTML = `<tr><td colspan="6">${escProf(err.message)}</td></tr>`; }
}
async function marcarLido(id) {
    try { await consultarProf(`/comunicados/${id}/lido`, { method: 'PUT' }); await carregarComunicados(); }
    catch (err) { alert(err.message); }
}
function atualizarProfessor() { if (telaAtual === 'tela-painel') carregarPainel(); carregarComunicados(); }

document.addEventListener('DOMContentLoaded', async () => {
    if (!tokenProfessor()) { location.href = 'login.html'; return; }
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (!['PROFESSOR','ADMIN'].includes((usuario.tipo_usuario || '').toUpperCase())) { location.href = 'login.html'; return; }
    if (usuario.tipo_usuario === 'ADMIN') document.getElementById('trocarPainel').style.display = 'block';
    const menu = document.getElementById('menuToggle');
    menu.addEventListener('click', () => { menu.classList.toggle('active'); document.getElementById('sidebar').classList.toggle('open'); });
    document.getElementById('themeToggle').addEventListener('click', () => {
        const tema = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', tema);
    });
    if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme','dark');
    for (const id of ['filtroTurmaPainel','filtroTurmaCom','filtroAlunoCom','filtroTipoCom','filtroDataCom']) {
        document.getElementById(id).addEventListener('change', () => {
            if (id === 'filtroTurmaCom') atualizarFiltroAlunos();
            if (id !== 'filtroTurmaPainel') paginaAtual = 1;
            atualizarProfessor();
        });
    }
    document.getElementById('limparFiltros').addEventListener('click', () => {
        for (const id of ['filtroTurmaCom','filtroAlunoCom','filtroTipoCom','filtroDataCom']) document.getElementById(id).value = '';
        paginaAtual = 1;
        atualizarProfessor();
    });
    for (const [id, passo] of [['paginaAnterior', -1], ['paginaProxima', 1]]) {
        document.getElementById(id).addEventListener('click', () => {
            paginaAtual += passo;
            carregarComunicados();
        });
    }
    try { turmas = await consultarProf('/minhas-turmas'); popularTurmas(); }
    catch (err) { alert(err.message); }
    atualizarProfessor();
    setInterval(() => { if (!document.hidden) atualizarProfessor(); }, 15000);
});
