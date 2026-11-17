// utils/manterAcordado.js — evita que o site "durma" no plano grátis do Render.
// No plano Free, o Render desliga o serviço depois de ~15 minutos sem nenhuma visita.
// Com o serviço desligado: o primeiro acesso demora ~40s E as rotinas automáticas param
// (alerta de atraso no retorno, horários fixos, backup). Aqui o próprio servidor visita o
// seu endereço público a cada 10 minutos, então ele nunca fica 15 minutos parado.
//
// Liga sozinho no Render (ele informa o endereço em RENDER_EXTERNAL_URL).
// Para desligar: MANTER_ACORDADO=desligado. Em outra hospedagem: MANTER_ACORDADO_URL=https://...
// Um serviço ligado 24h usa ~744h/mês, dentro das 750h grátis do Render (1 serviço por conta).
const INTERVALO_MIN = Math.max(5, Math.min(14, Number(process.env.MANTER_ACORDADO_MIN) || 10));

function enderecoPublico() {
    const base = (process.env.MANTER_ACORDADO_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
    return /^https:\/\//.test(base) ? `${base}/api/saude` : null;
}

function iniciarManterAcordado({ fetch: f = globalThis.fetch, setInterval: agendar = setInterval } = {}) {
    if (String(process.env.MANTER_ACORDADO || '').toLowerCase() === 'desligado') return null;
    const url = enderecoPublico();
    if (!url || typeof f !== 'function') return null;
    let falhasSeguidas = 0;
    const visitar = async () => {
        try {
            const r = await f(url, { headers: { 'User-Agent': 'portaria-manter-acordado' }, signal: AbortSignal.timeout(20000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            falhasSeguidas = 0;
        } catch (err) {
            // Só avisa no log depois de 3 falhas seguidas (uma falha isolada é normal).
            if (++falhasSeguidas === 3) console.error(`[manter-acordado] ${url} não respondeu 3 vezes seguidas: ${err.message}`);
        }
    };
    const id = agendar(visitar, INTERVALO_MIN * 60 * 1000);
    if (id && typeof id.unref === 'function') id.unref();
    console.log(`[manter-acordado] Ativo: visita ${url} a cada ${INTERVALO_MIN} min (o site não "dorme" no plano grátis).`);
    return { url, visitar, id };
}

module.exports = { iniciarManterAcordado, enderecoPublico, INTERVALO_MIN };
