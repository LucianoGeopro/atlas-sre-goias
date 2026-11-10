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
const PLURAL = { "Ponte": "pontes", "Viaduto": "viadutos", "Bueiro": "bueiros" };
const T_MU = "#7b3fa0", T_LT = "#138a72", T_GO = "#2f6db5";

const $ = s => document.querySelector(s);
const br = (v, d = 1) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const soma = o => Object.values(o || {}).reduce((a, b) => a + b, 0);

let A, GEO = {}, LISTA = [], atual = null, mapa, camadas = {};

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

/* ---------------- carga ---------------- */
async function carrega() {
  const nomes = ["municipios", "sre", "dor_linhas", "dor_pontos", "perimetro_urbano", "localidades", "snv_federal", "lotes"];
  const [atlas, ...geos] = await Promise.all([fetch("data/atlas.json").then(r => r.json()),
    ...nomes.map(n => fetch(`data/${n}.geojson`).then(r => r.json()))]);
  A = atlas; nomes.forEach((n, i) => GEO[n] = geos[i]);
  LISTA = Object.entries(A.municipios).sort((a, b) => a[1].ordem - b[1].ordem).map(([cod]) => cod);
  autocompleta($("#q"), c => seleciona(c));
  iniciaMapa(); legenda();
  const h = decodeURIComponent(location.hash.slice(1));
  seleciona(A.municipios[h] ? h : LISTA[0], false);
  $("#carregando").remove();
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
window.addEventListener("hashchange", () => { const c = location.hash.slice(1); if (A.municipios[c] && c !== atual) seleciona(c, false); });

/* ---------------- mapa ---------------- */
function estiloSRE(f) {
  const s = f.properties.sit;
  const cor = (s === "IMP" || s === "LEN") ? "#e88000" : s === "PLA" ? "#000000" : "#e31a1c";
  return { color: cor, weight: s === "DUP" || s === "EOD" ? 5 : 3, dashArray: s === "EOP" ? "8 5" : null, opacity: 1 };
}
function iniciaMapa() {
  mapa = L.map("mapa", { preferCanvas: true, zoomSnap: 0.25, attributionControl: true, zoomControl: false });
  const satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18, attribution: "Imagem: Esri, Maxar, Earthstar Geographics", className: "satelite"
  }).addTo(mapa);
  mapa.createPane("rotulos").style.zIndex = 620;
  mapa.getPane("rotulos").style.pointerEvents = "none";
  const st = document.createElement("style"); st.textContent = ".satelite{filter:saturate(.6) brightness(1.02)}";
  document.head.appendChild(st);
  mapa.createPane("mascara").style.zIndex = 390;
  mapa.createPane("vias").style.zIndex = 420;
  mapa.createPane("obras").style.zIndex = 430;
  mapa.createPane("topo").style.zIndex = 440;
  const rnd = L.canvas({ padding: 0.3 });

  camadas.perimetro = L.geoJSON(GEO.perimetro_urbano, { renderer: rnd,
    style: { color: "#f2d24b", weight: 1, fillColor: "#f2d24b", fillOpacity: 0.18 } });
  camadas.municipios = L.geoJSON(GEO.municipios, { renderer: rnd,
    style: { color: "#ffffff", weight: 1, opacity: 0.8, fillOpacity: 0 },
    onEachFeature: (f, l) => {
      l.on("click", () => { if (f.properties.cod !== atual) seleciona(f.properties.cod); });
      l.bindTooltip(f.properties.nome, { sticky: true });
    } });
  camadas.lotes = L.geoJSON(GEO.lotes, { renderer: rnd,
    style: { color: T_LT, weight: 2, fillColor: T_LT, fillOpacity: 0.08, dashArray: "6 4" },
    onEachFeature: (f, l) => l.bindTooltip("Lote " + f.properties.lote, { sticky: true }) });
  camadas.snv = L.geoJSON(GEO.snv_federal, { renderer: rnd, pane: "vias",
    style: { color: "#33a02c", weight: 3 },
    onEachFeature: (f, l) => l.bindTooltip(`BR-${esc(f.properties.br)} · Federal`, { sticky: true }) });
  camadas.sre = L.geoJSON(GEO.sre, { renderer: rnd, pane: "vias", style: estiloSRE,
    onEachFeature: (f, l) => l.bindTooltip(`<b>GO-${esc(f.properties.go)}</b> · ${esc(f.properties.sre)}<br>${SIT[f.properties.sit]?.[0] || esc(f.properties.sit)}`, { sticky: true }) });
  // obras lineares da DOR: contorno branco + cor por tipo (mesma simbologia do layout)
  camadas.dorL = L.layerGroup([
    L.geoJSON(GEO.dor_linhas, { renderer: rnd, pane: "obras", style: { color: "#ffffff", weight: 8, opacity: 0.9 }, interactive: false }),
    L.geoJSON(GEO.dor_linhas, { renderer: rnd, pane: "obras",
      style: f => ({ color: DOR_COR[f.properties.intervencao] || "#0055d6", weight: 5 }),
      onEachFeature: (f, l) => l.bindTooltip(`<b>Obra DOR – ${esc(f.properties.intervencao)}</b><br>${esc(f.properties.rodovia || "")} ${esc(f.properties.codigo || "")}`, { sticky: true }) })
  ]);
  camadas.dorP = L.geoJSON(GEO.dor_pontos, { pane: "topo",
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: "#ffffff", weight: 2, fillColor: "#4e88b9", fillOpacity: 1 }),
    onEachFeature: (f, l) => l.bindTooltip(`<b>Obra DOR – ${esc(f.properties.intervencao)}</b><br>${esc(f.properties.rodovia || "")} ${esc(f.properties.codigo || "")}`) });
  camadas.loc = L.geoJSON(GEO.localidades, { pane: "topo",
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: /Sede|Capital/.test(f.properties.t) ? 4 : 2.5, color: "#222",
      weight: 1, fillColor: "#fff", fillOpacity: 1 }),
    onEachFeature: (f, l) => l.bindTooltip(esc(f.properties.n), { permanent: /Sede|Capital/.test(f.properties.t),
      direction: "right", offset: [5, 0], className: "rot-loc" }) });

  camadas.perimetro.addTo(mapa); camadas.municipios.addTo(mapa); camadas.snv.addTo(mapa); camadas.sre.addTo(mapa);
  camadas.dorL.addTo(mapa); camadas.dorP.addTo(mapa); camadas.loc.addTo(mapa);
  camadas.satelite = satelite;
  camadas.rotVias = L.layerGroup().addTo(mapa);      // GO-xxx / BR-xxx
  camadas.rotMun = L.layerGroup().addTo(mapa);       // nomes dos municípios
  camadas.rotLotes = L.layerGroup();                 // números dos lotes
  camadas.grade = L.layerGroup().addTo(mapa);        // grade de coordenadas
  GEO.lotes.features.forEach(f => camadas.rotLotes.addLayer(L.marker(centro(f.geometry), { interactive: false, pane: "rotulos",
    icon: L.divIcon({ className: "rot-lote", html: "Lote " + esc(f.properties.lote), iconSize: null }) })));
  GEO.municipios.features.forEach(f => {
    const mk = L.marker(centro(f.geometry), { interactive: false, pane: "rotulos",
      icon: L.divIcon({ className: "rot-mun", html: esc(f.properties.nome), iconSize: null }) });
    mk._cod = f.properties.cod; camadas.rotMun.addLayer(mk);
  });
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
  mapa.on("zoomend moveend", atualizaRotulos);
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
// rótulos das rodovias do município selecionado: um por rodovia (GO e BR), no trecho mais longo dentro do município
function montaRotulosVias(cod) {
  camadas.rotVias.clearLayers();
  const gm = GEO.municipios.features.find(f => f.properties.cod === cod).geometry, b = A.municipios[cod].bbox;
  const melhor = {};
  const avalia = (chave, g, tipo) => { const [p, l] = meio(g); if (!p || p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3] || !dentro(p, gm)) return;
    if (!melhor[chave] || melhor[chave].l < l) melhor[chave] = { p, l, tipo }; };
  GEO.sre.features.forEach(f => f.properties.go && avalia("GO-" + f.properties.go, f.geometry, "go"));
  GEO.snv_federal.features.forEach(f => f.properties.br && avalia("BR-" + String(f.properties.br).padStart(3, "0"), f.geometry, "br"));
  Object.entries(melhor).forEach(([t, v]) => camadas.rotVias.addLayer(L.marker([v.p[1], v.p[0]], { interactive: false, pane: "rotulos",
    icon: L.divIcon({ className: "rot-via rot-" + v.tipo, html: esc(t), iconSize: null }) })));
}
function atualizaRotulos() {
  if (!mapa) return;
  const z = mapa.getZoom();
  // localidades: sedes a partir do zoom 9, demais a partir do 11
  camadas.loc.eachLayer(l => { const t = l.getTooltip(); if (!t) return;
    const sede = /Sede|Capital/.test(l.feature.properties.t);
    (ROT.loc && mapa.hasLayer(camadas.loc) && z >= (sede ? 9 : 11)) ? (t.options.permanent = true, l.openTooltip()) : l.closeTooltip(); });
  ROT.vias ? mapa.addLayer(camadas.rotVias) : mapa.removeLayer(camadas.rotVias);
  ROT.lotes ? mapa.addLayer(camadas.rotLotes) : mapa.removeLayer(camadas.rotLotes);
  if (ROT.mun && z >= 8) { mapa.addLayer(camadas.rotMun);
    camadas.rotMun.eachLayer(m => { const el = m.getElement(); if (el) el.classList.toggle("atual", m._cod === atual); });
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
    ["sre", "SRE – outubro/2026"], ["dorL", "Obras DOR – lineares"], ["dorP", "Obras DOR – pontuais"],
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
function enquadra() {
  const b = A.municipios[atual].bbox;
  mapa.invalidateSize();
  mapa.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [18, 18] });
}
function destacaMunicipio(cod) {
  if (camadas.mascara) mapa.removeLayer(camadas.mascara);
  if (camadas.contorno) mapa.removeLayer(camadas.contorno);
  const f = GEO.municipios.features.find(x => x.properties.cod === cod);
  const aneis = [];
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  polys.forEach(p => aneis.push(p[0].map(([x, y]) => [y, x])));
  // fora do município: fundo claro (como o recorte do atlas); dentro: satélite
  camadas.mascara = L.polygon([[[-90, -180], [-90, 180], [90, 180], [90, -180]], ...aneis], {
    pane: "mascara", stroke: false, ...estiloMascara(), interactive: false }).addTo(mapa);
  camadas.contorno = L.geoJSON(f, { pane: "vias", style: { color: "#ffd400", weight: 4, fill: false }, interactive: false }).addTo(mapa);
}
function destacaTrecho(sre) {
  if (camadas.sel) mapa.removeLayer(camadas.sel);
  const fs = GEO.sre.features.filter(f => f.properties.sre === sre);
  if (!fs.length) return;
  camadas.sel = L.geoJSON({ type: "FeatureCollection", features: fs }, { pane: "topo",
    style: { color: "#00e5ff", weight: 9, opacity: 0.75 }, interactive: false }).addTo(mapa);
  const b = camadas.sel.getBounds(), m = A.municipios[atual].bbox;
  const mb = L.latLngBounds([[m[1], m[0]], [m[3], m[2]]]);
  mapa.fitBounds(mb.intersects(b) ? L.latLngBounds(b.getSouthWest(), b.getNorthEast()) : b, { padding: [40, 40], maxZoom: 13 });
  document.getElementById("mapa").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------------- seleção do município ---------------- */
function seleciona(cod, hist = true) {
  atual = cod; const m = A.municipios[cod];
  if (hist) history.replaceState(null, "", "#" + cod);
  document.title = `${m.nome}/GO – Atlas SRE Municípios`;
  $("#titulo").textContent = m.nome;
  document.querySelectorAll(".nome-up").forEach(e => e.textContent = m.nome.toUpperCase());
  $("#q").value = ""; $("#q").placeholder = m.nome + " — buscar outro município…";
  $("#pag").textContent = `Página ${m.ordem} de ${LISTA.length}`;
  if (camadas.sel) { mapa.removeLayer(camadas.sel); camadas.sel = null; }
  destacaMunicipio(cod); montaRotulosVias(cod); enquadra(); atualizaRotulos();
  cartoes(m); grafSituacao(m); grafRodovia(m); grafUrbano(m); grafPeso(cod, m); grafDor(m);
  tabelaObras(m); tabelaSRE(m);
  $("#notas").textContent = (m.notas || "").replace(/\\n/g, "\n") +
    "\n• Obras DOR: cópia do cadastro de obras do DOR (atlas_dor.gpkg). Linhas recortadas pelo limite municipal (km sobre o GRS80); uma obra que cruza a divisa conta nos dois municípios.";
}

/* ---------------- cartões ---------------- */
function cartoes(m) {
  const tit = ["EXTENSÃO NO MUNICÍPIO", "ÍNDICE DE PAVIMENTAÇÃO", "APÓS AS OBRAS (EOP)", "DENSIDADE RODOVIÁRIA", "FAIXA DE DOMÍNIO"];
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
  const W = 300, bh = 18, gap = 8, H = itens.length * (bh + gap) + 18, x0 = lw, bw = (W - x0) / 1.6;
  let s = `<svg class="graf" viewBox="0 0 ${W} ${H}">`;
  for (const t of ticks(vmax * 1.6)) {
    const x = x0 + bw * t / vmax; if (x > W) continue;
    s += `<line x1="${x}" x2="${x}" y1="0" y2="${H - 16}" stroke="#c4c3bb" stroke-width=".6"/>` +
         `<text x="${x}" y="${H - 4}" font-size="9" fill="#898781" text-anchor="middle">${br(t, t >= 1 || t === 0 ? 0 : 1)}</text>`;
  }
  itens.forEach((it, i) => {
    const y = i * (bh + gap) + 2, w = Math.max(1, bw * it.v / vmax);
    s += `<text x="${x0 - 6}" y="${y + bh / 2 + 4}" font-size="11" fill="#52514e" text-anchor="end">${esc(it.rot)}</text>` +
         `<rect class="hov" x="${x0}" y="${y}" width="${w}" height="${bh}" fill="${it.cor}" data-tip="${esc(it.tip)}"/>` +
         `<text x="${x0 + w + 5}" y="${y + bh / 2 + 4}" font-size="10.5" fill="#0b0b0b">${br(it.v)} km${tot ? `  (${br(100 * it.v / tot)}%)` : ""}</text>`;
  });
  return s + `<line x1="${x0}" x2="${x0}" y1="0" y2="${H - 16}" stroke="#8f8e86" stroke-width=".8"/></svg>`;
}
function ticks(max) {
  const p = Math.pow(10, Math.floor(Math.log10(max / 4))), passo = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => max / k <= 5);
  const r = []; for (let v = 0; v <= max; v += passo) r.push(+v.toFixed(6)); return r;
}
function empilhado(linhas) {               // [{rot, r:{sit:km}}]
  const tots = linhas.map(l => soma(l.r)), vmax = Math.max(...tots);
  const lw = Math.max(...linhas.map(l => textW(l.rot, 11))) + 8;
  const W = 300, bh = 18, gap = 8, H = linhas.length * (bh + gap) + 18, x0 = lw, bw = (W - x0) / 1.3;
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
              data-tip="<b>${esc(l.rot)}</b><br>${SIT[c][0]}: ${br(v, 2)} km (${br(100 * v / tots[i])}%)"/>`;
      if (w / bw > 0.13) s += `<text x="${x + w / 2}" y="${y + bh / 2 + 3.5}" font-size="9.5" text-anchor="middle" pointer-events="none"
              fill="${BRANCO.has(c) ? "#fff" : "#0b0b0b"}">${br(v, 0)}</text>`;
      x += w;
    }
    s += `<text x="${x + 5}" y="${y + bh / 2 + 4}" font-size="10.5" fill="#0b0b0b">${br(tots[i])} km</text>`;
  });
  s += `<line x1="${x0}" x2="${x0}" y1="0" y2="${H - 16}" stroke="#8f8e86" stroke-width=".8"/></svg>`;
  const usados = ORD.filter(c => linhas.some(l => l.r[c]));
  return s + `<div class="leg-g">${usados.map(c => `<span><i style="background:${SIT[c][1]}"></i>${SIT[c][0]}</span>`).join("")}</div>`;
}
function grafSituacao(m) {
  const S = Object.fromEntries(Object.entries(m.situacao).filter(([, v]) => v > 0)), tot = soma(S);
  if (!tot) { $("#g1").innerHTML = cab("Extensão por situação") + `<div class="g-vazio">${SEM}</div>`; return; }
  const it = Object.keys(S).sort((a, b) => S[b] - S[a]).map(c => ({ rot: SIT[c][0], v: S[c], cor: SIT[c][1],
    tip: `<b>${SIT[c][0]}</b><br>${br(S[c], 2)} km · ${br(100 * S[c] / tot)}% da malha estadual no município` }));
  $("#g1").innerHTML = cab("Extensão por situação", `km no município e % do total (${br(tot, 2)} km)`) + barrasH(it, tot);
}
function grafRodovia(m) {
  const gos = Object.entries(m.go_situacao).filter(([, r]) => soma(r) > 0).sort((a, b) => soma(b[1]) - soma(a[1]));
  $("#g2").innerHTML = !gos.length ? cab("Extensão por rodovia e situação") + `<div class="g-vazio">${SEM}</div>` :
    cab("Extensão por rodovia e situação", "km no município") + empilhado(gos.map(([k, r]) => ({ rot: k, r })));
}
function grafUrbano(m) {
  const ur = ["Rural", "Urbano"].filter(k => soma(m.urbano_situacao[k]) > 0).map(k => ({ rot: k, r: m.urbano_situacao[k] }));
  $("#g3").innerHTML = !ur.length ? cab("Trechos urbanos × rurais") + `<div class="g-vazio">${SEM}</div>` :
    cab("Trechos urbanos × rurais", "km no município, por situação (perímetro urbano)") + empilhado(ur);
}
function grafDor(m) {
  const d = m.dor || {}, lin = d.lineares || {}, pon = d.pontuais || {};
  const tp = !Object.keys(pon).length ? "Obras pontuais: nenhuma no município" :
    "Obras pontuais: " + Object.entries(pon).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${n > 1 ? (PLURAL[k] || k.toLowerCase()) : k.toLowerCase()}`).join(" · ");
  let h = cab("Obras DOR por tipo", "obras e km no município");
  if (!Object.keys(lin).length && !Object.keys(pon).length) { $("#g-dor").innerHTML = h + `<div class="g-vazio">Sem obras da DOR<br>no município</div>`; return; }
  const ks = Object.keys(lin).sort((a, b) => lin[b].km - lin[a].km), vmax = Math.max(1e-9, ...ks.map(k => lin[k].km));
  if (ks.length) {
    const W = 220, bh = 14, H = ks.length * 36;
    h += `<svg class="graf" viewBox="0 0 ${W} ${H}">`;
    ks.forEach((k, i) => {
      const y = i * 36, w = Math.max(2, (W * 0.55) * lin[k].km / vmax), v = lin[k];
      h += `<text x="0" y="${y + 11}" font-size="11" fill="#52514e">${esc(k)}</text>` +
           `<rect class="hov" x="0" y="${y + 15}" width="${w}" height="${bh}" fill="${DOR_COR[k] || "#0055d6"}" stroke="#fff" stroke-width="1.4"
              data-tip="<b>${esc(k)}</b><br>${v.obras} obra${v.obras > 1 ? "s" : ""} · ${br(v.km, 2)} km no município"/>` +
           `<text x="${w + 5}" y="${y + 26}" font-size="10" fill="#0b0b0b">${v.obras} obra${v.obras > 1 ? "s" : ""} · ${br(v.km)} km</text>`;
    });
    h += `</svg>`;
  }
  $("#g-dor").innerHTML = h + `<div class="g-sub" style="margin-top:6px">${esc(tp)}</div>`;
}

/* --- comparativo: peso da malha do município no próprio município, no(s) lote(s) e em Goiás --- */
function pc(v) { if (v <= 0) return "0%"; return (v < 0.01 ? "<0,01" : br(v, v >= 1 ? 1 : 2)) + "%"; }
function miniMapa(cod, lts) {
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
            data-tip="Lote ${esc(k)}${meu ? " — contém o município" : ""}"/>`; });
  const fm = GEO.municipios.features.find(f => f.properties.cod === cod);
  s += `<path d="${d(fm.geometry)}" fill="${T_MU}" stroke="${T_MU}" stroke-width=".6" pointer-events="none"/>`;
  if (lts.length > 1) todos.filter(f => lts.includes(f.properties.lote)).forEach(f => {
    let mx = 0, my = 0, n = 0; anel(f.geometry).forEach(p => p[0].forEach(c => { mx += c[0]; my += c[1]; n++; }));
    const [x, y] = P([mx / n, my / n]).split(",");
    s += `<text x="${x}" y="${+y + 4}" font-size="12" font-weight="bold" fill="${T_LT}" text-anchor="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(f.properties.lote)}</text>`;
  });
  return s + "</svg>";
}
function grafPeso(cod, m) {
  const ml = m.peso || {}, ms = {};
  Object.values(ml).forEach(r => Object.entries(r).forEach(([s, v]) => ms[s] = (ms[s] || 0) + v));
  const tm = soma(ms);
  let h = cab("Comparativo da composição da malha", "peso da malha do município em cada situação (sem planejadas)");
  if (!tm) { $("#g-peso").innerHTML = h + `<div class="g-vazio">${SEM}</div>`; return; }
  const lts = Object.keys(ml).sort((a, b) => soma(ml[b]) - soma(ml[a]));
  const GO = A.goias.situacao, GOt = A.goias.total, LT = A.lotes;
  const sits = ["PAV", "DUP", "EOD", "EOP", "IMP", "LEN"];
  const rl = lts.length === 1 ? "Lote " + lts[0] : "Lotes " + lts.slice(0, -1).join(", ") + " e " + lts[lts.length - 1];
  const cel = (v, cor, tc, tip, bold) => `<td class="grp"><div class="cel"><span style="color:${v > 0 ? tc : "#898781"};${bold ? "font-weight:bold" : ""}">${pc(v)}</span>
      <div class="bar hov" data-tip="${esc(tip)}"><b style="width:${Math.min(100, v)}%;background:${cor}"></b></div></div></td>`;
  let t = `<div class="tab-peso"><table><thead><tr><th>Situação</th><th class="grp" style="color:${T_MU};text-align:right">km no<br>município</th>
     <th style="color:${T_MU}">% da malha do<br>município</th>${lts.map(k => `<th class="grp" style="color:${T_LT}">% do<br>Lote ${esc(k)}</th>`).join("")}
     <th class="grp" style="color:${T_GO}">% de<br>Goiás</th></tr></thead><tbody>`;
  for (const s of sits) {
    const km = ms[s] || 0, nm = SIT[s][0], cor = SIT[s][1];
    t += `<tr><td class="${km ? "" : "zero"}"><i class="sw" style="background:${cor}"></i>${nm}</td>
      <td class="km grp" style="color:${km ? T_MU : "#898781"}">${br(km)}</td>` +
      cel(100 * km / tm, cor, T_MU, `<b>${nm}</b><br>${br(km, 2)} km = ${pc(100 * km / tm)} da malha do município (${br(tm, 2)} km)`).replace('<td class="grp">', "<td>") +
      lts.map(k => { const lk = LT[k]?.[s] || 0, mk = ml[k]?.[s] || 0, v = lk ? 100 * mk / lk : 0;
        return cel(v, cor, T_LT, `<b>${nm} – Lote ${k}</b><br>${br(mk, 2)} km do município ÷ ${br(lk, 2)} km do lote = ${pc(v)}`); }).join("") +
      cel(GO[s] ? 100 * km / GO[s] : 0, cor, T_GO, `<b>${nm} – Goiás</b><br>${br(km, 2)} km do município ÷ ${br(GO[s] || 0, 2)} km do Estado = ${pc(GO[s] ? 100 * km / GO[s] : 0)}`) + `</tr>`;
  }
  t += `<tr class="tot"><td>Total</td><td class="km grp" style="color:${T_MU}">${br(tm)}</td>` +
    cel(100, "#6b6a66", T_MU, `Malha estadual do município: ${br(tm, 2)} km`, true).replace('<td class="grp">', "<td>") +
    lts.map(k => { const v = 100 * soma(ml[k]) / soma(LT[k]); return cel(v, "#6b6a66", T_LT, `<b>Lote ${k}</b><br>${br(soma(ml[k]), 2)} km do município ÷ ${br(soma(LT[k]), 2)} km do lote = ${pc(v)}`, true); }).join("") +
    cel(100 * tm / GOt, "#6b6a66", T_GO, `<b>Goiás</b><br>${br(tm, 2)} km do município ÷ ${br(GOt, 2)} km do Estado = ${pc(100 * tm / GOt)}`, true) + `</tr>`;
  t += `<tr class="ext"><td>Extensão total</td><td class="km grp" style="color:${T_MU}">${br(tm)} km</td><td style="color:${T_MU};font-weight:normal">malha do município</td>` +
    lts.map(k => `<td class="grp" style="color:${T_LT}">Lote ${esc(k)}: ${br(soma(LT[k]))} km</td>`).join("") +
    `<td class="grp" style="color:${T_GO}">Goiás: ${br(GOt)} km</td></tr></tbody></table></div>`;
  const nm = m.nome.length <= 22 ? m.nome : m.nome.slice(0, 21) + "…";
  h += `<div class="peso"><div class="peso-mapa">${miniMapa(cod, lts)}
        <div class="peso-rot"><span style="color:${T_MU}">${esc(nm)}</span><br><span style="color:${T_LT}">${esc(rl)}</span><br><span style="color:${T_GO}">Goiás</span></div></div>${t}</div>`;
  $("#g-peso").innerHTML = h;
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
      (ls.length ? ls.map((l, i) => `<tr data-i="${linhas.indexOf(l)}">${cols.map(c => `<td>${c.f ? c.f(l[c.k]) : esc(l[c.k] ?? "")}</td>`).join("")}</tr>`).join("")
        : `<tr class="vazio"><td colspan="${cols.length}">${vazio}</td></tr>`) + "</tbody>";
    el.querySelectorAll("th").forEach(th => th.onclick = () => { const k = th.dataset.k; asc = ord === k ? !asc : true; ord = k; desenha(); });
    if (aoClicar) el.querySelectorAll("tbody tr[data-i]").forEach(tr => tr.onclick = () => {
      el.querySelectorAll("tr.sel").forEach(x => x.classList.remove("sel")); tr.classList.add("sel"); aoClicar(linhas[+tr.dataset.i]); });
  };
  desenha();
  return { filtra: t => { filtro = semAcento(t); desenha(); } };
}
function tabelaObras(m) {
  tabela($("#t-obras"), [
    { k: "mapa", t: "Mapa" }, { k: "codigo", t: "Código" }, { k: "rodovia", t: "Rodovia" }, { k: "intervencao", t: "Intervenção" },
    { k: "tipo", t: "Tipo" }, { k: "km_mun", t: "Km mun.", f: v => num(v, 2) }, { k: "km_contrato", t: "Km contr.", f: v => num(v, 2) },
    { k: "etapa", t: "Etapa" }, { k: "situacao", t: "Situação" }], m.obras || [], "Sem obras da DOR no município");
}
let tSRE = null;
function tabelaSRE(m) {
  $("#filtro").value = "";
  tSRE = tabela($("#t-sre"), [
    { k: "sre", t: "SRE" }, { k: "go", t: "GO" }, { k: "classe", t: "Classe" }, { k: "inicio", t: "Início" }, { k: "fim", t: "Fim" },
    { k: "km_ini", t: "km inicial", f: v => num(v, 3) }, { k: "km_fim", t: "km final", f: v => num(v, 3) },
    { k: "ext", t: "Ext. SRE (km)", f: v => num(v, 3) }, { k: "ext_mun", t: "Ext. no mun. (km)", f: v => num(v, 3) },
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
    `<div class="lg-tit">SRE – Outubro/2026</div>` +
    it(ln("#e31a1c", 5), "Duplicada") + it(ln("#e31a1c", 3), "Pavimentada") + it(ln("#e31a1c", 3, "8 5"), "Em obras de pavimentação") +
    it(ln("#e88000", 3), "Implantada / Leito natural") +
    `<div class="lg-tit">SNV – Rodovias federais</div>` + it(ln("#33a02c", 3), "Federal") +
    `<div class="lg-tit">Obras DOR</div>` +
    Object.entries(DOR_COR).map(([k, c]) => it(ln(c, 5, null, "#ffffff"), k)).join("") +
    it(`<svg width="34" height="14"><circle cx="17" cy="7" r="5.5" fill="#4e88b9" stroke="#fff" stroke-width="2"/></svg>`, "Obras pontuais (ponte, viaduto, bueiro)") +
    `<div class="lg-tit">Demais</div>` +
    it(`<svg width="34" height="14"><rect x="3" y="2" width="28" height="10" fill="none" stroke="#ffd400" stroke-width="3"/></svg>`, "Limite municipal") +
    it(`<svg width="34" height="14"><rect x="3" y="2" width="28" height="10" fill="#f2d24b" fill-opacity=".3" stroke="#f2d24b"/></svg>`, "Perímetro urbano") +
    it(`<svg width="34" height="14"><circle cx="17" cy="7" r="4" fill="#fff" stroke="#222"/></svg>`, "Localidades");
}

carrega().catch(e => { $("#carregando").textContent = "Erro ao carregar o atlas: " + e.message; console.error(e); });
