// planilha.js — lê planilhas .xlsx (Excel) e .csv no próprio navegador, sem biblioteca externa.
// PIPlanilha.ler(arquivo) -> Promise<{ cabecalho: [...], linhas: [[...], ...] }>
(function () {
    const ler32 = (v, i) => v.getUint32(i, true);
    const ler16 = (v, i) => v.getUint16(i, true);

    async function inflar(bytes) {
        if (!('DecompressionStream' in window)) throw new Error('Este navegador não abre .xlsx. Salve a planilha como CSV e tente de novo.');
        const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(fluxo).arrayBuffer());
    }

    // Lê o índice do arquivo .zip (o .xlsx é um zip com vários XML dentro).
    async function abrirZip(buffer) {
        const v = new DataView(buffer);
        let fim = -1;
        for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
            if (ler32(v, i) === 0x06054b50) { fim = i; break; }
        }
        if (fim < 0) throw new Error('Arquivo .xlsx inválido ou corrompido.');
        const total = ler16(v, fim + 10);
        let p = ler32(v, fim + 16);
        const arquivos = {};
        for (let n = 0; n < total; n++) {
            if (ler32(v, p) !== 0x02014b50) break;
            const metodo = ler16(v, p + 10), tamanho = ler32(v, p + 20);
            const lenNome = ler16(v, p + 28), lenExtra = ler16(v, p + 30), lenComent = ler16(v, p + 32);
            const local = ler32(v, p + 42);
            const nome = new TextDecoder().decode(new Uint8Array(buffer, p + 46, lenNome));
            arquivos[nome] = { metodo, tamanho, local };
            p += 46 + lenNome + lenExtra + lenComent;
        }
        return {
            nomes: Object.keys(arquivos),
            async texto(nome) {
                const a = arquivos[nome];
                if (!a) return null;
                const ini = a.local + 30 + ler16(v, a.local + 26) + ler16(v, a.local + 28);
                const dados = new Uint8Array(buffer, ini, a.tamanho);
                const bruto = a.metodo === 0 ? dados : a.metodo === 8 ? await inflar(dados) : null;
                if (!bruto) throw new Error('Compressão da planilha não suportada. Salve como CSV.');
                return new TextDecoder('utf-8').decode(bruto);
            }
        };
    }

    const xml = t => new DOMParser().parseFromString(t, 'application/xml');
    const porTag = (no, tag) => Array.from(no.getElementsByTagNameNS('*', tag));
    function colunaIndice(ref) {
        const letras = String(ref).replace(/\d+/g, '');
        let n = 0;
        for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
        return n - 1;
    }

    async function lerXlsx(buffer) {
        const zip = await abrirZip(buffer);
        // Textos compartilhados (o Excel guarda cada texto uma vez só).
        const compartilhados = [];
        const sst = await zip.texto('xl/sharedStrings.xml');
        if (sst) porTag(xml(sst), 'si').forEach(si => compartilhados.push(porTag(si, 't').map(t => t.textContent).join('')));
        // Primeira aba da pasta de trabalho.
        let caminho = 'xl/worksheets/sheet1.xml';
        const wb = await zip.texto('xl/workbook.xml');
        const rels = await zip.texto('xl/_rels/workbook.xml.rels');
        if (wb && rels) {
            const aba = porTag(xml(wb), 'sheet')[0];
            const rid = aba && (aba.getAttribute('r:id') || aba.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
            const rel = porTag(xml(rels), 'Relationship').find(r => r.getAttribute('Id') === rid);
            if (rel) { const alvo = rel.getAttribute('Target').replace(/^\//, ''); caminho = alvo.startsWith('xl/') ? alvo : 'xl/' + alvo; }
        }
        const folha = await zip.texto(caminho) || await zip.texto(zip.nomes.find(n => /^xl\/worksheets\/.*\.xml$/.test(n)));
        if (!folha) throw new Error('Não encontrei nenhuma aba com dados na planilha.');
        const linhas = [];
        porTag(xml(folha), 'row').forEach(row => {
            const linha = [];
            porTag(row, 'c').forEach(c => {
                const tipo = c.getAttribute('t');
                const vNo = porTag(c, 'v')[0];
                let valor = '';
                if (tipo === 's') valor = compartilhados[Number(vNo && vNo.textContent)] ?? '';
                else if (tipo === 'inlineStr') valor = porTag(c, 't').map(t => t.textContent).join('');
                else valor = vNo ? vNo.textContent : '';
                linha[colunaIndice(c.getAttribute('r'))] = valor;
            });
            linhas.push(Array.from(linha, x => (x === undefined ? '' : String(x).trim())));
        });
        return linhas;
    }

    function lerCsv(texto) {
        const primeira = texto.split(/\r?\n/)[0] || '';
        const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
        const linhas = []; let linha = [], campo = '', aspas = false;
        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            if (aspas) {
                if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
                else if (c === '"') aspas = false;
                else campo += c;
            } else if (c === '"' && campo.trim() === '') { aspas = true; campo = ''; }
            else if (c === sep) { linha.push(campo.trim()); campo = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && texto[i + 1] === '\n') i++;
                linha.push(campo.trim()); linhas.push(linha); linha = []; campo = '';
            } else campo += c;
        }
        if (campo || linha.length) { linha.push(campo.trim()); linhas.push(linha); }
        return linhas;
    }

    async function ler(arquivo) {
        if (!arquivo) throw new Error('Escolha um arquivo.');
        if (arquivo.size > 5 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 5 MB).');
        const buffer = await arquivo.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let linhas;
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) linhas = await lerXlsx(buffer);
        else if (/\.xls$/i.test(arquivo.name)) throw new Error('Arquivo .xls antigo: no Excel, use "Salvar como" > Pasta de Trabalho do Excel (.xlsx) ou CSV.');
        else {
            let texto = new TextDecoder('utf-8').decode(bytes);
            if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes); // CSV salvo pelo Excel em português
            linhas = lerCsv(texto.replace(/^﻿/, ''));
        }
        linhas = linhas.filter(l => l.some(c => String(c || '').trim() !== ''));
        if (!linhas.length) throw new Error('A planilha está vazia.');
        return { cabecalho: linhas[0], linhas: linhas.slice(1) };
    }

    window.PIPlanilha = { ler, _lerCsv: lerCsv, _colunaIndice: colunaIndice };
})();
