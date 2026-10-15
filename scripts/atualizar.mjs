// Atualiza o data.json do painel: Meta (templates da régua + saúde dos números) e Bitrix24 (respostas no Canal Aberto).
// Roda no GitHub Actions. Segredos: META_TOKEN e BITRIX_WEBHOOK (variáveis de ambiente).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const META_TOKEN = process.env.META_TOKEN;
const BX = process.env.BITRIX_WEBHOOK; // ex.: https://icephub.bitrix24.com.br/rest/10/xxxxx/
if (!META_TOKEN || !BX) { console.error('Faltam os segredos META_TOKEN e/ou BITRIX_WEBHOOK.'); process.exit(1); }

const G = 'https://graph.facebook.com/v23.0/';
const INICIO = '2026-10-05';
// O cliente só vê dados a partir desta data (dias anteriores não entram no data.json publicado)
const INICIO_PAINEL = '2026-10-13';
// 15/10/2026: só João Gomes e Gabriel Moreira seguem na API oficial (disparam para cards de qualquer responsável).
// Os demais ficam na lista só para o histórico do painel (envios/entregas dos dias em que dispararam).
const OPS = [
  { vendedor: 'João Gomes', userId: 2854, numero: '5521990853689', waba: '1898025354914977', ativo: true },
  { vendedor: 'Gabriel Moreira', userId: 2638, userIdsExtras: [666], numero: '5521968566838', waba: '1073858668600531', ativo: true },
  { vendedor: 'Caroline Oliveira', userId: 730, numero: '5521968950069', waba: '1823835488614892' },
  { vendedor: 'Marlon Matos', userId: 270, numero: '5521990860631', waba: '2939549596392485' },
  { vendedor: 'Vitor Espinola', userId: 668, numero: '5521976164516', waba: '1161584776580207' },
  { vendedor: 'Rafael Reis', userId: 292, numero: '5521966618116', waba: '1649127593490122' }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function meta(url, params) {
  const u = new URL(url.startsWith('http') ? url : G + url);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + META_TOKEN } });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Meta ' + u.pathname + ': ' + (b.error?.message || r.status));
  return b;
}
async function bitrix(metodo, corpo) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(BX + metodo + '.json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
    const b = await r.json().catch(() => ({}));
    if (b.error === 'QUERY_LIMIT_EXCEEDED' || r.status === 503) { await sleep(2000 * (t + 1)); continue; }
    if (b.error) throw new Error('Bitrix ' + metodo + ': ' + b.error);
    return b;
  }
  throw new Error('Bitrix ' + metodo + ': limite de requisições');
}

const T0 = Math.floor(Date.parse(INICIO + 'T00:00:00Z') / 1000);
const T1 = Math.floor(Date.now() / 1000);
const dia = s => new Date(s * 1000).toISOString().slice(0, 10);
const linhas = {};
const linha = (d, op) => (linhas[d + '|' + op.numero] ||= { data: d, numero: op.numero, vendedor: op.vendedor, envios: 0, entregues: 0, lidas: 0, respondidas: 0 });
const status = [];
const avisos = [];

