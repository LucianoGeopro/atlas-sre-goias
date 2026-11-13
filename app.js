/* Atlas web do SRE por município — mesmo conteúdo do layout 04 (caderno), interativo. */
"use strict";

const SIT = {                                   // cores dos gráficos (graficos_municipios.py)
  PAV: ["Pavimentada", "#e31a1c"], DUP: ["Duplicada", "#7a0a0d"], EOD: ["Em obras de duplicação", "#b8494b"],
  EOP: ["Em obras de pavimentação", "#f7a8a9"], IMP: ["Implantada", "#f5bd70"], LEN: ["Leito natural", "#e88000"],
  PLA: ["Planejada", "#000000"]
};
const ORD = Object.keys(SIT);
const BRANCO = new Set(["PAV", "DUP", "EOD", "PLA"]);
const DOR_COR = { "Duplicação": "#1a00f4", "Pavimentação": "#0055d6", "Restauração": "#00c8ec" };
const DOR_PONT = "#4e88b9";
// projetos (DPJ): padrão SIPLAWEB — cor pela intervenção; etapa Projeto = linha branca contínua no meio,
// Planejamento/Licitação = linha branca tracejada (mesma simbologia do layout 04)
const PJ_COR = { "Duplicação": "#001efe", "Melhoria Funcional": "#ff9601", "Pavimentação": "#dc0101", "PRAD": "#666666",
  "Restauração": "#10a000", "Sinalização": "#666666" };
const PJ_CLASSES = [["Duplicação", "Licitação"], ["Duplicação", "Planejamento"], ["Duplicação", "Projeto"],
  ["Melhoria Funcional", "Projeto"], ["Pavimentação", "Licitação"], ["Pavimentação", "Planejamento"], ["Pavimentação", "Projeto"],
  ["PRAD", "Planejamento"], ["Restauração", "Planejamento"], ["Restauração", "Projeto"], ["Sinalização", "Planejamento"]];
const PJ_PONT = { "Ponte em projeto": ["img/placaoaeprojeto.svg", "#00ffff", "#111"], "Em planejamento": ["img/placaplanejamento.svg", "#c8ab37", "#fff"],
  "Projeto": ["img/placaprojeto.svg", "#007eff", "#fff"], "Obra": ["img/placaobra.svg", "#ff6600", "#fff"] };
const PLURAL = { "Ponte": "pontes", "Viaduto": "viadutos", "Bueiro": "bueiros", "Duplicação": "duplicações", "PRAD": "PRADs" };
const km2 = v => br(v, 2) + " Km";                 // Km sempre com 2 casas (layout 04)
const T_MU = "#7b3fa0", T_LT = "#138a72", T_GO = "#2f6db5";

const $ = s => document.querySelector(s);
const br = (v, d = 1) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const soma = o => Object.values(o || {}).reduce((a, b) => a + b, 0);

let A, GEO = {}, LISTA = [], atual = null, mapa, camadas = {}, AREA = [];
// seleção de vários municípios (13/11/2026): SEL = códigos selecionados (o 1º é o "principal"), BBOX = caixa da seleção,
// COMB = modo "Combinar" (clique no mapa adiciona/remove), M = dados somados da seleção
let SEL = [], BBOX = null, COMB = false, M = null;

/* ---------------- dica (tooltip) para gráficos ---------------- */
const dica = $("#dica");
function mostraDica(ev, html) {
  dica.innerHTML = html; dica.style.display = "block";
  const x = ev.clientX ?? ev.touches?.[0]?.clientX, y = ev.clientY ?? ev.touches?.[0]?.clientY;
  const w = dica.offsetWidth, h = dica.offsetHeight;
  dica.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px";
  dica.style.top = (y + h + 20 > window.innerHeight ? y - h - 10 : y + 16) + "px";
}
document.addEventListener("mousemove", ev => {
  const t = ev.target.closest?.("[data-tip]");
  if (t) mostraDica(ev, t.dataset.tip); else dica.style.display = "none";
});
document.addEventListener("click", ev => {
  const t = ev.target.closest?.("[data-tip]");
  if (t) mostraDica(ev, t.dataset.tip); else dica.style.display = "none";
});

/* ---------------- tema claro / escuro ---------------- */
const escuro = () => document.documentElement.dataset.tema === "escuro";
const estiloMascara = () => escuro() ? { fillColor: "#16181a", fillOpacity: 0.8 } : { fillColor: "#eeeeea", fillOpacity: 0.82 };
function aplicaTema(esc_) {
  if (esc_) document.documentElement.dataset.tema = "escuro"; else delete document.documentElement.dataset.tema;
  $("#tema").textContent = esc_ ? "☀ Tema claro" : "🌙 Tema escuro";
  try { localStorage.setItem("atlas-tema", esc_ ? "escuro" : "claro"); } catch (e) {}
  if (camadas.mascara) camadas.mascara.setStyle(estiloMascara());
}
$("#tema").onclick = () => aplicaTema(!escuro());
aplicaTema(escuro());

/* ---------------- capa (13/11/2026) ---------------- */
// o atlas carrega por trás enquanto a capa está aberta
function fechaCapa() {
  document.documentElement.classList.remove("capa-aberta");
  if (mapa) setTimeout(() => { mapa.invalidateSize(); if (atual) enquadra(); }, 50);
}
$("#capa-entrar").onclick = fechaCapa;
$("#ver-capa").onclick = () => { document.documentElement.classList.add("capa-aberta"); window.scrollTo(0, 0); $("#capa-entrar").focus(); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && document.documentElement.classList.contains("capa-aberta")) fechaCapa(); });

/* ---------------- carga ---------------- */
// cada mês fica em data/<AAAA-MM>/ (atlas.json, sre, obras DOR); as bases fixas ficam em data/
const MENSAIS = new Set(["sre", "dor_linhas", "dor_pontos", "dpj_linhas", "dpj_pontos"]);
const VAZIO = { type: "FeatureCollection", features: [] };
async function carrega() {
  const meses = await fetch("data/meses.json", { cache: "no-cache" }).then(r => r.json());
  const pedido = new URLSearchParams(location.search).get("mes");
  const MES = (meses.find(m => m.id === pedido) || meses[0]).id;
  const nomes = ["municipios", "sre", "dor_linhas", "dor_pontos", "dpj_linhas", "dpj_pontos", "perimetro_urbano", "localidades", "snv_federal", "lotes"];
  const [atlas, ...geos] = await Promise.all([fetch(`data/${MES}/atlas.json`).then(r => r.json()),
    ...nomes.map(n => fetch(MENSAIS.has(n) ? `data/${MES}/${n}.geojson` : `data/${n}.geojson`)
      .then(r => r.ok ? r.json() : VAZIO).catch(() => VAZIO))]);   // mês sem projetos: camada vazia
  A = atlas; nomes.forEach((n, i) => GEO[n] = geos[i]);
  textosDoMes(meses, MES);
  LISTA = Object.entries(A.municipios).sort((a, b) => a[1].ordem - b[1].ordem).map(([cod]) => cod);
  autocompleta($("#q"), c => COMB ? alterna(c, true) : seleciona(c));
  iniciaMapa(); legenda();
  const h = codsDoHash();
  selecionaLista(h.length ? h : [LISTA[0]], false);
  $("#carregando").remove();
}
// #5200050 ou #5200050,5209200 (link de uma seleção)
function codsDoHash() { return decodeURIComponent(location.hash.slice(1)).split(",").map(s => s.trim()).filter(c => A.municipios[c]); }

/* ---------------- mês da base ---------------- */
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function textosDoMes(meses, MES) {
  const rot = A.rotulo;                                   // "novembro/2026"
  document.querySelectorAll(".mes-up").forEach(e => e.textContent = rot.toUpperCase());
  document.querySelectorAll(".mes-cap").forEach(e => e.textContent = cap(rot));
  document.querySelectorAll(".mes-min").forEach(e => e.textContent = rot);
  if (A.elaboracao) $("#elab").textContent = A.elaboracao;
  const sel = $("#mes");
  sel.innerHTML = meses.map(m => `<option value="${m.id}"${m.id === MES ? " selected" : ""}>SRE ${cap(m.rotulo)}</option>`).join("");
  sel.hidden = meses.length < 2;                          // com um mês só, não precisa do seletor
  sel.onchange = () => {
    const p = new URLSearchParams(location.search);
    sel.value === meses[0].id ? p.delete("mes") : p.set("mes", sel.value);
    location.href = location.pathname + (p.toString() ? "?" + p : "") + location.hash;
  };
}

