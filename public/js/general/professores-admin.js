const tokenAdm = () => localStorage.getItem('token');
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let turmasAdm = [];
let professoresAdm = [];
async function apiAdm(url, options = {}) {
    const r = await fetch(url, {...options, headers: {'Authorization':`Bearer ${tokenAdm()}`, 'Content-Type':'application/json', ...(options.headers || {})}});
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(data.erro || 'Falha no servidor.');
    return data;
}
function opcoesTurmas(selecionados = []) {
    return turmasAdm.map(t => `<option value="${t.id_turma}" ${selecionados.includes(t.id_turma) ? 'selected' : ''}>${safe(t.sala_turma)} (${safe(t.turno)})</option>`).join('');
}
function valoresSelecionados(select) { return Array.from(select.selectedOptions).map(x => Number(x.value)); }
async function carregarCadastroProf() {
    const [turmas, professores] = await Promise.all([apiAdm('/api/turmas'), apiAdm('/api/professores')]);
    turmasAdm = turmas; professoresAdm = professores;
    document.getElementById('turmasProf').innerHTML = opcoesTurmas();
    const tbody = document.getElementById('listaProfessores');
    tbody.innerHTML = professores.length ? professores.map(u => `<tr>
      <td>${safe(u.nome)}</td><td>${safe(u.email)}</td><td>${String(u.status) === '0' ? 'Desativado' : 'Ativo'}</td>
      <td><select class="filter-select" multiple size="3" data-turmas="${u.id_usuario}">${opcoesTurmas(u.turmas_ids)}</select></td>
      <td><button class="btn-professor" data-salvar="${u.id_usuario}">Salvar vínculos</button></td>
    </tr>`).join('') : '<tr><td colspan="5">Nenhum professor cadastrado.</td></tr>';
    tbody.querySelectorAll('[data-salvar]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.salvar;
        try {
            const turmas = valoresSelecionados(tbody.querySelector(`[data-turmas="${id}"]`));
            const data = await apiAdm(`/api/professores/${id}/turmas`, {method:'PUT',body:JSON.stringify({turmas})});
            alert(data.mensagem);
            await carregarCadastroProf();
        } catch (e) { alert(e.message); }
    }));
}
document.addEventListener('DOMContentLoaded', async () => {
    const u = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (!tokenAdm() || u.tipo_usuario !== 'ADMIN') { location.href='login.html'; return; }
    try { await carregarCadastroProf(); } catch (e) { alert(e.message); }
    document.getElementById('formProfessor').addEventListener('submit', async e => {
        e.preventDefault();
        const v = id => document.getElementById(id).value.trim();
        const payload = { nome:v('nomeProf'), cpf:v('cpfProf'), telefone:v('telProf'), email:v('emailProf'),
            senha:document.getElementById('senhaProf').value, turmas:valoresSelecionados(document.getElementById('turmasProf')) };
        const msg = document.getElementById('msgCadastro');
        try {
            const data = await apiAdm('/api/professores',{method:'POST',body:JSON.stringify(payload)});
            msg.textContent = data.mensagem;
            e.target.reset();
            await carregarCadastroProf();
        } catch (err) { msg.textContent = err.message; }
    });
});
