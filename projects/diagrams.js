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
    // ELK 첫 렌더가 간헐적으로 불안정해서(초기화 직후) 실제 다이어그램과 유사한 구조로
    // 워밍업 렌더를 여러 번 돌려 흡수한다(subgraph + 결정노드 + 교차 엣지).
    if (window.__elkOK) {
      const warm = "flowchart TB\n subgraph G1[a]\n direction TB\n n1[x] --> n2{y}\n end\n subgraph G2[b]\n n3[(z)]\n end\n n2 -->|e| n3\n n2 -->|f| n1";
      for (let i = 0; i < 3; i++) { try { await mermaid.render("dg_warm" + i, warm); } catch (e) {} }
    }
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
  if (el.getAttribute("data-processed") === "done") return; // 이미 성공
  if (el.getAttribute("data-rendering")) return;             // 이미 큐에 있음
  el.setAttribute("data-rendering", "true");
  const def = el.textContent;
  const isErr = (svg) => svg.includes('aria-roledescription="error"');
  _renderChain = _renderChain.then(async () => {
    await initMermaid();
    let good = null;
    // ELK는 콜드 스타트/연속 렌더 시 예외나 에러 SVG를 간헐적으로 낸다 → 둘 다 재시도.
    for (let i = 0; i < 4 && good === null; i++) {
      try {
        const { svg } = await mermaid.render("dg_" + Math.random().toString(36).slice(2), def);
        if (!isErr(svg)) good = svg;
      } catch (e) { /* 재시도 */ }
      if (good === null) await new Promise((r) => setTimeout(r, 120));
    }
    el.removeAttribute("data-rendering");
    if (good) { el.innerHTML = good; el.setAttribute("data-processed", "done"); }
    // 끝내 실패하면 data-processed를 안 남겨 다음 탭 클릭에서 재렌더되게 한다.
  }).catch(() => {}); // 한 렌더의 예외가 체인 전체를 막지 않도록
}

function setupDiagrams(){
  const tabs = [...document.querySelectorAll(".dg-tab")];
  const panels = [...document.querySelectorAll(".dg-panel")];
  function show(key){
    tabs.forEach(t => t.classList.toggle("active", t.dataset.key === key));
    panels.forEach(p => p.classList.toggle("active", p.dataset.key === key));
    // 클릭 시에도 렌더 시도(미완료면). 사전 렌더가 실패한 탭을 눌러 재시도할 수 있게.
    const panel = panels.find(p => p.dataset.key === key);
    const pre = panel && panel.querySelector(".mermaid");
    if (pre) renderMermaid(pre);
  }
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.key)));
  if (tabs.length) show(tabs[0].dataset.key);
  // 나머지 탭은 클릭 시 렌더(지연). ELK가 워밍업 후 더 안정적이라, 콜드 상태의 일괄 사전 렌더는 피한다.
}