for (const op of OPS) {
  try {
    const t = await meta(op.waba + '/message_templates', { fields: 'id,name', name: 'busca_e_apreensao', limit: 50 });
    const ids = (t.data || []).map(x => x.id);
    for (let i = 0; i < ids.length; i += 10) {
      let url = op.waba + '/template_analytics';
      let params = { start: T0, end: T1, granularity: 'DAILY', metric_types: JSON.stringify(['SENT', 'DELIVERED', 'READ']), template_ids: JSON.stringify(ids.slice(i, i + 10)), limit: 500 };
      for (let p = 0; p < 30 && url; p++) {
        const r = await meta(url, params);
        for (const bloco of (r.data || [])) for (const dp of (bloco.data_points || [])) {
          const l = linha(dia(dp.start), op);
          l.envios += dp.sent || 0; l.entregues += dp.delivered || 0; l.lidas += dp.read || 0;
        }
        url = r.paging?.next || null; params = null;
      }
    }
  } catch (e) { if (op.ativo) avisos.push(op.vendedor + ': ' + e.message); } // números fora da API não são mais acessíveis: o histórico deles vem do envios.json
  if (op.ativo) try {
    const s = await meta(op.waba, { fields: 'phone_numbers{display_phone_number,verified_name,status,quality_rating,whatsapp_business_manager_messaging_limit,name_status}' });
    const n = (s.phone_numbers?.data || []).find(x => String(x.display_phone_number).replace(/\D/g, '') === op.numero);
    status.push({ numero: op.numero, vendedor: op.vendedor, qualidade: n?.quality_rating || 'SEM_LEITURA', status: n?.status || 'SEM_LEITURA', limite: n?.whatsapp_business_manager_messaging_limit || null, nome_exibicao: n?.verified_name || null, status_nome: n?.name_status || null });
  } catch (e) {
    if (op.ativo) status.push({ numero: op.numero, vendedor: op.vendedor, qualidade: 'SEM_LEITURA', status: 'SEM_LEITURA', limite: null, nome_exibicao: null, status_nome: null });
    avisos.push(op.vendedor + ' (status): ' + e.message);
  }
}

// Respondidas: conversas de Canal Aberto abertas pelo lead, por vendedor responsável
const porUser = {};
for (const o of OPS) for (const u of [o.userId, ...(o.userIdsExtras || [])]) porUser[String(u)] = o;
let start = 0;
for (let p = 0; p < 400; p++) {
  const r = await bitrix('crm.activity.list', { filter: { PROVIDER_ID: 'IMOPENLINES_SESSION', '>=CREATED': INICIO + 'T00:00:00' }, select: ['ID', 'CREATED', 'RESPONSIBLE_ID', 'SUBJECT'], order: { ID: 'ASC' }, start });
  for (const a of (r.result || [])) {
    const assunto = String(a.SUBJECT || ''), digitos = assunto.replace(/\D/g, '');
    const op = OPS.find(o => digitos.includes(o.numero.slice(2))) || OPS.find(o => assunto.includes(o.vendedor)) || porUser[String(a.RESPONSIBLE_ID)];
    if (op) linha(new Date(a.CREATED).toISOString().slice(0, 10), op).respondidas++;
  }
  if (r.next == null) break;
  start = r.next; await sleep(500);
}

// Envios: a contagem do próprio fluxo de disparo (envios.json, publicado pelo fluxo a cada 15 min) substitui
// a da Meta nos dias em que existe, porque as estatísticas da Meta chegam com horas de atraso.
let fonteEnvios = 'meta';
if (existsSync('envios.json')) {
  try {
    const env = JSON.parse(readFileSync('envios.json', 'utf8'));
    const dias = new Set((env.rows || []).map(r => r.data));
    for (const l of Object.values(linhas)) if (dias.has(l.data)) { l.envios = 0; l.falhas = 0; }
    for (const r of (env.rows || [])) {
      const op = OPS.find(o => o.numero === String(r.numero)) || { numero: String(r.numero), vendedor: r.vendedor }; // nome atual do dono do número
      const l = linha(r.data, op);
      l.envios = Number(r.envios) || 0; l.falhas = Number(r.falhas) || 0;
    }
    fonteEnvios = 'fluxo';
  } catch (e) { avisos.push('envios.json: ' + e.message); }
}

const rows = Object.values(linhas).filter(l => l.data >= INICIO_PAINEL && (l.envios || l.entregues || l.lidas || l.respondidas))
  .sort((a, b) => a.data.localeCompare(b.data) || a.vendedor.localeCompare(b.vendedor));
const saida = { geradoEm: new Date().toISOString(), fonteEnvios, rows, status, tempoRetorno: null, avisos };
writeFileSync('data.json', JSON.stringify(saida, null, 1));
console.log(`data.json: ${rows.length} linhas, ${status.length} números, ${avisos.length} avisos.`);
if (avisos.length) console.log(avisos.join('\n'));
