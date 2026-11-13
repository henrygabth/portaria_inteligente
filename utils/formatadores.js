// utils/formatadores.js
// Padroniza CPF e telefone no servidor (mesmo formato das máscaras da tela),
// para que o banco guarde sempre "000.000.000-00" e "(00) 00000-0000",
// mesmo se o cadastro vier de outro lugar (script, API, planilha).

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function formatarCPF(valor) {
    if (valor === null || valor === undefined || valor === '') return valor;
    const d = soDigitos(valor);
    if (d.length !== 11) return String(valor).trim(); // não adivinha: mantém como veio
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarTelefone(valor) {
    if (valor === null || valor === undefined || valor === '') return valor;
    let d = soDigitos(valor);
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(valor).trim();
}

module.exports = { formatarCPF, formatarTelefone };