/* ---------------- busca ---------------- */
const semAcento = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function procura(txt) {
  const t = semAcento(txt);
  return LISTA.find(c => semAcento(A.municipios[c].nome) === t) ||
         LISTA.find(c => semAcento(A.municipios[c].nome).startsWith(t));
}
$("#ant").onclick = () => seleciona(LISTA[(LISTA.indexOf(atual) - 1 + LISTA.length) % LISTA.length]);
$("#prox").onclick = () => seleciona(LISTA[(LISTA.indexOf(atual) + 1) % LISTA.length]);
window.addEventListener("hashchange", () => { const c = codsDoHash(); if (c.length && c.join() !== SEL.join()) selecionaLista(c, false); });

/* ---------------- mapa ---------------- */
function estiloSRE(f) {
  const s = f.properties.sit;
  const cor = (s === "IMP" || s === "LEN") ? "#e88000" : s === "PLA" ? "#000000" : "#e31a1c";
  return { color: cor, weight: s === "DUP" || s === "EOD" ? 5 : 3, dashArray: s === "EOP" ? "8 5" : null, opacity: 1 };
}
function iniciaMapa() {
  mapa = L.map("mapa", { preferCanvas: true, zoomSnap: 0.25, attributionControl: true, zoomControl: false });
  // 13/11/2026: sem filtro CSS nas imagens de satélite (o filtro em cada imagem deixava o arrasto pesado)
  const satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18, attribution: "Imagem: Esri, Maxar, Earthstar Geographics"
  }).addTo(mapa);
  mapa.createPane("rotulos").style.zIndex = 620;
  mapa.getPane("rotulos").style.pointerEvents = "none";
  mapa.createPane("mascara").style.zIndex = 390;
  mapa.createPane("vias").style.zIndex = 420;
  mapa.createPane("projetos").style.zIndex = 425;   // obra tem mais peso: projetos ficam por baixo das obras
  mapa.createPane("obras").style.zIndex = 430;
  mapa.createPane("projP").style.zIndex = 436;
  mapa.createPane("topo").style.zIndex = 440;
  const rnd = L.canvas({ padding: 0.3 });

  // 13/11/2026: as camadas nascem vazias e recebem só a área do município selecionado (preencheArea)
  camadas.perimetro = L.geoJSON(null, { renderer: rnd,
    style: { color: "#f2d24b", weight: 1, fillColor: "#f2d24b", fillOpacity: 0.18 } });
  camadas.municipios = L.geoJSON(null, { renderer: rnd,
    style: { color: "#ffffff", weight: 1, opacity: 0.8, fillOpacity: 0 },
    onEachFeature: (f, l) => {
      // modo Combinar (ou Ctrl/Shift + clique): adiciona/remove da seleção; senão abre só o município clicado
      l.on("click", e => { const c = f.properties.cod, oe = e.originalEvent || {};
        if (COMB || oe.ctrlKey || oe.shiftKey || oe.metaKey) alterna(c);
        else if (c !== atual || SEL.length > 1) seleciona(c); });
      l.bindTooltip(() => f.properties.nome + (SEL.includes(f.properties.cod) ? " (selecionado)" : COMB ? " — clique para somar" : ""), { sticky: true });
    } });
  camadas.lotes = L.geoJSON(GEO.lotes, { renderer: rnd,
    style: { color: T_LT, weight: 2, fillColor: T_LT, fillOpacity: 0.08, dashArray: "6 4" },
    onEachFeature: (f, l) => l.bindTooltip("Lote " + f.properties.lote, { sticky: true }) });
  camadas.snv = L.geoJSON(null, { renderer: rnd, pane: "vias",
    style: { color: "#33a02c", weight: 3 },
    onEachFeature: (f, l) => l.bindTooltip(`BR-${esc(f.properties.br)} · Federal`, { sticky: true }) });
  camadas.sre = L.geoJSON(null, { renderer: rnd, pane: "vias", style: estiloSRE,
    onEachFeature: (f, l) => l.bindTooltip(`<b>GO-${esc(f.properties.go)}</b> · ${esc(f.properties.sre)}<br>${SIT[f.properties.sit]?.[0] || esc(f.properties.sit)}`, { sticky: true }) });
  // obras (DOR): contorno branco + cor por tipo (mesma simbologia do layout)
  const dorCasco = L.geoJSON(null, { renderer: rnd, pane: "obras", style: { color: "#ffffff", weight: 8, opacity: 0.9 }, interactive: false });
  const dorCor = L.geoJSON(null, { renderer: rnd, pane: "obras",
      style: f => ({ color: DOR_COR[f.properties.intervencao] || "#0055d6", weight: 5 }),
      onEachFeature: (f, l) => l.bindTooltip(`<b>Obra – ${esc(f.properties.intervencao)}</b><br>${esc(f.properties.rodovia || "")} · ${esc(f.properties.codigo || "")}`, { sticky: true }) });
  camadas.dorL = L.layerGroup([dorCasco, dorCor]);
  camadas.dorP = L.geoJSON(null, { pane: "topo",
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: "#ffffff", weight: 2, fillColor: DOR_PONT, fillOpacity: 1 }),
    onEachFeature: (f, l) => l.bindTooltip(`<b>Obra pontual – ${esc(f.properties.intervencao)}</b><br>${esc(f.properties.rodovia || "")} · ${esc(f.properties.codigo || "")}`) });
  // projetos (DPJ): faixa colorida + linha branca no meio (contínua = Projeto; tracejada = Planejamento/Licitação)
  const dicaPJ = p => `<b>Projeto – ${esc(p.intervencao)} - ${esc(p.etapa)}</b><br>${esc(p.rodovia || "")} · ${esc(p.codigo || "")}`;
  const pjBase = L.geoJSON(null, { renderer: rnd, pane: "projetos",
      style: f => ({ color: PJ_COR[f.properties.intervencao] || "#666666", weight: 7, opacity: 0.95, lineCap: "round" }),
      onEachFeature: (f, l) => l.bindTooltip(dicaPJ(f.properties), { sticky: true }) });
  const pjTopo = L.geoJSON(null, { renderer: rnd, pane: "projetos", interactive: false,
      style: f => ({ color: "#ffffff", weight: 2.3, opacity: 1, dashArray: f.properties.etapa === "Projeto" ? null : "6 4.5",
        lineCap: f.properties.etapa === "Projeto" ? "round" : "butt" }) });
  camadas.projL = L.layerGroup([pjBase, pjTopo]);
  camadas.projP = L.geoJSON(null, { pane: "projP",
    pointToLayer: (f, ll) => L.marker(ll, { pane: "projP", icon: L.icon({ iconUrl: (PJ_PONT[f.properties.cat] || PJ_PONT.Projeto)[0],
      iconSize: [22, 22], iconAnchor: [11, 11] }) }),
    onEachFeature: (f, l) => l.bindTooltip(`<b>Projeto pontual – ${esc(f.properties.cat)}</b><br>${esc(f.properties.intervencao)} · ${esc(f.properties.rodovia || "")} · ${esc(f.properties.codigo || "")}`) });
  camadas.loc = L.geoJSON(null, { pane: "topo",
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: /Sede|Capital/.test(f.properties.t) ? 4 : 2.5, color: "#222",
      weight: 1, fillColor: "#fff", fillOpacity: 1 }),
    onEachFeature: (f, l) => l.bindTooltip(esc(f.properties.n), { permanent: /Sede|Capital/.test(f.properties.t),
      direction: "right", offset: [5, 0], className: "rot-loc" }) });
  // [camada, fonte] que só recebem a área do município selecionado
  AREA = [[camadas.perimetro, "perimetro_urbano"], [camadas.municipios, "municipios"], [camadas.snv, "snv_federal"],
    [camadas.sre, "sre"], [dorCasco, "dor_linhas"], [dorCor, "dor_linhas"], [camadas.dorP, "dor_pontos"],
    [pjBase, "dpj_linhas"], [pjTopo, "dpj_linhas"], [camadas.projP, "dpj_pontos"], [camadas.loc, "localidades"]];
  AREA.forEach(([, n]) => GEO[n].features.forEach(f => f._bb = f._bb || caixa(f.geometry)));

  camadas.perimetro.addTo(mapa); camadas.municipios.addTo(mapa); camadas.snv.addTo(mapa); camadas.sre.addTo(mapa);
  camadas.projL.addTo(mapa); camadas.dorL.addTo(mapa); camadas.projP.addTo(mapa); camadas.dorP.addTo(mapa); camadas.loc.addTo(mapa);
  camadas.satelite = satelite;
  camadas.rotVias = L.layerGroup().addTo(mapa);      // GO-xxx / BR-xxx
  camadas.rotMun = L.layerGroup().addTo(mapa);       // nomes dos municípios
  camadas.rotLotes = L.layerGroup();                 // números dos lotes
  camadas.grade = L.layerGroup().addTo(mapa);        // grade de coordenadas
  GEO.lotes.features.forEach(f => camadas.rotLotes.addLayer(L.marker(centro(f.geometry), { interactive: false, pane: "rotulos",
    icon: L.divIcon({ className: "rot-lote", html: "Lote " + esc(f.properties.lote), iconSize: null }) })));
  GEO.municipios.features.forEach(f => f._centro = centro(f.geometry));   // nomes: criados por área em preencheArea
  L.control.zoom({ position: "topleft", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar" }).addTo(mapa);
  const Norte = L.Control.extend({ options: { position: "topright" },
    onAdd() { const d = L.DomUtil.create("div", "norte"); d.title = "Norte";
      d.innerHTML = `<svg viewBox="0 0 40 56" width="34" height="48"><polygon points="20,4 30,40 20,33 10,40" fill="#222"/>
        <polygon points="20,4 20,33 10,40" fill="#fff" stroke="#222" stroke-width="1.2"/>
        <text x="20" y="54" text-anchor="middle" font-size="13" font-weight="bold" font-family="Arial" fill="#222">N</text></svg>`;
      return d; } });
  new Norte().addTo(mapa);
  painelCamadas();
  L.control.scale({ metric: true, imperial: false }).addTo(mapa);
  const EscNum = L.Control.extend({ options: { position: "topleft" },
    onAdd() { this._d = L.DomUtil.create("div", "escala-num"); return this._d; } });
  const en = new EscNum().addTo(mapa);
  const atualizaEsc = () => {
    const c = mapa.getCenter(), mpp = 156543.03392 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, mapa.getZoom());
    en._d.textContent = "ESCALA 1:" + br(Math.round(mpp * 96 / 0.0254 / 1000) * 1000, 0);
  };
  mapa.on("zoomend moveend", atualizaEsc);
  const Volta = L.Control.extend({ options: { position: "topleft" },
    onAdd() { const b = L.DomUtil.create("button", "btn-mapa"); b.textContent = "⤢ Município"; b.title = "Voltar ao município";
      L.DomEvent.on(b, "click", e => { L.DomEvent.stop(e); enquadra(); }); return b; } });
  new Volta().addTo(mapa);
  // rótulos só quando o zoom muda; arrastar só redesenha a grade (13/11/2026: arrasto ficava lento)
  mapa.on("zoomend", atualizaRotulos);
  mapa.on("moveend", () => { if (mapa.hasLayer(camadas.grade)) desenhaGrade(); });
}

