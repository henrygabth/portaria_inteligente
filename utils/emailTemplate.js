// utils/emailTemplate.js
// Template único de e-mail, padronizado na identidade visual Azul SENAI

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Busca e converte a imagem local 'logo_portaria' para Base64
let LOGO_URL = '';
try {
    const extensoes = ['.png', '.jpg', '.jpeg'];
    let caminhoImagem = '';

    for (const ext of extensoes) {
        const tempPath = path.join(__dirname, `logo_portaria${ext}`);
        if (fs.existsSync(tempPath)) {
            caminhoImagem = tempPath;
            break;
        }
    }

    if (caminhoImagem) {
        const ext = path.extname(caminhoImagem).replace('.', '');
        const imagemBase64 = fs.readFileSync(caminhoImagem).toString('base64');
        LOGO_URL = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${imagemBase64}`;
    } else {
        console.warn('⚠️ AVISO: Nenhuma imagem logo_portaria (.png, .jpg, .jpeg) foi encontrada na pasta utils.');
    }
} catch (error) {
    console.error('Erro ao carregar a imagem local da logo:', error.message);
}

// Paleta de cores padronizada no padrão Azul SENAI
const CORES = {
    azul: '#0052cc',
    azulEscuro: '#0A192F',
    azulClaro: '#E6F0FF',
    texto: '#1A202C',
    subtexto: '#4A5568'
};

/**
 * Monta o HTML de um e-mail padronizado em azul.
 *
 * @param {Object} opcoes
 * @param {string} opcoes.titulo       Título mostrado no corpo do e-mail
 * @param {string} [opcoes.saudacao]   Ex: "Olá, <strong>Fulano</strong>."
 * @param {string[]} [opcoes.paragrafos] Parágrafos de texto normal (cada item vira um <p>)
 * @param {string} [opcoes.destaque]   HTML opcional para bloco de destaque (motivo, credenciais, etc.)
 * @param {{texto:string, url:string}} [opcoes.botao] Botão de ação opcional
 * @param {string} [opcoes.rodape]     Texto extra de rodapé
 */
function montarEmailHtml({ titulo, saudacao, paragrafos = [], destaque, botao, rodape }) {
    // Força a cor principal para o padrão Azul SENAI
    const corDestaque = CORES.azul;

    const paragrafosHtml = paragrafos
        .map(p => `<p style="color: ${CORES.subtexto}; font-size: 14px; line-height: 1.6; margin: 0 0 14px 0;">${p}</p>`)
        .join('');

    const destaqueHtml = destaque
        ? `<div style="background-color: ${CORES.azulClaro}; border-left: 4px solid ${corDestaque}; padding: 14px 16px; margin: 20px 0; border-radius: 4px; color: ${CORES.texto};">${destaque}</div>`
        : '';

    const botaoHtml = botao
        ? `
            <div style="text-align: center; margin: 28px 0;">
                <a href="${botao.url}" style="background-color: ${corDestaque}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
                    ${botao.texto}
                </a>
            </div>
        `
        : '';

    return `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f4f6f8;">
            <div style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">

                <!-- Cabecalho Azul Escuro -->
                <div style="background-color: ${CORES.azulEscuro}; padding: 22px 30px; text-align: center;">
                    ${LOGO_URL ? `<img src="${LOGO_URL}" alt="SENAI" height="36" style="display: inline-block; vertical-align: middle; border-radius: 4px;">` : ''}
                    <span style="color: #ffffff; font-size: 16px; font-weight: 700; margin-left: 10px; vertical-align: middle; letter-spacing: 0.3px;">
                        Controle de Saídas
                    </span>
                </div>

                <!-- Corpo do E-mail -->
                <div style="padding: 30px;">
                    <h2 style="color: ${CORES.texto}; font-size: 19px; margin: 0 0 18px 0; border-bottom: 2px solid ${corDestaque}; padding-bottom: 10px;">
                        ${titulo}
                    </h2>

                    ${saudacao ? `<p style="color: ${CORES.subtexto}; font-size: 14px; margin: 0 0 14px 0;">${saudacao}</p>` : ''}
                    ${paragrafosHtml}
                    ${destaqueHtml}
                    ${botaoHtml}

                    <!-- Rodapé -->
                    <p style="color: #a0aec0; font-size: 12px; margin: 24px 0 0 0; border-top: 1px solid #edf2f7; padding-top: 16px;">
                        ${rodape || 'Este é um e-mail automático do sistema de Controle de Saídas. Em caso de dúvidas, procure a secretaria da escola.'}
                    </p>
                </div>
            </div>
        </div>
    `;
}

module.exports = { montarEmailHtml, CORES };