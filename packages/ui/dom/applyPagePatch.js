export function applyPagePatch(patch = {}, options = {}) {
  const getElementById = createElementResolver(options);
  applyTextPatch(patch.text, getElementById);
  applyHtmlPatch(patch.html, getElementById);
  applyValuePatch(patch.value, getElementById);
  applyStylePatch(patch.style, getElementById);
  applyBooleanPatch(patch.hidden, "hidden", getElementById);
  applyBooleanPatch(patch.disabled, "disabled", getElementById);
}

function createElementResolver(options = {}) {
  if (typeof options.getElementById === "function") {
    return options.getElementById;
  }
  const documentRef = options.document || globalThis.document;
  return id => documentRef?.getElementById?.(id) || null;
}

function applyTextPatch(textPatch = {}, getElementById) {
  Object.entries(textPatch).forEach(([id, value]) => {
    const element = getElementById(id);
    if (element) {
      element.textContent = value;
    }
  });
}

function applyHtmlPatch(htmlPatch = {}, getElementById) {
  Object.entries(htmlPatch).forEach(([id, value]) => {
    const element = getElementById(id);
    if (element) {
      element.innerHTML = value;
    }
  });
}

function applyValuePatch(valuePatch = {}, getElementById) {
  Object.entries(valuePatch).forEach(([id, value]) => {
    const element = getElementById(id);
    if (element) {
      element.value = value;
    }
  });
}

function applyStylePatch(stylePatch = {}, getElementById) {
  Object.entries(stylePatch).forEach(([id, styles]) => {
    const element = getElementById(id);
    if (!element) {
      return;
    }
    Object.entries(styles || {}).forEach(([name, value]) => {
      element.style[name] = value;
    });
  });
}

function applyBooleanPatch(booleanPatch = {}, property, getElementById) {
  Object.entries(booleanPatch).forEach(([id, value]) => {
    const element = getElementById(id);
    if (element) {
      element[property] = Boolean(value);
    }
  });
}
