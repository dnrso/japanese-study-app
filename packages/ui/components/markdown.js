import MarkdownIt from "markdown-it";

// Renderer for 노트 bodies.
//
// `html: false` is the security boundary: a note body is foreign input (it
// arrives through backup files and sync snapshots as well as the editor), and
// with raw HTML switched off markdown-it escapes every "<" it is given, so the
// output can be assigned to innerHTML without a separate sanitizer.
// markdown-it's default validateLink additionally refuses javascript:,
// vbscript:, file: and non-image data: URLs.
//
// `breaks: true` turns a single newline into <br>: study notes are written
// line by line, and losing those breaks is surprising.
const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true });
const { escapeHtml } = markdown.utils;

const defaultLinkOpen = markdown.renderer.rules.link_open
  || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));

// Note links leave the app: open them in a new tab without handing the page
// a window.opener reference.
markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, index, options, env, self);
};

// Wide tables scroll inside their own box instead of widening the page.
markdown.renderer.rules.table_open = () => '<div class="notebook-table-wrap"><table>\n';
markdown.renderer.rules.table_close = () => "</table></div>\n";

// [[제목]] links a study card by its title. The pattern is kept in step with
// WIKI_LINK in @nihongo-study/core (notes.js), which is what decides the
// note's card chips: one line, no "|" (it would split a table cell), 1-80
// characters.
const WIKI_LINK_KINDS = ["kanji", "word", "grammar", "expression"];

markdown.inline.ruler.before("link", "wikilink", (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x5b || state.src.charCodeAt(start + 1) !== 0x5b) {
    return false;
  }
  const end = state.src.indexOf("]]", start + 2);
  if (end === -1) {
    return false;
  }
  const inner = state.src.slice(start + 2, end);
  const title = inner.trim();
  if (!title || inner.length > 80 || /[[\]\n|]/.test(inner)) {
    return false;
  }
  if (!silent) {
    state.push("wikilink", "", 0).content = title;
  }
  state.pos = end + 2;
  return true;
});

// `env.cardKind(title)` says which kind of card the title resolves to ("" for
// none); only a known kind ever reaches the class/attribute.
markdown.renderer.rules.wikilink = (tokens, index, options, env) => {
  const title = tokens[index].content;
  const resolved = typeof env?.cardKind === "function" ? env.cardKind(title) : "";
  const kind = WIKI_LINK_KINDS.includes(resolved) ? resolved : "";
  return `<button type="button" class="notebook-link notebook-link--${kind || "missing"}" data-note-card-kind="${kind}" data-note-card-title="${escapeHtml(title)}">${escapeHtml(title)}</button>`;
};

function inlineText(token) {
  return (token?.children || [])
    .filter(child => ["text", "code_inline", "wikilink"].includes(child.type))
    .map(child => child.content)
    .join("")
    .trim();
}

// Returns the rendered HTML plus the note's headings ({ id, level, text }) so
// the sidebar can offer them as an in-note table of contents. Heading ids are
// positional ("note-heading-3"), never derived from the text, so they are
// always safe to place in an attribute.
//
// `cardKind` (optional) resolves a [[제목]] to the kind of the card it links,
// so the link can be coloured like that card's chip.
export function renderMarkdown(source, { cardKind } = {}) {
  const env = { cardKind };
  const tokens = markdown.parse(String(source || ""), env);
  const headings = [];
  tokens.forEach((token, index) => {
    if (token.type !== "heading_open") {
      return;
    }
    const id = `note-heading-${headings.length + 1}`;
    token.attrSet("id", id);
    headings.push({ id, level: Number(token.tag.slice(1)), text: inlineText(tokens[index + 1]) });
  });
  return {
    html: markdown.renderer.render(tokens, markdown.options, env),
    headings
  };
}