/* ---------- desenhar só a área do município (13/11/2026: desempenho) ---------- */
function caixa(g) {                        // [xmin, ymin, xmax, ymax] de qualquer geometria
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const vai = c => { if (typeof c[0] === "number") { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }
    else c.forEach(vai); };
  if (g && g.coordinates) vai(g.coordinates);
  return [x0, y0, x1, y1];
}
function preencheArea() {
  // seleção + uma margem de meia largura em cada lado (pega os vizinhos e o que o enquadramento mostra)
  const b = BBOX, mx = Math.max(b[2] - b[0], b[3] - b[1]) * 0.6;
  const z = [b[0] - mx, b[1] - mx, b[2] + mx, b[3] + mx];
  const dentroZ = bb => !(bb[2] < z[0] || bb[0] > z[2] || bb[3] < z[1] || bb[1] > z[3]);
  AREA.forEach(([lyr, n]) => { lyr.clearLayers(); lyr.addData({ type: "FeatureCollection", features: GEO[n].features.filter(f => dentroZ(f._bb)) }); });
  camadas.rotMun.clearLayers();
  GEO.municipios.features.filter(f => dentroZ(f._bb)).forEach(f => {
    const mk = L.marker(f._centro, { interactive: false, pane: "rotulos",
      icon: L.divIcon({ className: "rot-mun", html: esc(f.properties.nome), iconSize: null }) });
    mk._cod = f.properties.cod; camadas.rotMun.addLayer(mk);
  });
  faixaRot = null;                         // força atualizar os rótulos das localidades novas
}

