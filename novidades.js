/* Aviso de novidades (19/11/2026) — ATUALIZAR A CADA PUBLICAÇÃO (id novo = o aviso aparece de novo para todos).
   Mesmo arquivo no atlas (index.html) e no painel (index.html e mapa.html). Fica por cima da capa, fecha no ✕/Entendi,
   é lembrado no navegador; o botão #novid-btn (se a página tiver) reabre. Some no modo apresentação e na impressão. */
(() => {
  "use strict";
  const NOVIDADES = { id: "2026-11-27b", data: "27/11/2026", itens: [
    "<b>Obras atualizadas</b> com o cadastro de 27/11/2026: o site passa a mostrar 87 obras (antes eram 71), em 96 municípios (antes eram 83).",
    "Entraram 16 obras, todas concluídas ou inauguradas: pavimentação da <b>GO-050</b>, <b>GO-154</b>, <b>GO-219</b>, <b>GO-230</b>, <b>GO-306</b>, <b>GO-309</b> e <b>GO-460</b>; duplicação da <b>GO-139</b> e da <b>GO-174</b>; restauração da <b>GO-040</b>, <b>GO-050</b>, <b>GO-080</b>, <b>GO-184</b> e <b>GO-174</b> (dois trechos); e uma obra de arte especial (OAE) na <b>GO-174</b>, em Rio Verde.",
    "A obra de pavimentação da <b>GO-219</b> (OB26-01474) passou de Contratado para Concluído.",
    "<b>Projetos atualizados</b> com o cadastro de 27/11/2026: o site passa a mostrar 162 projetos (antes eram 151). Entraram 12 projetos: duplicação da <b>GO-164</b> (quatro trechos) e da <b>GO-174</b>, em Montividiu; pavimentação da <b>GO-188</b> (dois trechos), <b>GO-194</b>, <b>GO-239</b> e de um trecho em Niquelândia; terceira faixa da <b>GO-174</b>; e uma obra de arte especial (OAE) na <b>GO-050</b>, em Montividiu.",
    "Saiu do cadastro o projeto de restauração da <b>GO-309</b>. Dois projetos de duplicação da <b>GO-164</b> passaram para a situação Publicado, e três projetos da GO-164 e da GO-188 tiveram o trecho reduzido.",
    "15 projetos ligados a obras passam a aparecer na etapa <b>Obra integrada</b> (14 estavam como Estudo Técnico Preliminar e 1, na GO-040, como Obra).",
  ] };
  /* 26/11/2026 (b): Projetos atualizados com o cadastro de 26/11/2026: 151 projetos (antes 155); saíram quatro projetos de
     pavimentação na etapa Projeto (GO-236 / GO-114, GO-116, GO-236 e GO-116, em Flores de Goiás, Formosa e São João d'Aliança). */
  /* 25/11/2026: Obras e projetos atualizados com os cadastros de 25/11/2026. | Novos projetos: pavimentação em Aloândia, Hidrolândia,
     Bom Jesus de Goiás / Goiatuba e Trindade / Goiânia; ponte sobre o Rio dos Bois (Diorama) e duas interseções em desnível na GO-222
     (Nova Veneza). | Nova obra: pavimentação de estrada vicinal em Itaberaí. | Situação das obras atualizada conforme o cadastro
     (contratadas, em andamento, suspensas). | Saíram do cadastro: o projeto de duplicação da GO-174 / GO-422 (Cachoeira Alta / Rio Verde)
     e o projeto da ponte sobre o Rio das Almas na GO-241 (Cavalcante). */
  const CHAVE = "novid:" + (location.pathname.split("/")[1] || "local");     // atlas e painel guardam separado
  const css = `
.novid { position: fixed; right: 18px; bottom: 18px; z-index: 5050; width: min(380px, calc(100vw - 32px)); box-sizing: border-box;
  background: #fff; color: #2b2b2b; border: 1px solid #d5dbd7; border-left: 5px solid #00923f; border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0,0,0,.25); padding: 14px 16px 12px; font: 14px/1.45 Arial, sans-serif; text-align: left; }
.novid[hidden] { display: none; }
.novid-tit { font-weight: bold; font-size: 15px; color: #1f5b46; padding-right: 24px; margin-bottom: 6px; }
.novid-data { font-weight: normal; font-size: 13px; color: #898781; }
.novid-lista { margin: 0 0 10px; padding-left: 18px; }
.novid-lista li + li { margin-top: 5px; }
.novid-x { position: absolute; top: 8px; right: 8px; border: 0; background: none; color: #52514e; font-size: 16px; cursor: pointer; padding: 2px 6px; }
.novid-ok { font: bold 13px Arial, sans-serif; color: #fff; background: #00923f; border: 0; border-radius: 4px; padding: 6px 14px; cursor: pointer; }
[data-tema=escuro] .novid { background: #24282a; color: #e4e4df; border-color: #363a3d; border-left-color: #6cc59a; box-shadow: 0 6px 24px rgba(0,0,0,.6); }
[data-tema=escuro] .novid-tit { color: #6cc59a; }
[data-tema=escuro] .novid-x { color: #b7b6b0; }
html.apres .novid, html.apres-img .novid { display: none !important; }
@media print { .novid { display: none !important; } }
@media (max-width: 600px) { .novid { right: 16px; bottom: 16px; } }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  const c = document.createElement("aside");
  c.id = "novid"; c.className = "novid"; c.hidden = true; c.setAttribute("role", "dialog"); c.setAttribute("aria-labelledby", "novid-tit");
  c.innerHTML = `<button class="novid-x" type="button" aria-label="Fechar">✕</button>
    <div class="novid-tit" id="novid-tit">🔔 Novidades do site <span class="novid-data">· ${NOVIDADES.data}</span></div>
    <ul class="novid-lista">${NOVIDADES.itens.map(t => `<li>${t}</li>`).join("")}</ul>
    <button class="novid-ok" type="button">Entendi</button>`;
  document.body.appendChild(c);
  const apres = () => /\bapres/.test(document.documentElement.className);
  function mostra(forcar) {
    if (apres()) return;
    if (!forcar) { try { if (localStorage.getItem(CHAVE) === NOVIDADES.id) return; } catch (e) {} }
    c.hidden = false;
  }
  function fecha() { c.hidden = true; try { localStorage.setItem(CHAVE, NOVIDADES.id); } catch (e) {} }
  c.querySelector(".novid-x").onclick = fecha;
  c.querySelector(".novid-ok").onclick = fecha;
  const b = document.getElementById("novid-btn");
  if (b) b.onclick = () => c.hidden ? mostra(true) : fecha();
  window.mostraNovidades = mostra;
  setTimeout(() => mostra(false), 800);
})();
