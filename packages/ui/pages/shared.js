export function mergePatches(...patches) {
  return patches.reduce((result, patch = {}) => ({
    text: { ...result.text, ...patch.text },
    html: { ...result.html, ...patch.html },
    value: { ...result.value, ...patch.value },
    style: { ...result.style, ...patch.style },
    hidden: { ...result.hidden, ...patch.hidden },
    disabled: { ...result.disabled, ...patch.disabled }
  }), {});
}