/* ---------- rótulos, grade, painel de camadas e busca no mapa ---------- */
const ROT = { vias: true, mun: true, loc: true, lotes: false };
function centro(g) {                       // centro do maior anel (média ponderada pela área)
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let best = null, ba = -1;
  polys.forEach(p => { const r = p[0]; let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const k = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k; }
    if (Math.abs(a) > ba) { ba = Math.abs(a); best = a ? [cy / (3 * a), cx / (3 * a)] : [r[0][1], r[0][0]]; } });
  return best;
}
function dentro(pt, g) {                   // ponto [lon, lat] dentro do polígono (raio)
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(p => { let d = false; const r = p[0];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < (r[j][0] - r[i][0]) * (pt[1] - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) d = !d;
    return d; });
}
function linhas(g) { return g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : []; }
function meio(g) {                         // ponto no meio da linha mais longa + comprimento
  let best = null, bl = -1;
  linhas(g).forEach(c => { let l = 0; for (let i = 1; i < c.length; i++) l += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
    if (l > bl) { bl = l; let h = l / 2, k = 1; for (; k < c.length; k++) { const s = Math.hypot(c[k][0] - c[k - 1][0], c[k][1] - c[k - 1][1]); if (h <= s) break; h -= s; }
      const a = c[k - 1] || c[0], b = c[k] || a, s = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; best = [a[0] + (b[0] - a[0]) * h / s, a[1] + (b[1] - a[1]) * h / s]; } });
  return [best, bl];
}
// rótulos das rodovias da seleção: um por rodovia (GO e BR), no trecho mais longo dentro dos municípios selecionados
function montaRotulosVias(cods) {
  camadas.rotVias.clearLayers();
  const gms_ = GEO.municipios.features.filter(f => cods.includes(f.properties.cod)).map(f => f.geometry), b = BBOX;
  const melhor = {};
  const avalia = (chave, g, tipo) => { const [p, l] = meio(g); if (!p || p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3] || !gms_.some(gm => dentro(p, gm))) return;
    if (!melhor[chave] || melhor[chave].l < l) melhor[chave] = { p, l, tipo }; };
  GEO.sre.features.forEach(f => f.properties.go && avalia("GO-" + f.properties.go, f.geometry, "go"));
  GEO.snv_federal.features.forEach(f => f.properties.br && avalia("BR-" + String(f.properties.br).padStart(3, "0"), f.geometry, "br"));
  Object.entries(melhor).forEach(([t, v]) => camadas.rotVias.addLayer(L.marker([v.p[1], v.p[0]], { interactive: false, pane: "rotulos",
    icon: L.divIcon({ className: "rot-via rot-" + v.tipo, html: esc(t), iconSize: null }) })));
}
let faixaRot = null;
function atualizaRotulos() {
  if (!mapa) return;
  const z = mapa.getZoom();
  // localidades: sedes a partir do zoom 9, demais a partir do 11 — só mexe quando muda a faixa de zoom ou as opções
  const faixa = [z >= 9, z >= 11, ROT.loc, mapa.hasLayer(camadas.loc)].join();
  if (faixa !== faixaRot) {
    faixaRot = faixa;
    camadas.loc.eachLayer(l => { const t = l.getTooltip(); if (!t) return;
      const sede = /Sede|Capital/.test(l.feature.properties.t);
      (ROT.loc && mapa.hasLayer(camadas.loc) && z >= (sede ? 9 : 11)) ? (t.options.permanent = true, l.openTooltip()) : l.closeTooltip(); });
  }
  ROT.vias ? mapa.addLayer(camadas.rotVias) : mapa.removeLayer(camadas.rotVias);
  ROT.lotes ? mapa.addLayer(camadas.rotLotes) : mapa.removeLayer(camadas.rotLotes);
  if (ROT.mun && z >= 8) { mapa.addLayer(camadas.rotMun);
    camadas.rotMun.eachLayer(m => { const el = m.getElement(); if (el) el.classList.toggle("atual", SEL.includes(m._cod)); });
  } else mapa.removeLayer(camadas.rotMun);
  if (mapa.hasLayer(camadas.grade)) desenhaGrade();
}
// grade de coordenadas (graus e minutos), com rótulos nas bordas do mapa
function gms(v, eixo) {
  const h = eixo === "lat" ? (v < 0 ? "S" : "N") : (v < 0 ? "W" : "E"), a = Math.abs(v);
  let g = Math.floor(a + 1e-9), m = Math.round((a - g) * 60); if (m === 60) { g++; m = 0; }
  return `${g}°${m ? String(m).padStart(2, "0") + "'" : ""}${h}`;
}
function desenhaGrade() {
  camadas.grade.clearLayers();
  const b = mapa.getBounds(), span = Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth());
  const passo = [10, 5, 2, 1, 0.5, 1 / 3, 0.25, 1 / 6, 1 / 12, 1 / 20, 1 / 30, 1 / 60].find(p => span / p >= 3) || 1 / 60;
  const est = { color: "#ffffff", weight: 0.8, opacity: 0.75, dashArray: "4 4", interactive: false, pane: "rotulos" };
  const n0 = Math.ceil(b.getSouth() / passo) * passo, e0 = Math.ceil(b.getWest() / passo) * passo;
  for (let y = n0; y <= b.getNorth(); y += passo) {
    camadas.grade.addLayer(L.polyline([[y, b.getWest() - 1], [y, b.getEast() + 1]], est));
    camadas.grade.addLayer(L.marker([y, b.getWest()], { interactive: false, pane: "rotulos",
      icon: L.divIcon({ className: "rot-grade rot-grade-y", html: gms(y, "lat"), iconSize: null }) }));
  }
  for (let x = e0; x <= b.getEast(); x += passo) {
    camadas.grade.addLayer(L.polyline([[b.getSouth() - 1, x], [b.getNorth() + 1, x]], est));
    camadas.grade.addLayer(L.marker([b.getSouth(), x], { interactive: false, pane: "rotulos",
      icon: L.divIcon({ className: "rot-grade rot-grade-x", html: gms(x, "lon"), iconSize: null }) }));
  }
}
function painelCamadas() {
  const itens = [["Camadas"],
    ["sre", "SRE – " + A.rotulo], ["dorL", "Obras"], ["dorP", "Obras pontuais"], ["projL", "Projetos"], ["projP", "Projetos pontuais"],
    ["snv", "SNV – rodovias federais"], ["loc", "Localidades"], ["perimetro", "Perímetro urbano"],
    ["municipios", "Limites municipais"], ["lotes", "Lotes de manutenção"], ["grade", "Grade de coordenadas"],
    ["satelite", "Imagem de satélite"],
    ["Rótulos"], ["r:vias", "Rodovias (GO / BR)"], ["r:mun", "Municípios"], ["r:loc", "Localidades"], ["r:lotes", "Lotes"]];
  // painel fora do mapa (logo abaixo dele): no mapa ficam só os elementos da visualização
  const d = document.getElementById("camadas"), grupos = [];
  itens.forEach(([k, t]) => t === undefined ? grupos.push({ tit: k, l: [] }) : grupos[grupos.length - 1].l.push([k, t]));
  d.innerHTML = grupos.map(g => `<div class="camadas-grp"><span class="camadas-tit">${g.tit}:</span>` +
    g.l.map(([k, t]) => `<label><input type="checkbox" data-k="${k}" ${k.startsWith("r:") ? (ROT[k.slice(2)] ? "checked" : "") : (mapa.hasLayer(camadas[k]) ? "checked" : "")}> ${t}</label>`).join("") +
    `</div>`).join("");
  d.querySelectorAll("input").forEach(cb => cb.onchange = () => {
    const k = cb.dataset.k;
    if (k.startsWith("r:")) ROT[k.slice(2)] = cb.checked;
    else cb.checked ? mapa.addLayer(camadas[k]) : mapa.removeLayer(camadas[k]);
    if (k === "grade" && cb.checked) desenhaGrade();
    atualizaRotulos();
  });
}
function autocompleta(input, aoEscolher) {        // lista de sugestões própria (funciona igual no celular)
  const lista = document.createElement("ul"); lista.className = "sugestoes"; input.parentNode.appendChild(lista);
  let sel = -1, itens = [];
  const fecha = () => { lista.innerHTML = ""; lista.style.display = "none"; sel = -1; };
  const marca = () => lista.querySelectorAll("li").forEach((li, i) => li.classList.toggle("ativo", i === sel));
  input.addEventListener("input", () => {
    const t = semAcento(input.value); if (!t) return fecha();
    itens = LISTA.filter(c => semAcento(A.municipios[c].nome).includes(t))
      .sort((a, b) => semAcento(A.municipios[b].nome).startsWith(t) - semAcento(A.municipios[a].nome).startsWith(t)).slice(0, 12);
    lista.innerHTML = itens.length ? itens.map(c => `<li data-c="${c}">${esc(A.municipios[c].nome)}</li>`).join("") : `<li class="nada">Nenhum município encontrado</li>`;
    lista.style.display = "block"; sel = itens.length ? 0 : -1; marca();
  });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { sel = Math.min(itens.length - 1, sel + 1); marca(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); marca(); e.preventDefault(); }
    else if (e.key === "Enter") { const c = itens[sel] || procura(input.value); if (c) { aoEscolher(c); input.value = ""; fecha(); input.blur(); } }
    else if (e.key === "Escape") fecha();
  });
  lista.addEventListener("mousedown", e => { const li = e.target.closest("li[data-c]"); if (li) { e.preventDefault(); aoEscolher(li.dataset.c); input.value = ""; fecha(); input.blur(); } });
  input.addEventListener("blur", () => setTimeout(fecha, 150));
}
function enquadra(b = BBOX) {
  mapa.invalidateSize();
  mapa.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [18, 18] });
}
function destacaMunicipios(cods) {
  if (camadas.mascara) mapa.removeLayer(camadas.mascara);
  if (camadas.contorno) mapa.removeLayer(camadas.contorno);
  const fs = GEO.municipios.features.filter(x => cods.includes(x.properties.cod));
  const aneis = [];
  fs.forEach(f => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
    .forEach(p => aneis.push(p[0].map(([x, y]) => [y, x]))));
  // fora da seleção: fundo claro (como o recorte do atlas); dentro: satélite
  camadas.mascara = L.polygon([[[-90, -180], [-90, 180], [90, 180], [90, -180]], ...aneis], {
    pane: "mascara", stroke: false, ...estiloMascara(), interactive: false }).addTo(mapa);
  camadas.contorno = L.geoJSON({ type: "FeatureCollection", features: fs }, { pane: "vias",
    style: { color: "#ffd400", weight: 4, fill: false }, interactive: false }).addTo(mapa);
}
function destacaTrecho(sre) {
  if (camadas.sel) mapa.removeLayer(camadas.sel);
  const fs = GEO.sre.features.filter(f => f.properties.sre === sre);
  if (!fs.length) return;
  camadas.sel = L.geoJSON({ type: "FeatureCollection", features: fs }, { pane: "topo",
    style: { color: "#00e5ff", weight: 9, opacity: 0.75 }, interactive: false }).addTo(mapa);
  const b = camadas.sel.getBounds(), m = BBOX;
  const mb = L.latLngBounds([[m[1], m[0]], [m[3], m[2]]]);
  mapa.fitBounds(mb.intersects(b) ? L.latLngBounds(b.getSouthWest(), b.getNorthEast()) : b, { padding: [40, 40], maxZoom: 13 });
  document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------------- seleção: um ou vários municípios (13/11/2026) ---------------- */
function seleciona(cod, hist = true) { selecionaLista([cod], hist); }
// adiciona/remove um município da seleção (modo Combinar, Ctrl+clique ou busca no modo Combinar)
function alterna(cod, soAdiciona = false) {
  if (SEL.includes(cod)) { if (soAdiciona || SEL.length === 1) return; selecionaLista(SEL.filter(c => c !== cod)); }
  else selecionaLista([...SEL, cod]);
}
const nomeLista = ns => ns.length === 1 ? ns[0] : ns.slice(0, -1).join(", ") + " e " + ns[ns.length - 1];
function selecionaLista(cods, hist = true) {
  SEL = [...new Set(cods)].filter(c => A.municipios[c]); if (!SEL.length) return;
  atual = SEL[0];
  const multi = SEL.length > 1, ms = SEL.map(c => A.municipios[c]);
  BBOX = ms.reduce((b, m) => [Math.min(b[0], m.bbox[0]), Math.min(b[1], m.bbox[1]), Math.max(b[2], m.bbox[2]), Math.max(b[3], m.bbox[3])],
    [1e9, 1e9, -1e9, -1e9]);
  M = multi ? agrega(SEL) : ms[0];
  if (hist) history.replaceState(null, "", "#" + SEL.join(","));
  const nomes = ms.map(m => m.nome), curto = multi && SEL.length > 3 ? `${SEL.length} municípios` : nomeLista(nomes);
  document.title = `${multi ? curto : nomes[0] + "/GO"} – Atlas SRE Municípios`;
  $("#titulo").textContent = multi ? curto : nomes[0];
  document.querySelector(".cab-titulo").classList.toggle("multi", multi);
  document.querySelectorAll(".nome-up").forEach(e => e.textContent = (multi ? curto : nomes[0]).toUpperCase());
  document.querySelectorAll(".no-mun").forEach(e => e.textContent = multi ? "NOS MUNICÍPIOS DE " + nomeLista(nomes).toUpperCase()
    : "NO MUNICÍPIO DE " + nomes[0].toUpperCase());
  $("#q").value = ""; $("#q").placeholder = COMB ? "Somar outro município…" : (multi ? "Buscar município…" : nomes[0] + " — buscar outro município…");
  $("#pag").textContent = multi ? `${SEL.length} municípios selecionados` : `Página ${ms[0].ordem} de ${LISTA.length}`;
  if (camadas.sel) { mapa.removeLayer(camadas.sel); camadas.sel = null; }
  preencheArea(); destacaMunicipios(SEL); montaRotulosVias(SEL); enquadra(); atualizaRotulos();
  cartoes(M); grafSituacao(M); grafRodovia(M); grafUrbano(M); grafPeso(SEL, M); grafTipoObra(M);
  tabelaObras(M, multi); tabelaSRE(M, multi); comparacao(); barraSelecao();
  $("#notas").textContent = (M.notas || "").replace(/\\n/g, "\n");
}

// soma dos municípios selecionados — trechos, obras e projetos que cruzam a divisa entre eles contam uma vez só
function somaDic(lista) { const o = {}; lista.forEach(d => Object.entries(d || {}).forEach(([k, v]) => o[k] = (o[k] || 0) + v)); return o; }
function somaDic2(lista) { const o = {}; lista.forEach(d => Object.entries(d || {}).forEach(([k, r]) => o[k] = somaDic([o[k], r]))); return o; }
function agrega(cods) {
  const ms = cods.map(c => A.municipios[c]), comNome = (rows, m) => (rows || []).map(r => ({ ...r, _mun: m.nome }));
  const s = somaDic(ms.map(m => m.situacao)), tot = soma(s), pav = (s.PAV || 0) + (s.DUP || 0), eop = s.EOP || 0;
  const area = ms.reduce((a, m) => a + (m.area_km2 || 0), 0);
  const un = k => new Set(ms.flatMap(m => m[k] || [])).size;
  const go = somaDic2(ms.map(m => m.go_situacao)), nr = Object.values(go).filter(r => soma(r) > 0).length;
  const fx = ms.reduce((a, m) => a + (m.faixa_ha || 0), 0), G = A.goias;
  const pc1 = v => tot ? br(100 * v / tot) + "%" : "–";
  const nomes = ms.map(m => m.nome);
  return {
    nome: nomeLista(nomes), rot: "Seleção", multi: true, area_km2: area,
    situacao: s, go_situacao: go, urbano_situacao: somaDic2(ms.map(m => m.urbano_situacao)), peso: somaDic2(ms.map(m => m.peso)),
    c1_val: km2(tot), c1_sub: `${un("ids")} trechos  |  ${nr} rodovia${nr === 1 ? "" : "s"}`,
    c2_val: pc1(pav), c2_sub: `Goiás: ${br(G.idx_pav ?? 100 * ((G.situacao.PAV || 0) + (G.situacao.DUP || 0)) / G.total)}%`,
    c3_val: pc1(pav + eop), c3_sub: eop > 0 ? `${km2(eop)} em obras` : "0 Km em obras",
    c4_val: area ? br(1000 * tot / area) : "–", c4_sub: `Km/1.000 Km²  |  GO: ${br(G.dens ?? 0)}`,
    c5_val: br(fx, 2) + " ha", c5_sub: `${un("fx")} trechos  |  ${un("dc")} c/ decreto`,
    obras: ms.flatMap(m => comNome(m.obras, m)).sort((a, b) => (a.natureza !== "Obra") - (b.natureza !== "Obra") || String(a.mapa).localeCompare(String(b.mapa))),
    trechos: ms.flatMap(m => comNome(m.trechos, m)),
    notas: `• Seleção de ${ms.length} municípios: ${nomeLista(nomes)}.\n` +
      `• Base: SRE-GO ${A.rotulo} recortado pelos limites municipais; extensões medidas sobre o elipsoide GRS80 (SIRGAS 2000).\n` +
      `• Somas: Km, área e faixa de domínio somados; trechos, obras e projetos que cruzam a divisa entre municípios selecionados contam uma vez só (os Km de cada parte se somam).\n` +
      `• Índice de pavimentação, "após as obras" e densidade recalculados sobre o total da seleção (área somada: ${br(area, 2)} Km²).\n` +
      `• Totais e gráficos: só trechos estaduais principais; o quadro também lista os trechos coincidentes e federais.\n` +
      `• Obras e projetos: cadastros de 12/11/2026; no mapa, o projeto aparece inteiro.`
  };
}

// obras/projetos por tipo a partir das linhas do quadro (obra/projeto que aparece em 2 municípios conta uma vez)
function tipoDeObras(rows) {
  const t = { Obra: { lineares: {}, pontuais: {} }, Projeto: { lineares: {}, pontuais: {} } }, vistos = new Set();
  (rows || []).forEach(r => { const T = t[r.natureza]; if (!T) return;
    if (r.tipo === "Trecho") { const x = T.lineares[r.intervencao] = T.lineares[r.intervencao] || { n: 0, km: 0, cods: new Set() };
      if (!x.cods.has(r.codigo)) { x.cods.add(r.codigo); x.n++; } x.km += r.km_mun || 0; }
    else if (!vistos.has(r.natureza + r.codigo)) { vistos.add(r.natureza + r.codigo); T.pontuais[r.intervencao] = (T.pontuais[r.intervencao] || 0) + 1; } });
  return t;
}

/* ---------- barra da seleção (chips) e modo Combinar ---------- */
function barraSelecao() {
  const b = $("#selecao"), multi = SEL.length > 1;
  b.hidden = !(COMB || multi);
  $("#combinar").classList.toggle("ativo", COMB);
  $("#combinar").setAttribute("aria-pressed", COMB);
  if (b.hidden) return;
  b.innerHTML = `<span class="sel-tit">${COMB ? "Modo combinar: clique no mapa para somar ou tirar municípios." : "Seleção:"}</span>` +
    SEL.map(c => `<span class="chip" title="${esc(A.municipios[c].nome)}">${esc(A.municipios[c].nome)}` +
      (multi ? `<button type="button" data-c="${c}" aria-label="Tirar ${esc(A.municipios[c].nome)} da seleção">×</button>` : "") + `</span>`).join("") +
    (multi ? `<span class="sel-tot">Total: <b>${esc(M.c1_val)}</b></span>` +
      `<button type="button" class="sel-btn" id="sel-comp">Ver comparação ↓</button>` +
      `<button type="button" class="sel-btn" id="sel-copiar" title="Copiar o link desta seleção">Copiar link</button>` +
      `<button type="button" class="sel-btn" id="sel-limpar">Limpar seleção</button>` : "");
  b.querySelectorAll(".chip button").forEach(x => x.onclick = () => alterna(x.dataset.c));
  if (multi) {
    $("#sel-limpar").onclick = () => selecionaLista([SEL[0]]);
    $("#sel-comp").onclick = () => $("#comp").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#sel-copiar").onclick = () => { const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject())
      .then(() => { $("#sel-copiar").textContent = "Link copiado ✓"; setTimeout(() => $("#sel-copiar") && ($("#sel-copiar").textContent = "Copiar link"), 1800); })
      .catch(() => prompt("Copie o link:", u)); };
  }
}
$("#combinar").onclick = () => { if (!A) return; COMB = !COMB; barraSelecao();
  $("#q").placeholder = COMB ? "Somar outro município…" : (SEL.length > 1 ? "Buscar município…" : A.municipios[atual].nome + " — buscar outro município…"); };

