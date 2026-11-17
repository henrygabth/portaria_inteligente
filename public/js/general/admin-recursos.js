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

    // ================================================================
    function aoMudarTela(id) {
        if (id === 'tela-auditoria') { aud.pagina = 1; carregarAuditoria(); }
        if (id === 'tela-saude') carregarSaude();
    }
    document.addEventListener('DOMContentLoaded', () => {
        ligarAuditoria(); ligarSaude();
        const b = $('btnImportarAlunos'); if (b) b.addEventListener('click', abrirImportar);
    });
    window.PIAdmin = { aoMudarTela, _campoDoCabecalho: campoDoCabecalho };
})();
