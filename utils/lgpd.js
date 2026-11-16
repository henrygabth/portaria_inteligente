// LGPD: versão vigente do termo de uso e da política de privacidade.
// Ao mudar o texto de politica-privacidade.html de forma relevante, aumente a versão:
// todo mundo verá o aviso de novo no próximo login e precisará aceitar.
const VERSAO_TERMOS = '2026-11';
const precisaAceitar = usuario => !!usuario && String(usuario.termos_versao || '') !== VERSAO_TERMOS;
module.exports = { VERSAO_TERMOS, precisaAceitar };