/* ---------- comparação entre os municípios selecionados ---------- */
function linhaComp(c) {
  const m = A.municipios[c], s = m.situacao || {}, tot = soma(s), pav = (s.PAV || 0) + (s.DUP || 0), t = tipoDeObras(m.obras);
  const n = o => Object.values(o.lineares).reduce((a, x) => a + x.n, 0), k = o => Object.values(o.lineares).reduce((a, x) => a + x.km, 0);
  const p = o => soma(o.pontuais);
  return { cod: c, nome: m.nome, ext: tot, ip: tot ? 100 * pav / tot : null, ipos: tot ? 100 * (pav + (s.EOP || 0)) / tot : null,
    dens: m.area_km2 ? 1000 * tot / m.area_km2 : null, fx: m.faixa_ha || 0, area: m.area_km2,
    ob_n: n(t.Obra), ob_km: k(t.Obra), ob_p: p(t.Obra), pj_n: n(t.Projeto), pj_km: k(t.Projeto), pj_p: p(t.Projeto), s };
}
function comparacao() {
  const el = $("#comp");
  if (SEL.length < 2) { el.hidden = true; return; }
  el.hidden = false;
  const L_ = SEL.map(linhaComp), mx = k => Math.max(1e-9, ...L_.map(l => l[k] || 0));
  const barra = (v, max, cor, txt) => `<div class="cbar"><b style="width:${Math.max(0, Math.min(100, 100 * (v || 0) / max))}%;background:${cor}"></b><span>${txt}</span></div>`;
  $("#comp-graf").innerHTML = cab("Extensão por situação, por município", "Km no município (estaduais principais)") +
    empilhado(L_.filter(l => l.ext > 0).map(l => ({ rot: l.nome, r: l.s })), 760);
  const mExt = mx("ext"), mDens = mx("dens"), mFx = mx("fx");
  const t = tabela($("#t-comp"), [
    { k: "nome", t: "Município" },
    { k: "ext", t: "Extensão (Km)", f: v => barra(v, mExt, "#e31a1c", br(v, 2)) },
    { k: "ip", t: "Índice de pav.", f: v => v === null ? "–" : barra(v, 100, "#7a0a0d", br(v) + "%") },
    { k: "ipos", t: "Após obras de pav.", f: v => v === null ? "–" : barra(v, 100, "#f7a8a9", br(v) + "%") },
    { k: "dens", t: "Densidade (Km/1.000 Km²)", f: v => v === null ? "–" : barra(v, mDens, "#2f6db5", br(v)) },
    { k: "fx", t: "Faixa de domínio (ha)", f: v => barra(v, mFx, "#138a72", br(v, 2)) },
    { k: "ob_n", t: "Obras", f: (v, l) => v || l.ob_p ? `${v} · ${km2(l.ob_km)}${l.ob_p ? ` + ${l.ob_p} pontual${l.ob_p > 1 ? "is" : ""}` : ""}` : "–" },
    { k: "pj_n", t: "Projetos", f: (v, l) => v || l.pj_p ? `${v} · ${km2(l.pj_km)}${l.pj_p ? ` + ${l.pj_p} pontual${l.pj_p > 1 ? "is" : ""}` : ""}` : "–" }
  ], L_, "", l => { const b = A.municipios[l.cod].bbox; enquadra(b); $("#mapa").scrollIntoView({ behavior: "smooth", block: "center" }); });
  const T = tipoDeObras(M.obras), nn = o => Object.values(o.lineares).reduce((a, x) => a + x.n, 0), kk = o => Object.values(o.lineares).reduce((a, x) => a + x.km, 0);
  $("#comp-tot").innerHTML = `<b>Total da seleção:</b> ${esc(M.c1_val)} · índice de pavimentação ${esc(M.c2_val)} · após as obras ${esc(M.c3_val)} · ` +
    `densidade ${esc(M.c4_val)} Km/1.000 Km² · faixa ${esc(M.c5_val)} · obras ${nn(T.Obra)} (${km2(kk(T.Obra))}) · projetos ${nn(T.Projeto)} (${km2(kk(T.Projeto))}). ` +
    `<span class="g-sub">Clique numa linha para ver o município no mapa; clique no título da coluna para ordenar.</span>`;
  return t;
}

