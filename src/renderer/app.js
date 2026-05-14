async function init() {
  storagePaths = await dataApi.getPaths();
  applyState(await dataApi.getState(selectedDate));
  bindEvents();
}

init().catch(error => {
  document.body.innerHTML = `<main class="main"><section class="panel"><h1>데이터베이스 초기화 실패</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
