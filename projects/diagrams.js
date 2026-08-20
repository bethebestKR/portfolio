/* 공용 다이어그램 렌더러 — 세 프로젝트 페이지 공용.
   ELK 레이아웃으로 엣지를 직각(orthogonal)으로 라우팅. ELK 로드 실패 시 기본 레이아웃으로 폴백.
   탭 전환 시 지연 렌더, 렌더는 직렬화(mermaid 동시 실행 레이스 방지). */
let _initPromise = null;
function initMermaid(){
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // ELK 레이아웃(직각 엣지) 등록 시도
    try {
      const elk = await import("https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0.1.7/dist/mermaid-layout-elk.esm.min.mjs");
      mermaid.registerLayoutLoaders(elk.default || elk);
      window.__elkOK = true;
    } catch (e) {
      window.__elkOK = false;
      console.warn("ELK 레이아웃 로드 실패 — 기본 레이아웃 사용", e);
    }
    mermaid.initialize({
      startOnLoad: false, securityLevel: "loose", theme: "base",
      layout: window.__elkOK ? "elk" : "dagre",
      elk: { nodePlacementStrategy: "BRANDES_KOEPF", mergeEdges: false },
      flowchart: { padding: 16, useMaxWidth: true, htmlLabels: true },
      sequence: { useMaxWidth: true, mirrorActors: false },
      themeVariables: {
        fontFamily: "-apple-system, system-ui, Inter, sans-serif", fontSize: "14px",
        primaryColor: "#f5f5f7", primaryTextColor: "#1d1d1f", primaryBorderColor: "#c9c9cf",
        lineColor: "#8a8a8f", secondaryColor: "#eef4fb", tertiaryColor: "#ffffff",
        clusterBkg: "#fafafa", clusterBorder: "#e0e0e0",
        actorBkg: "#f5f5f7", actorBorder: "#c9c9cf", actorTextColor: "#1d1d1f", actorLineColor: "#c9c9cf",
        signalColor: "#6a6a70", signalTextColor: "#1d1d1f",
        noteBkgColor: "#eef4fb", noteBorderColor: "#c9dcf3", noteTextColor: "#0b3d75"
      }
    });
    return true;
  })();
  return _initPromise;
}

/* 렌더 직렬화 큐 — 동시에 여러 렌더가 도는 것을 막는다.
   mermaid.render(오프스크린→SVG 주입)를 써서 패널 가시성(display:none)과 무관하게 렌더된다
   (빠른 탭 전환으로 렌더 도중 패널이 숨겨져도 레이아웃 실패가 나지 않음). */
let _renderChain = Promise.resolve();
function renderMermaid(el){
  if (!window.mermaid){ setTimeout(() => renderMermaid(el), 60); return; }
  if (el.getAttribute("data-processed")) return;
  el.setAttribute("data-processed", "true");
  const def = el.textContent;
  const renderOnce = async () => (await mermaid.render("dg_" + Math.random().toString(36).slice(2), def)).svg;
  const isErr = (svg) => svg.includes('aria-roledescription="error"');
  _renderChain = _renderChain.then(async () => {
    try {
      await initMermaid();
      await new Promise((r) => setTimeout(r, 30)); // 직전 렌더(특히 ELK)의 내부 상태가 정리될 여유
      let svg = await renderOnce();
      // ELK가 연속 렌더 시 간헐적으로 에러 SVG를 내는 경우가 있어 1~2회 재시도
      for (let i = 0; i < 2 && isErr(svg); i++) {
        await new Promise((r) => setTimeout(r, 80));
        svg = await renderOnce();
      }
      el.innerHTML = svg;
    } catch (e) {
      el.removeAttribute("data-processed");
      console.error("mermaid", e);
    }
  });
}

function setupDiagrams(){
  const tabs = [...document.querySelectorAll(".dg-tab")];
  const panels = [...document.querySelectorAll(".dg-panel")];
  function show(key){
    tabs.forEach(t => t.classList.toggle("active", t.dataset.key === key));
    panels.forEach(p => p.classList.toggle("active", p.dataset.key === key));
    const panel = panels.find(p => p.dataset.key === key);
    const pre = panel && panel.querySelector(".mermaid");
    if (pre && !pre.getAttribute("data-processed")) renderMermaid(pre);
  }
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.key)));
  if (tabs.length) show(tabs[0].dataset.key);
}