/* ---------------- cartões ---------------- */
function cartoes(m) {
  const tit = [m.multi ? "EXTENSÃO NA SELEÇÃO" : "EXTENSÃO NO MUNICÍPIO", "ÍNDICE DE PAVIMENTAÇÃO", "APÓS AS OBRAS DE PAVIMENTAÇÃO", "DENSIDADE RODOVIÁRIA", "FAIXA DE DOMÍNIO"];
  $("#cartoes").innerHTML = tit.map((t, i) => `<div class="cartao">
      <div class="cartao-tit">${t}</div><img src="img/c${i + 1}.svg" alt="">
      <div class="cartao-val">${esc(m[`c${i + 1}_val`])}</div>
      <div class="cartao-sub">${esc(m[`c${i + 1}_sub`])}</div></div>`).join("");
}

/* ---------------- gráficos (SVG) ---------------- */
const SEM = "Sem trechos estaduais do SRE no município";
function cab(t, s) { return `<div class="g-tit">${t}</div>` + (s ? `<div class="g-sub">${s}</div>` : ""); }
function textW(t, fs) { return String(t).length * fs * 0.55; }

function barrasH(itens, tot) {             // [{rot, v, cor, tip}]
  const vmax = Math.max(...itens.map(i => i.v)), lw = Math.max(...itens.map(i => textW(i.rot, 11))) + 8;
  const W = 300, bh = 18, gap = 8, H = itens.length * (bh + gap) + 18, x0 = lw, bw = (W - x0) / 2.1;  // folga p/ "000,00 Km (00,0%)"
  let s = `<svg class="graf" viewBox="0 0 ${W} ${H}">`;
  for (const t of ticks(vmax * 2.1)) {
    const x = x0 + bw * t / vmax; if (x > W) continue;
    s += `<line x1="${x}" x2="${x}" y1="0" y2="${H - 16}" stroke="#c4c3bb" stroke-width=".6"/>` +
         `<text x="${x}" y="${H - 4}" font-size="9" fill="#898781" text-anchor="middle">${br(t, t >= 1 || t === 0 ? 0 : 1)}</text>`;
  }
  itens.forEach((it, i) => {
    const y = i * (bh + gap) + 2, w = Math.max(1, bw * it.v / vmax);
    s += `<text x="${x0 - 6}" y="${y + bh / 2 + 4}" font-size="11" fill="#52514e" text-anchor="end">${esc(it.rot)}</text>` +
         `<rect class="hov" x="${x0}" y="${y}" width="${w}" height="${bh}" fill="${it.cor}" data-tip="${esc(it.tip)}"/>` +
         `<text x="${x0 + w + 5}" y="${y + bh / 2 + 4}" font-size="10.5" fill="#0b0b0b">${km2(it.v)}${tot ? `  (${br(100 * it.v / tot)}%)` : ""}</text>`;
  });
  return s + `<line x1="${x0}" x2="${x0}" y1="0" y2="${H - 16}" stroke="#8f8e86" stroke-width=".8"/></svg>`;
}
function ticks(max) {
  const p = Math.pow(10, Math.floor(Math.log10(max / 4))), passo = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => max / k <= 5);
  const r = []; for (let v = 0; v <= max; v += passo) r.push(+v.toFixed(6)); return r;
}
function empilhado(linhas, W = 300) {      // [{rot, r:{sit:km}}]; W maior = gráfico largo sem ampliar as letras
  const tots = linhas.map(l => soma(l.r)), vmax = Math.max(...tots);
  const lw = Math.max(...linhas.map(l => textW(l.rot, 11))) + 8;
  const bh = 18, gap = 8, H = linhas.length * (bh + gap) + 18, x0 = lw, bw = (W - x0) / 1.3;
  let s = `<svg class="graf" viewBox="0 0 ${W} ${H}">`;
  for (const t of ticks(vmax * 1.3)) {
    const x = x0 + bw * t / vmax; if (x > W) continue;
    s += `<line x1="${x}" x2="${x}" y1="0" y2="${H - 16}" stroke="#c4c3bb" stroke-width=".6"/>` +
         `<text x="${x}" y="${H - 4}" font-size="9" fill="#898781" text-anchor="middle">${br(t, 0)}</text>`;
  }
  linhas.forEach((l, i) => {
    const y = i * (bh + gap) + 2; let x = x0;
    s += `<text x="${x0 - 6}" y="${y + bh / 2 + 4}" font-size="11" fill="#52514e" text-anchor="end">${esc(l.rot)}</text>`;
    for (const c of ORD) {
      const v = l.r[c]; if (!v) continue;
      const w = bw * v / vmax;
      s += `<rect class="hov" x="${x}" y="${y}" width="${w}" height="${bh}" fill="${SIT[c][1]}" stroke="#fff" stroke-width=".8"
              data-tip="<b>${esc(l.rot)}</b><br>${SIT[c][0]}: ${km2(v)} (${br(100 * v / tots[i])}%)"/>`;
      if (w > textW(br(v, 2), 9.5) + 6) s += `<text x="${x + w / 2}" y="${y + bh / 2 + 3.5}" font-size="9.5" text-anchor="middle" pointer-events="none"
              fill="${BRANCO.has(c) ? "#fff" : "#0b0b0b"}">${br(v, 2)}</text>`;
      x += w;
    }
    s += `<text x="${x + 5}" y="${y + bh / 2 + 4}" font-size="10.5" fill="#0b0b0b">${km2(tots[i])}</text>`;
  });
  s += `<line x1="${x0}" x2="${x0}" y1="0" y2="${H - 16}" stroke="#8f8e86" stroke-width=".8"/></svg>`;
  const usados = ORD.filter(c => linhas.some(l => l.r[c]));
  return s + `<div class="leg-g">${usados.map(c => `<span><i style="background:${SIT[c][1]}"></i>${SIT[c][0]}</span>`).join("")}</div>`;
}
function grafSituacao(m) {
  const S = Object.fromEntries(Object.entries(m.situacao).filter(([, v]) => v > 0)), tot = soma(S);
  if (!tot) { $("#g1").innerHTML = cab("Extensão por situação") + `<div class="g-vazio">${SEM}</div>`; return; }
  const it = Object.keys(S).sort((a, b) => S[b] - S[a]).map(c => ({ rot: SIT[c][0], v: S[c], cor: SIT[c][1],
    tip: `<b>${SIT[c][0]}</b><br>${km2(S[c])} · ${br(100 * S[c] / tot)}% da malha estadual no município` }));
  $("#g1").innerHTML = cab("Extensão por situação", `Km no município e % do total (${km2(tot)})`) + barrasH(it, tot);
}
function grafRodovia(m) {
  const gos = Object.entries(m.go_situacao).filter(([, r]) => soma(r) > 0).sort((a, b) => soma(b[1]) - soma(a[1]));
  $("#g2").innerHTML = !gos.length ? cab("Extensão por rodovia e situação") + `<div class="g-vazio">${SEM}</div>` :
    cab("Extensão por rodovia e situação", "Km no município") + empilhado(gos.map(([k, r]) => ({ rot: k, r })));
}
function grafUrbano(m) {
  const ur = ["Rural", "Urbano"].filter(k => soma(m.urbano_situacao[k]) > 0).map(k => ({ rot: k, r: m.urbano_situacao[k] }));
  $("#g3").innerHTML = !ur.length ? cab("Trechos urbanos × rurais") + `<div class="g-vazio">${SEM}</div>` :
    cab("Trechos urbanos × rurais", "Km no município, por situação (perímetro urbano)") + empilhado(ur);
}
// "Tipo de Obra" (igual ao gráfico do layout 04): barras "Obra – X" e "Projeto – X" + texto dos pontuais
function grafTipoObra(m) {
  const t = tipoDeObras(m.obras), O = t.Obra, P = t.Projeto;   // a partir do quadro: vale para 1 ou vários municípios
  const txtP = (titulo, pon) => titulo + ": " + Object.entries(pon).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${n > 1 ? (PLURAL[k] || k.toLowerCase() + "s") : k.toLowerCase()}`).join(" · ");
  let h = cab("Tipo de Obra", "obras e projetos: quantidade e Km no município");
  const barras = [
    ...Object.entries(O.lineares).sort((a, b) => b[1].km - a[1].km).map(([k, v]) => ({ rot: "Obra – " + k, n: v.n, km: v.km, cor: DOR_COR[k] || "#0055d6", nat: "obra" })),
    ...Object.entries(P.lineares).sort((a, b) => b[1].km - a[1].km).map(([k, v]) => ({ rot: "Projeto – " + k, n: v.n, km: v.km, cor: PJ_COR[k] || "#666666", nat: "projeto" }))];
  const temP = Object.keys(O.pontuais).length || Object.keys(P.pontuais).length;
  if (!barras.length && !temP) { $("#g-dor").innerHTML = h + `<div class="g-vazio">Sem obras e projetos<br>para o município</div>`; return; }
  if (barras.length) {
    const vmax = Math.max(1e-9, ...barras.map(b => b.km)), W = 190, bh = 12, H = barras.length * 33;
    h += `<svg class="graf" viewBox="0 0 ${W} ${H}">`;
    barras.forEach((b, i) => {
      const y = i * 33, w = Math.max(2, (W * 0.42) * b.km / vmax), q = `${b.n} ${b.nat}${b.n > 1 ? "s" : ""}`;
      h += `<text x="0" y="${y + 11}" font-size="11" fill="#52514e">${esc(b.rot)}</text>` +
           `<rect class="hov" x="0" y="${y + 15}" width="${w}" height="${bh}" fill="${b.cor}" stroke="#fff" stroke-width="1.2"
              data-tip="<b>${esc(b.rot)}</b><br>${q} · ${km2(b.km)} no município"/>` +
           `<text x="${w + 4}" y="${y + 24.5}" font-size="10" fill="#0b0b0b">${q} · ${km2(b.km)}</text>`;
    });
    h += `</svg>`;
  }
  const rod = [];
  if (Object.keys(O.pontuais).length) rod.push(txtP("Obras pontuais", O.pontuais));
  if (Object.keys(P.pontuais).length) rod.push(txtP("Projetos pontuais", P.pontuais));
  $("#g-dor").innerHTML = h + rod.map(r => `<div class="g-sub" style="margin-top:4px">${esc(r)}</div>`).join("");
}

/* --- comparativo: peso da malha do município no próprio município, no(s) lote(s) e em Goiás --- */
function pc(v) { if (v <= 0) return "0%"; return (v < 0.01 ? "<0,01" : br(v, v >= 1 ? 1 : 2)) + "%"; }
function miniMapa(cods, lts) {
  const todos = GEO.lotes.features; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const anel = g => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
  todos.forEach(f => anel(f.geometry).forEach(p => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
  const kx = Math.cos((y0 + y1) / 2 * Math.PI / 180), S = 200, esc_ = S / Math.max((x1 - x0) * kx, y1 - y0);
  const ox = (S - (x1 - x0) * kx * esc_) / 2, oy = (S - (y1 - y0) * esc_) / 2;
  const P = ([x, y]) => `${(ox + (x - x0) * kx * esc_).toFixed(1)},${(oy + (y1 - y) * esc_).toFixed(1)}`;
  const d = g => anel(g).map(p => p.map(r => "M" + r.map(P).join("L") + "Z").join("")).join("");
  let s = `<svg viewBox="0 0 ${S} ${S}">`;
  todos.forEach(f => { const k = f.properties.lote, meu = lts.includes(k);
    s += `<path class="hov" d="${d(f.geometry)}" fill="${meu ? "#7fcbb9" : "#e3ecf8"}" stroke="${meu ? "#fff" : "#a9bfdf"}" stroke-width=".7"
            data-tip="Lote ${esc(k)}${meu ? (cods.length > 1 ? " — contém a seleção" : " — contém o município") : ""}"/>`; });
  GEO.municipios.features.filter(f => cods.includes(f.properties.cod)).forEach(fm =>
    s += `<path d="${d(fm.geometry)}" fill="${T_MU}" stroke="${T_MU}" stroke-width=".6" pointer-events="none"/>`);
  if (lts.length > 1) todos.filter(f => lts.includes(f.properties.lote)).forEach(f => {
    let mx = 0, my = 0, n = 0; anel(f.geometry).forEach(p => p[0].forEach(c => { mx += c[0]; my += c[1]; n++; }));
    const [x, y] = P([mx / n, my / n]).split(",");
    s += `<text x="${x}" y="${+y + 4}" font-size="12" font-weight="bold" fill="${T_LT}" text-anchor="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(f.properties.lote)}</text>`;
  });
  return s + "</svg>";
}
function grafPeso(cods, m) {
  const ml = m.peso || {}, ms = {};
  Object.values(ml).forEach(r => Object.entries(r).forEach(([s, v]) => ms[s] = (ms[s] || 0) + v));
  const tm = soma(ms);
  let h = cab("Comparativo da composição da malha", "Km por situação (estaduais principais)");
  if (!tm) { $("#g-peso").innerHTML = h + `<div class="g-vazio">${SEM}</div>`; return; }
  const lts = Object.keys(ml).sort((a, b) => soma(ml[b]) - soma(ml[a]));
  const GO = A.goias.situacao, GOt = A.goias.total, LT = A.lotes;
  const sits = ["PAV", "DUP", "EOD", "EOP", "IMP", "LEN"];
  const rl = lts.length === 1 ? "Lote " + lts[0] : "Lotes " + lts.slice(0, -1).join(", ") + " e " + lts[lts.length - 1];
  // barras em Km (layout 04): cada linha mostra a composição da própria malha; extensão total à direita
  const rotM = m.multi ? `Seleção (${cods.length})` : m.nome;
  const linhas = [{ rot: rotM, r: ms, cor: T_MU }, ...lts.map(k => ({ rot: "Lote " + k, r: LT[k] || {}, cor: T_LT })),
    { rot: "Goiás", r: GO, cor: T_GO }];
  const W = 640, x0 = 150, xT = W - 92, bw = xT - x0 - 10, bh = 22, gap = 22;
  let s = `<svg class="graf graf-comp" viewBox="0 0 ${W} ${linhas.length * (bh + gap) + 4}">`;
  s += `<text x="${W - 2}" y="11" font-size="10.5" font-weight="bold" fill="#52514e" text-anchor="end">Extensão total</text>`;
  linhas.forEach((l, i) => {
    const y = 16 + i * (bh + gap), tot = soma(l.r); let x = x0;
    s += `<text x="${x0 - 8}" y="${y + bh / 2 + 4}" font-size="11.5" font-weight="bold" text-anchor="end" style="fill:${l.cor}" fill="${l.cor}">${esc(l.rot)}</text>`;
    for (const c of sits) {
      const v = l.r[c]; if (!v) continue;
      const w = bw * v / tot, rot = km2(v);
      s += `<rect class="hov" x="${x}" y="${y}" width="${Math.max(w, 0.8)}" height="${bh}" fill="${SIT[c][1]}" stroke="#fff" stroke-width=".6"
              data-tip="<b>${esc(l.rot)}</b><br>${SIT[c][0]}: ${rot} (${br(100 * v / tot)}%)"/>`;
      if (w > textW(rot, 9.5) + 8) s += `<text x="${x + w / 2}" y="${y + bh / 2 + 3.5}" font-size="9.5" font-weight="bold" text-anchor="middle" pointer-events="none"
              fill="${BRANCO.has(c) ? "#fff" : "#0b0b0b"}">${rot}</text>`;
      x += w;
    }
    s += `<text x="${xT}" y="${y + bh / 2 + 4}" font-size="11" font-weight="bold" style="fill:${l.cor}" fill="${l.cor}">${km2(tot)}</text>`;
  });
  s += `</svg><div class="leg-g">${sits.map(c => `<span><i style="background:${SIT[c][1]}"></i>${SIT[c][0]}</span>`).join("")}</div>`;
  const nm0 = m.multi ? `Seleção: ${cods.length} municípios` : (m.nome.length <= 22 ? m.nome : m.nome.slice(0, 21) + "…");
  $("#g-peso").innerHTML = h + `<div class="peso"><div class="peso-mapa">${miniMapa(cods, lts)}
        <div class="peso-rot"><span style="color:${T_MU}">${esc(nm0)}</span><br><span style="color:${T_LT}">${esc(rl)}</span><br><span style="color:${T_GO}">Goiás</span></div></div><div>${s}</div></div>`;
}

