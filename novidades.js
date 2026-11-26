/* Aviso de novidades (19/11/2026) — ATUALIZAR A CADA PUBLICAÇÃO (id novo = o aviso aparece de novo para todos).
   Mesmo arquivo no atlas (index.html) e no painel (index.html e mapa.html). Fica por cima da capa, fecha no ✕/Entendi,
   é lembrado no navegador; o botão #novid-btn (se a página tiver) reabre. Some no modo apresentação e na impressão. */
(() => {
  "use strict";
  const NOVIDADES = { id: "2026-11-26b", data: "26/11/2026", itens: [
    "<b>Projetos atualizados</b> com o cadastro de 26/11/2026: o site passa a mostrar 151 projetos (antes eram 155).",
    "Saíram do cadastro quatro projetos de pavimentação, todos na etapa Projeto: <b>GO-236 / GO-114</b>, do entroncamento da GO-116 ao perímetro urbano de Flores de Goiás (Flores de Goiás / São João d'Aliança); <b>GO-116</b>, do Km 22 ao entroncamento da GO-236 (Formosa / São João d'Aliança); <b>GO-236</b>, do entroncamento da GO-116 ao da GO-118 (São João d'Aliança); e <b>GO-116</b>, entre os dois entroncamentos com a GO-236 (São João d'Aliança).",
    "Nenhum projeto novo e nenhuma mudança nos demais projetos. As obras continuam iguais.",
  ] };
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
