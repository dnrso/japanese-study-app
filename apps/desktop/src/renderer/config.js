let uiConfigLoading = null;

async function initUiConfig() {
  if (!uiConfigLoading) {
    uiConfigLoading = import("../../../../packages/ui/config.js")
      .then(module => module.uiConfig);
  }
  window.NihonGoConfig = await uiConfigLoading;
  return window.NihonGoConfig;
}