/* ---------------- tabelas ---------------- */
const num = (v, d) => (v === null || v === undefined || v === "" || isNaN(+v)) ? esc(v ?? "") : br(+v, d);
function tabela(el, cols, linhas, vazio, aoClicar) {
  let ord = null, asc = true, filtro = "";
  const desenha = () => {
    let ls = linhas.filter(l => !filtro || cols.some(c => semAcento(String(l[c.k] ?? "")).includes(filtro)));
    if (ord) ls = [...ls].sort((a, b) => { const x = a[ord], y = b[ord], nx = +x, ny = +y;
      const r = (!isNaN(nx) && !isNaN(ny) && x !== "" && y !== "") ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
      return asc ? r : -r; });
    el.innerHTML = `<thead><tr>${cols.map(c => `<th data-k="${c.k}" class="${ord === c.k ? "ord" + (asc ? " asc" : "") : ""}">${c.t}</th>`).join("")}</tr></thead><tbody>` +
      (ls.length ? ls.map((l, i) => `<tr data-i="${linhas.indexOf(l)}">${cols.map(c => `<td>${c.f ? c.f(l[c.k], l) : esc(l[c.k] ?? "")}</td>`).join("")}</tr>`).join("")
        : `<tr class="vazio"><td colspan="${cols.length}">${vazio}</td></tr>`) + "</tbody>";
    el.querySelectorAll("th").forEach(th => th.onclick = () => { const k = th.dataset.k; asc = ord === k ? !asc : true; ord = k; desenha(); });
    if (aoClicar) el.querySelectorAll("tbody tr[data-i]").forEach(tr => tr.onclick = () => {
      el.querySelectorAll("tr.sel").forEach(x => x.classList.remove("sel")); tr.classList.add("sel"); aoClicar(linhas[+tr.dataset.i]); });
  };
  desenha();
  return { filtra: t => { filtro = semAcento(t); desenha(); } };
}
// cor da tarja do "Mapa" = cor do símbolo no mapa (obra azul por tipo; projeto pela intervenção ou pela placa)
function corTarja(l) {
  if (l.natureza === "Obra") return [l.tipo === "Pontual" ? DOR_PONT : (DOR_COR[l.intervencao] || "#0055d6"), "#fff"];
  if (l.tipo === "Pontual") { const p = PJ_PONT[l.cat] || PJ_PONT.Projeto; return [p[1], p[2]]; }
  return [PJ_COR[l.intervencao] || "#666666", "#fff"];
}
function tabelaObras(m, multi = false) {
  const ls = (m.obras || []).map(l => ({ ...l, _cor: corTarja(l) }));
  tabela($("#t-obras"), [
    ...(multi ? [{ k: "_mun", t: "Município" }] : []),
    { k: "mapa", t: "Mapa", f: (v, l) => `<span class="tarja" style="background:${l._cor[0]};color:${l._cor[1]}">${esc(v)}</span>` },
    { k: "codigo", t: "Código" }, { k: "rodovia", t: "Rodovia" }, { k: "intervencao", t: "Intervenção" },
    { k: "tipo", t: "Tipo" }, { k: "km_mun", t: "Km mun.", f: v => num(v, 2) }, { k: "km_contrato", t: "Km contr.", f: v => num(v, 2) },
    { k: "etapa", t: "Etapa" }, { k: "situacao", t: "Situação" }, { k: "natureza", t: "Natureza" }], ls, "Sem obras e projetos para o município");
}
let tSRE = null;
function tabelaSRE(m, multi = false) {
  $("#filtro").value = "";
  tSRE = tabela($("#t-sre"), [
    ...(multi ? [{ k: "_mun", t: "Município" }] : []),
    { k: "sre", t: "SRE" }, { k: "go", t: "GO" }, { k: "classe", t: "Classe" }, { k: "inicio", t: "Início" }, { k: "fim", t: "Fim" },
    { k: "km_ini", t: "Km inicial", f: v => num(v, 2) }, { k: "km_fim", t: "Km final", f: v => num(v, 2) },
    { k: "ext", t: "Ext. SRE (Km)", f: v => num(v, 2) }, { k: "ext_mun", t: "Ext. no mun. (Km)", f: v => num(v, 2) },
    { k: "pct_mun", t: "% no mun.", f: v => num(v, 1) }, { k: "situacao", t: "Situação" }, { k: "jurisdicao", t: "Jurisdição" },
    { k: "perim_urb", t: "Perím. urb." }], m.trechos || [], "Sem trechos do SRE no município", l => destacaTrecho(l.sre));
}
$("#filtro").addEventListener("input", e => tSRE && tSRE.filtra(e.target.value));

