const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("appInfo", {
  name: "NihonGo Study"
});
