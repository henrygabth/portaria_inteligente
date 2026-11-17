// admin-recursos.js — telas da secretaria/administração:
//   Auditoria (quem fez o quê), Saúde do sistema + backup, e Importar alunos por planilha.
(function () {
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const token = () => localStorage.getItem('token');
    const usuario = () => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch (_) { return {}; } };
    const ehAdmin = () => String(usuario().tipo_usuario || '').toUpperCase() === 'ADMIN';
    const $ = id => document.getElementById(id);

    async function api(rota, opcoes = {}) {
        const r = await fetch('/api' + rota, {
            ...opcoes,
            headers: { Authorization: `Bearer ${token()}`, ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), ...(opcoes.headers || {}) }
        });
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro || 'Falha na comunicação com o servidor.');
        return dados;
    }
    async function baixar(rota, nomePadrao) {
        const r = await fetch('/api' + rota, { headers: { Authorization: `Bearer ${token()}` } });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || 'Não foi possível baixar o arquivo.'); }
        const nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || nomePadrao;
        const url = URL.createObjectURL(await r.blob());
        const a = Object.assign(document.createElement('a'), { href: url, download: nome });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    const dataHora = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // ================================================================ AUDITORIA
    const aud = { pagina: 1, total: 0, porPagina: 50, rotulos: {} };
    function filtrosAuditoria() {
        const p = new URLSearchParams();
        [['de', 'audDe'], ['ate', 'audAte'], ['acao', 'audAcao'], ['busca', 'audBusca']].forEach(([k, id]) => { const v = $(id).value.trim(); if (v) p.set(k, v); });
        return p;
    }
    async function carregarAuditoria() {
        const corpo = $('audCorpo');
        if (!Object.keys(aud.rotulos).length) {
            try {
                const acoes = await api('/auditoria/acoes');
                acoes.forEach(a => { aud.rotulos[a.acao] = a.rotulo; });
                $('audAcao').insertAdjacentHTML('beforeend', acoes.map(a => `<option value="${esc(a.acao)}">${esc(a.rotulo)}</option>`).join(''));
            } catch (_) { /* segue sem a lista */ }
        }
        corpo.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
        try {
            const p = filtrosAuditoria(); p.set('pagina', aud.pagina);
            const r = await api('/auditoria?' + p);
            aud.total = r.total; aud.porPagina = r.porPagina;
            corpo.innerHTML = r.registros.length ? r.registros.map(l => `
                <tr class="aud-${esc(String(l.acao).toLowerCase())}">
                    <td data-label="Quando">${esc(dataHora(l.criado_em))}</td>
                    <td data-label="Quem">${esc(l.usuario_nome || 'Sistema')}${l.papel ? `<small class="aud-papel">${esc(l.papel)}</small>` : ''}</td>
                    <td data-label="Ação"><span class="aud-acao">${esc(aud.rotulos[l.acao] || l.acao)}</span></td>
                    <td data-label="Detalhes">${esc(l.descricao)}${l.ip ? `<small class="aud-ip">IP ${esc(l.ip)}</small>` : ''}</td>
                </tr>`).join('') : '<tr><td colspan="4">Nenhum registro encontrado com esses filtros.</td></tr>';
            const paginas = Math.max(1, Math.ceil(r.total / r.porPagina));
            $('audTotal').textContent = `${r.total.toLocaleString('pt-BR')} registro(s)`;
            $('audPagina').textContent = `Página ${aud.pagina} de ${paginas}`;
            $('audAnterior').disabled = aud.pagina <= 1;
            $('audProxima').disabled = aud.pagina >= paginas;
        } catch (err) {
            corpo.innerHTML = `<tr><td colspan="4" class="erro-texto">${esc(err.message)}</td></tr>`;
        }
    }
    function ligarAuditoria() {
        if (!$('auditoriaFiltros')) return;
        $('auditoriaFiltros').addEventListener('submit', e => { e.preventDefault(); aud.pagina = 1; carregarAuditoria(); });
        $('audAnterior').addEventListener('click', () => { aud.pagina--; carregarAuditoria(); });
        $('audProxima').addEventListener('click', () => { aud.pagina++; carregarAuditoria(); });
        $('audExportar').addEventListener('click', () => baixar('/auditoria/exportar?' + filtrosAuditoria(), 'auditoria.csv').catch(e => PIDialogo.avisar(e.message)));
    }

    // ================================================================ SAÚDE + BACKUP
    const ICONE = { ok: 'fa-circle-check', atencao: 'fa-triangle-exclamation', erro: 'fa-circle-xmark' };
    const TEXTO = { ok: 'Tudo funcionando', atencao: 'Funcionando, com pontos de atenção', erro: 'Há problemas que precisam de atenção' };
    async function carregarSaude() {
        $('saudeResumo').className = 'saude-resumo'; $('saudeResumo').textContent = 'Conferindo...';
        try {
            const r = await api('/sistema/saude');
            $('saudeResumo').className = `saude-resumo saude-${r.situacao}`;
            $('saudeResumo').innerHTML = `<i class="fas ${ICONE[r.situacao]}" aria-hidden="true"></i> ${TEXTO[r.situacao]}`;
            $('saudeLista').innerHTML = r.itens.map(i => `
                <li class="saude-item saude-${esc(i.situacao)}">
                    <i class="fas ${ICONE[i.situacao] || 'fa-circle'}" aria-hidden="true"></i>
                    <div><strong>${esc(i.titulo)}</strong><span>${esc(i.detalhe)}</span></div>
                    <span class="sr-only">Situação: ${esc(TEXTO[i.situacao] || i.situacao)}</span>
                </li>`).join('');
            $('saudeBackups').innerHTML = r.backups.length ? r.backups.map(b => `<tr><td data-label="Arquivo">${esc(b.nome)}</td><td data-label="Data">${esc(dataHora(b.criado_em))}</td><td data-label="Tamanho">${Math.max(1, Math.round(b.bytes / 1024))} KB</td></tr>`).join('')
                : '<tr><td colspan="3">Nenhum backup guardado no servidor ainda.</td></tr>';
            const s = r.servidor;
            $('saudeServidor').innerHTML = [
                ['No ar desde', dataHora(s.no_ar_desde)], ['Tempo ligado', `${s.uptime_horas} h`], ['Memória em uso', `${s.memoria_mb} MB`],
                ['Telas conectadas agora', s.conexoes_tempo_real], ['Fuso horário', s.fuso], ['Versão do Node', s.node]
            ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
        } catch (err) {
            $('saudeResumo').className = 'saude-resumo saude-erro';
            $('saudeResumo').textContent = err.message;
        }
    }
    function ligarSaude() {
        if (!$('saudeAtualizar')) return;
        $('saudeAtualizar').addEventListener('click', carregarSaude);
        if (!ehAdmin()) { $('saudeBotoesBackup').hidden = true; $('saudeSoAdmin').hidden = false; }
        $('btnBaixarBackup').addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true; const t = b.innerHTML; b.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Gerando...';
            try { await baixar('/sistema/backup', 'portaria-backup.sql.gz'); } catch (err) { PIDialogo.avisar(err.message); }
            b.disabled = false; b.innerHTML = t;
        });
        $('btnGerarBackup').addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true;
            try { PIDialogo.avisar((await api('/sistema/backup', { method: 'POST', body: '{}' })).mensagem); carregarSaude(); } catch (err) { PIDialogo.avisar(err.message); }
            b.disabled = false;
        });
    }

    // ================================================================ IMPORTAR ALUNOS
    const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    function campoDoCabecalho(titulo) {
        const t = semAcento(titulo);
        if (/^(nome|aluno|nome do aluno|nome completo|estudante)/.test(t)) return 'nome';
        if (/(matricula|^ra$|registro)/.test(t)) return 'matricula';
        if (/(turma|sala|classe|serie)/.test(t)) return 'turma';
        if (/(nascimento|nasc|data)/.test(t)) return 'data_nascimento';
        return null;
    }
    const imp = { linhas: [], conferido: null };

    function abrirImportar() {
        const fundo = document.createElement('div');
        fundo.className = 'modal-recurso';
        fundo.innerHTML = `
            <div class="modal-recurso-caixa importar-caixa" role="dialog" aria-modal="true" aria-labelledby="impTitulo">
                <button type="button" class="modal-recurso-fechar" aria-label="Fechar">&times;</button>
                <h2 id="impTitulo"><i class="fas fa-file-excel" aria-hidden="true"></i> Importar alunos por planilha</h2>
                <ol class="importar-passos">
                    <li>A planilha precisa das colunas <strong>Nome</strong> e <strong>Turma</strong>. <strong>Matrícula</strong> e <strong>Data de nascimento</strong> são opcionais. <button type="button" class="link-botao" id="impModelo">Baixar planilha modelo</button></li>
                    <li>Escolha o arquivo (.xlsx do Excel ou .csv) e confira a prévia.</li>
                    <li>Nada é gravado até você clicar em <strong>Importar</strong>. Alunos já cadastrados são mantidos como estão.</li>
                </ol>
                <label class="importar-arquivo"><span><i class="fas fa-upload" aria-hidden="true"></i> Escolher arquivo</span>
                    <input type="file" id="impArquivo" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></label>
                <label class="importar-check"><input type="checkbox" id="impCriarTurmas"> Criar as turmas que ainda não existem</label>
                <div id="impStatus" class="importar-status" role="status" aria-live="polite"></div>
                <div class="table-responsive importar-previa" id="impPrevia" hidden></div>
                <div class="importar-botoes">
                    <button type="button" class="btn-filtro secundario" id="impCancelar">Cancelar</button>
                    <button type="button" class="btn-importar" id="impConfirmar" disabled>Importar</button>
                </div>
            </div>`;
        document.body.appendChild(fundo);
        const anterior = document.activeElement;
        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); if (anterior) anterior.focus(); };
        const tecla = e => { if (e.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('.modal-recurso-fechar') || e.target.id === 'impCancelar') fechar(); });
        fundo.querySelector('#impModelo').addEventListener('click', () => {
            const csv = '﻿Nome;Matrícula;Turma;Data de nascimento\r\nAna Clara Dias;2026001;1º A;14/03/2011\r\nPedro Almeida;2026002;2º A;02/09/2010\r\n';
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'modelo-alunos.csv' });
            document.body.appendChild(a); a.click(); a.remove();
        });
        const status = fundo.querySelector('#impStatus');
        const conferir = async () => {
            if (!imp.linhas.length) return;
            status.textContent = 'Conferindo...';
            try {
                const r = await api('/alunos/importar', { method: 'POST', body: JSON.stringify({ linhas: imp.linhas, simular: true, criarTurmas: fundo.querySelector('#impCriarTurmas').checked }) });
                imp.conferido = r;
                mostrarPrevia(fundo, r);
            } catch (err) { status.innerHTML = `<span class="erro-texto">${esc(err.message)}</span>`; }
        };
        fundo.querySelector('#impCriarTurmas').addEventListener('change', conferir);
        fundo.querySelector('#impArquivo').addEventListener('change', async e => {
            const arquivo = e.target.files[0];
            fundo.querySelector('#impConfirmar').disabled = true;
            if (!arquivo) return;
            status.textContent = 'Lendo a planilha...';
            try {
                const { cabecalho, linhas } = await PIPlanilha.ler(arquivo);
                const mapa = cabecalho.map(campoDoCabecalho);
                if (!mapa.includes('nome') || !mapa.includes('turma')) throw new Error('Não achei as colunas "Nome" e "Turma" na primeira linha da planilha. Use a planilha modelo.');
                imp.linhas = linhas.map((l, i) => { const o = { linha: i + 2 }; mapa.forEach((campo, c) => { if (campo && !o[campo]) o[campo] = l[c] ?? ''; }); return o; });
                await conferir();
            } catch (err) { status.innerHTML = `<span class="erro-texto">${esc(err.message)}</span>`; }
        });
        fundo.querySelector('#impConfirmar').addEventListener('click', async e => {
            const b = e.currentTarget; b.disabled = true; status.textContent = 'Importando...';
            try {
                const r = await api('/alunos/importar', { method: 'POST', body: JSON.stringify({ linhas: imp.linhas, simular: false, criarTurmas: fundo.querySelector('#impCriarTurmas').checked }) });
                mostrarPrevia(fundo, r, true);
                status.innerHTML = `<strong class="ok-texto"><i class="fas fa-circle-check" aria-hidden="true"></i> ${r.resumo.gravados} aluno(s) importado(s)${r.resumo.turmasCriadas ? ` e ${r.resumo.turmasCriadas} turma(s) criada(s)` : ''}.</strong>`;
                if (typeof window.carregarGerenciarAlunos === 'function') window.carregarGerenciarAlunos();
            } catch (err) { status.innerHTML = `<span class="erro-texto">${esc(err.message)}</span>`; b.disabled = false; }
        });
        fundo.querySelector('#impArquivo').focus();
    }

    const SITUACAO = { novo: ['Novo', 'imp-novo'], existe: ['Já cadastrado', 'imp-existe'], erro: ['Com erro', 'imp-erro'], criado: ['Importado', 'imp-novo'] };
    function mostrarPrevia(fundo, r, final) {
        const { novos, existentes, erros } = r.resumo;
        if (!final) fundo.querySelector('#impStatus').innerHTML = `<strong>${novos}</strong> novo(s) para importar · ${existentes} já cadastrado(s) · <span class="${erros ? 'erro-texto' : ''}">${erros} com erro</span>${erros ? '. As linhas com erro serão puladas; corrija na planilha se quiser incluí-las.' : ''}`;
        const previa = fundo.querySelector('#impPrevia');
        previa.hidden = false;
        previa.innerHTML = `<table class="history-table"><caption class="sr-only">Prévia da importação</caption>
            <thead><tr><th scope="col">Linha</th><th scope="col">Aluno</th><th scope="col">Turma</th><th scope="col">Matrícula</th><th scope="col">Situação</th></tr></thead>
            <tbody>${r.linhas.slice(0, 300).map(l => `<tr><td data-label="Linha">${l.linha}</td><td data-label="Aluno">${esc(l.nome)}</td><td data-label="Turma">${esc(l.turma)}</td><td data-label="Matrícula">${esc(l.matricula || 'gerada')}</td>
                <td data-label="Situação"><span class="imp-tag ${SITUACAO[l.situacao][1]}">${SITUACAO[l.situacao][0]}</span>${l.motivo ? `<small>${esc(l.motivo)}</small>` : ''}</td></tr>`).join('')}</tbody></table>
            ${r.linhas.length > 300 ? `<p class="tela-intro">Mostrando 300 de ${r.linhas.length} linhas.</p>` : ''}`;
        const botao = fundo.querySelector('#impConfirmar');
        botao.disabled = final || !novos;
        botao.textContent = final ? 'Concluído' : `Importar ${novos} aluno(s)`;
    }

    // ================================================================ SALAS E TURMAS
    const TURNOS = ['Manhã', 'Tarde', 'Noite', 'Integral'];
    let turmasLista = [];
    let editandoTurma = null;

    function avisoTurma(texto, erro) {
        const el = $('turmaMsg');
        if (!el) return;
        el.textContent = texto || '';
        el.className = 'turmas-msg' + (texto ? (erro ? ' erro-texto' : ' ok-texto') : '');
    }
    // Atualiza as listas de turma das outras telas (Vincular Responsável e Gerenciar Alunos).
    function atualizarOutrasTelas() {
        if (typeof window.carregarTurmasVinculo === 'function') window.carregarTurmasVinculo();
        if (typeof window.carregarGerenciarAlunos === 'function' && document.getElementById('tela-alunos')?.style.display !== 'none') window.carregarGerenciarAlunos();
    }

    function desenharTurmas() {
        const corpo = $('turmasCorpo');
        if (!corpo) return;
        const busca = ($('turmasBusca').value || '').trim().toLowerCase();
        const turno = $('turmasFiltroTurno').value;
        const lista = turmasLista.filter(t => (!busca || t.sala_turma.toLowerCase().includes(busca)) && (!turno || t.turno === turno));
        $('turmasTotal').textContent = turmasLista.length ? `(${turmasLista.length})` : '';
        if (!turmasLista.length) { corpo.innerHTML = '<tr><td colspan="5">Nenhuma sala cadastrada ainda. Use o formulário acima.</td></tr>'; return; }
        if (!lista.length) { corpo.innerHTML = '<tr><td colspan="5">Nenhuma sala encontrada com esse filtro.</td></tr>'; return; }
        corpo.innerHTML = lista.map(t => {
            if (editandoTurma === t.id_turma) {
                return `<tr class="turma-editando" data-id="${t.id_turma}">
                    <td data-label="Sala/Turma"><input type="text" class="turma-edit-nome" maxlength="100" value="${esc(t.sala_turma)}" aria-label="Novo nome da turma ${esc(t.sala_turma)}"></td>
                    <td data-label="Turno"><select class="turma-edit-turno" aria-label="Turno da turma ${esc(t.sala_turma)}">${TURNOS.map(x => `<option${x === t.turno ? ' selected' : ''}>${x}</option>`).join('')}</select></td>
                    <td data-label="Alunos ativos">${t.alunos_ativos}</td>
                    <td data-label="Professores">${t.professores}</td>
                    <td class="turma-acoes"><button type="button" class="btn-action btn-accept" data-turma-salvar title="Salvar" aria-label="Salvar alterações da turma"><i class="fas fa-check"></i></button>
                        <button type="button" class="btn-action btn-deny" data-turma-cancelar title="Cancelar" aria-label="Cancelar edição"><i class="fas fa-xmark"></i></button></td>
                </tr>`;
            }
            const vazia = !t.alunos_total && !t.professores;
            return `<tr data-id="${t.id_turma}">
                <td data-label="Sala/Turma"><strong>${esc(t.sala_turma)}</strong></td>
                <td data-label="Turno">${esc(t.turno)}</td>
                <td data-label="Alunos ativos"><span>${t.alunos_ativos}${t.alunos_total > t.alunos_ativos ? ` <small class="turma-inativos">(+${t.alunos_total - t.alunos_ativos} inativo(s))</small>` : ''}</span></td>
                <td data-label="Professores">${t.professores}</td>
                <td class="turma-acoes">
                    <button type="button" class="btn-action turma-btn-editar" data-turma-editar title="Editar" aria-label="Editar a turma ${esc(t.sala_turma)}"><i class="fas fa-pen"></i></button>
                    <button type="button" class="btn-action btn-deny" data-turma-apagar title="${vazia ? 'Remover' : 'Só dá para remover turma sem alunos e sem professores'}" aria-label="Remover a turma ${esc(t.sala_turma)}"${vazia ? '' : ' aria-disabled="true"'}><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
        const campo = corpo.querySelector('.turma-edit-nome');
        if (campo) { campo.focus(); campo.select(); }
    }

    async function carregarTurmas() {
        const corpo = $('turmasCorpo');
        if (!corpo) return;
        try {
            const r = await api('/turmas/resumo');
            turmasLista = r.turmas;
            desenharTurmas();
        } catch (err) {
            corpo.innerHTML = `<tr><td colspan="5" class="erro-texto">${esc(err.message)}</td></tr>`;
        }
    }

    function ligarTurmas() {
        const form = $('formTurma');
        if (!form) return;
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const nome = $('turmaNome').value.trim();
            if (!nome) { avisoTurma('Informe o nome da sala/turma.', true); $('turmaNome').focus(); return; }
            const botao = form.querySelector('button[type=submit]'); botao.disabled = true;
            try {
                const r = await api('/turmas/cadastrar', { method: 'POST', body: JSON.stringify({ sala_turma: nome, turno: $('turmaTurno').value }) });
                avisoTurma(r.mensagem);
                $('turmaNome').value = ''; $('turmaNome').focus();
                await carregarTurmas(); atualizarOutrasTelas();
            } catch (err) { avisoTurma(err.message, true); }
            botao.disabled = false;
        });
        $('turmasBusca').addEventListener('input', desenharTurmas);
        $('turmasFiltroTurno').addEventListener('change', desenharTurmas);
        $('turmasCorpo').addEventListener('keydown', e => {
            if (!e.target.closest('.turma-editando')) return;
            if (e.key === 'Enter') { e.preventDefault(); e.target.closest('tr').querySelector('[data-turma-salvar]').click(); }
            if (e.key === 'Escape') { e.preventDefault(); editandoTurma = null; desenharTurmas(); }
        });
        $('turmasCorpo').addEventListener('click', async e => {
            const tr = e.target.closest('tr[data-id]');
            if (!tr) return;
            const id = Number(tr.dataset.id);
            const turma = turmasLista.find(t => t.id_turma === id);
            if (e.target.closest('[data-turma-editar]')) { editandoTurma = id; desenharTurmas(); return; }
            if (e.target.closest('[data-turma-cancelar]')) { editandoTurma = null; desenharTurmas(); return; }
            if (e.target.closest('[data-turma-salvar]')) {
                const sala_turma = tr.querySelector('.turma-edit-nome').value.trim();
                const turno = tr.querySelector('.turma-edit-turno').value;
                try {
                    const r = await api(`/turmas/${id}`, { method: 'PUT', body: JSON.stringify({ sala_turma, turno }) });
                    editandoTurma = null; avisoTurma(r.mensagem);
                    await carregarTurmas(); atualizarOutrasTelas();
                } catch (err) { PIDialogo.avisar(err.message, { tipo: 'erro' }); }
                return;
            }
            if (e.target.closest('[data-turma-apagar]')) {
                if (turma && (turma.alunos_total || turma.professores)) {
                    PIDialogo.avisar(`A turma ${turma.sala_turma} ainda tem ${turma.alunos_total} aluno(s) e ${turma.professores} professor(es). Mude os alunos de turma em "Gerenciar Alunos" e tire os professores em "Professores e Turmas" antes de remover.`, { tipo: 'info', titulo: 'Turma em uso' });
                    return;
                }
                const ok = await PIDialogo.confirmar({ titulo: 'Remover turma?', texto: `A turma ${turma ? turma.sala_turma : ''} será removida.`, ok: 'Remover', tipo: 'perigo' });
                if (!ok) return;
                try {
                    const r = await api(`/turmas/${id}`, { method: 'DELETE' });
                    avisoTurma(r.mensagem);
                    await carregarTurmas(); atualizarOutrasTelas();
                } catch (err) { PIDialogo.avisar(err.message, { tipo: 'erro' }); }
            }
        });
    }

    // ================================================================ LOGINS DA EQUIPE
    const ROTULO_PERFIL = { SECRETARIA: 'Secretaria', PORTARIA: 'Portaria', PORTEIRO: 'Portaria', PROFESSOR: 'Professor(a)' };
    const perfisQuePossoCriar = () => ehAdmin() ? ['SECRETARIA', 'PORTARIA', 'PROFESSOR'] : ['PORTARIA', 'PROFESSOR'];

    function abrirModal(html, idTitulo) {
        const fundo = document.createElement('div');
        fundo.className = 'modal-recurso';
        fundo.innerHTML = `<div class="modal-recurso-caixa" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
            <button type="button" class="modal-recurso-fechar" aria-label="Fechar">&times;</button>${html}</div>`;
        document.body.appendChild(fundo);
        const anterior = document.activeElement;
        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); if (anterior && anterior.focus) anterior.focus(); };
        const tecla = e => { if (e.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('.modal-recurso-fechar') || e.target.closest('[data-fechar]')) fechar(); });
        return { fundo, fechar };
    }

    // Mostra a senha temporária (com botão de copiar) e se o convite foi por e-mail.
    function mostrarSenhaTemporaria(r, titulo) {
        const { fundo } = abrirModal(`
            <h2 id="eqResTitulo"><i class="fas ${r.email_enviado ? 'fa-circle-check' : 'fa-triangle-exclamation'}" aria-hidden="true"></i> ${esc(titulo)}</h2>
            <p class="tela-intro">${r.email_enviado
                ? `O convite foi enviado para <strong>${esc(r.email)}</strong>. Se não chegar em alguns minutos, peça para olhar no spam/lixo eletrônico.`
                : `<strong>O e-mail não foi enviado.</strong> Passe a senha abaixo para <strong>${esc(r.nome)}</strong> pessoalmente.`}</p>
            <div class="equipe-senha">
                <span>Senha temporária</span>
                <code id="eqSenha">${esc(r.senha_temporaria)}</code>
                <button type="button" class="btn-filtro secundario" id="eqCopiar"><i class="fas fa-copy" aria-hidden="true"></i> Copiar</button>
            </div>
            <p class="tela-intro">No primeiro login, a pessoa recebe um código no e-mail, cria a própria senha e aceita a política de privacidade. Esta senha temporária deixa de valer depois disso.</p>
            <div class="importar-botoes"><button type="button" class="btn-importar" data-fechar>Pronto</button></div>`, 'eqResTitulo');
        fundo.querySelector('#eqCopiar').addEventListener('click', async e => {
            try { await navigator.clipboard.writeText(r.senha_temporaria); e.currentTarget.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copiada'; }
            catch (_) { const sel = window.getSelection(); const rg = document.createRange(); rg.selectNodeContents(fundo.querySelector('#eqSenha')); sel.removeAllRanges(); sel.addRange(rg); }
        });
        fundo.querySelector('[data-fechar]').focus();
    }

    function abrirNovoLogin() {
        const perfis = perfisQuePossoCriar();
        const { fundo, fechar } = abrirModal(`
            <h2 id="eqTitulo"><i class="fas fa-user-plus" aria-hidden="true"></i> Novo login da equipe</h2>
            <p class="tela-intro">O sistema cria uma senha temporária e manda um convite por e-mail. Responsáveis (pais) são criados em "Vincular Responsável", junto com o aluno.</p>
            <form id="eqForm" class="equipe-form" novalidate>
                <div class="input-group"><label for="eqNome">Nome completo</label><input id="eqNome" maxlength="150" autocomplete="off" required></div>
                <div class="input-group"><label for="eqEmail">E-mail</label><input id="eqEmail" type="email" maxlength="150" autocomplete="off" required placeholder="nome@escola.com.br"></div>
                <div class="input-group"><label for="eqPerfil">Perfil</label>
                    <select id="eqPerfil">${perfis.map(p => `<option value="${p}">${ROTULO_PERFIL[p]}</option>`).join('')}</select></div>
                <details class="equipe-opcionais"><summary>CPF e telefone (opcionais)</summary>
                    <div class="input-group"><label for="eqCpf">CPF</label><input id="eqCpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></div>
                    <div class="input-group"><label for="eqTel">Telefone</label><input id="eqTel" inputmode="tel" maxlength="15" placeholder="(19) 99999-9999"></div>
                </details>
                ${ehAdmin() ? '' : '<p class="tela-intro"><i class="fas fa-lock" aria-hidden="true"></i> Logins da secretaria só podem ser criados pelo administrador.</p>'}
                <p class="erro-texto" id="eqErro" role="alert"></p>
                <div class="importar-botoes">
                    <button type="button" class="btn-filtro secundario" data-fechar>Cancelar</button>
                    <button type="submit" class="btn-importar"><i class="fas fa-paper-plane" aria-hidden="true"></i> Criar e enviar convite</button>
                </div>
            </form>`, 'eqTitulo');
        const erro = fundo.querySelector('#eqErro');
        fundo.querySelector('#eqForm').addEventListener('submit', async e => {
            e.preventDefault();
            const botao = e.target.querySelector('button[type=submit]');
            const corpo = {
                nome: fundo.querySelector('#eqNome').value.trim(),
                email: fundo.querySelector('#eqEmail').value.trim(),
                tipo_usuario: fundo.querySelector('#eqPerfil').value,
                cpf: fundo.querySelector('#eqCpf').value.trim(),
                telefone: fundo.querySelector('#eqTel').value.trim()
            };
            if (corpo.nome.length < 3) { erro.textContent = 'Informe o nome completo.'; fundo.querySelector('#eqNome').focus(); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) { erro.textContent = 'Informe um e-mail válido.'; fundo.querySelector('#eqEmail').focus(); return; }
            botao.disabled = true; erro.textContent = '';
            botao.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Criando...';
            try {
                const r = await api('/usuarios/equipe', { method: 'POST', body: JSON.stringify(corpo) });
                fechar();
                mostrarSenhaTemporaria(r, `Login de ${r.nome} criado`);
                if (typeof window.carregarPerfis === 'function') window.carregarPerfis();
            } catch (err) {
                erro.textContent = err.message;
                botao.disabled = false; botao.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Criar e enviar convite';
            }
        });
        fundo.querySelector('#eqNome').focus();
    }

    async function reenviarConvite(perfil) {
        if (!perfil) return;
        const ok = await PIDialogo.confirmar({
            titulo: 'Reenviar convite?',
            texto: `Uma nova senha temporária será criada para ${perfil.nome} e enviada para ${perfil.email}. A senha atual dessa pessoa deixa de funcionar e ela precisará criar uma nova no próximo login.`,
            ok: 'Gerar e enviar', tipo: 'normal'
        });
        if (!ok) return;
        try {
            const r = await api(`/usuarios/${perfil.id_usuario}/convite`, { method: 'POST', body: '{}' });
            mostrarSenhaTemporaria(r, `Nova senha para ${r.nome}`);
            if (typeof window.carregarPerfis === 'function') window.carregarPerfis();
        } catch (err) { PIDialogo.avisar(err.message, { tipo: 'erro' }); }
    }

    // ================================================================
    function aoMudarTela(id) {
        if (id === 'tela-turmas') { editandoTurma = null; avisoTurma(''); carregarTurmas(); }
        if (id === 'tela-auditoria') { aud.pagina = 1; carregarAuditoria(); }
        if (id === 'tela-saude') carregarSaude();
    }
    document.addEventListener('DOMContentLoaded', () => {
        ligarAuditoria(); ligarSaude(); ligarTurmas();
        const b = $('btnImportarAlunos'); if (b) b.addEventListener('click', abrirImportar);
        const nl = $('btnNovoLoginEquipe'); if (nl) nl.addEventListener('click', abrirNovoLogin);
    });
    window.PIAdmin = { aoMudarTela, reenviarConvite, abrirNovoLogin, _campoDoCabecalho: campoDoCabecalho };
})();