/* ---------------- legenda (mesmos símbolos do mapa) ---------------- */
function legenda() {
  const ln = (cor, w, dash, casing) => `<svg width="34" height="12">${casing ? `<line x1="2" x2="32" y1="6" y2="6" stroke="${casing}" stroke-width="${w + 3}"/>` : ""}
      <line x1="2" x2="32" y1="6" y2="6" stroke="${cor}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/></svg>`;
  const it = (sw, t) => `<div>${sw}<span>${t}</span></div>`;
  $("#legenda").innerHTML =
    `<div class="lg-tit">SRE – ${cap(A.rotulo)}</div>` +
    it(ln("#e31a1c", 5), "Duplicada") + it(ln("#e31a1c", 3), "Pavimentada") + it(ln("#e31a1c", 3, "8 5"), "Em obras de pavimentação") +
    it(ln("#e88000", 3), "Implantada / Leito natural") +
    `<div class="lg-tit">SNV – Rodovias federais</div>` + it(ln("#33a02c", 3), "Federal") +
    `<div class="lg-tit">Obras</div>` +
    Object.entries(DOR_COR).map(([k, c]) => it(ln(c, 5, null, "#ffffff"), k)).join("") +
    it(`<svg width="34" height="14"><circle cx="17" cy="7" r="5.5" fill="${DOR_PONT}" stroke="#fff" stroke-width="2"/></svg>`, "Obras pontuais (ponte, viaduto, bueiro)") +
    `<div class="lg-tit">Projetos</div>` +
    PJ_CLASSES.map(([iv, et]) => it(`<svg width="34" height="12"><line x1="3" x2="31" y1="6" y2="6" stroke="${PJ_COR[iv]}" stroke-width="7" stroke-linecap="round"/>
      <line x1="3" x2="31" y1="6" y2="6" stroke="#fff" stroke-width="2.3" ${et === "Projeto" ? `stroke-linecap="round"` : `stroke-dasharray="5 3.5"`}/></svg>`, `${iv} - ${et}`)).join("") +
    `<div class="lg-tit">Projetos pontuais</div>` +
    Object.entries(PJ_PONT).map(([k, p]) => it(`<img src="${p[0]}" width="18" height="18" alt="" style="margin:0 8px">`, k)).join("") +
    `<div class="lg-tit">Demais</div>` +
    it(`<svg width="34" height="14"><rect x="3" y="2" width="28" height="10" fill="none" stroke="#ffd400" stroke-width="3"/></svg>`, "Limite municipal") +
    it(`<svg width="34" height="14"><rect x="3" y="2" width="28" height="10" fill="#f2d24b" fill-opacity=".3" stroke="#f2d24b"/></svg>`, "Perímetro urbano") +
    it(`<svg width="34" height="14"><circle cx="17" cy="7" r="4" fill="#fff" stroke="#222"/></svg>`, "Localidades");
}

carrega().catch(e => { $("#carregando").textContent = "Erro ao carregar o atlas: " + e.message; console.error(e); });
