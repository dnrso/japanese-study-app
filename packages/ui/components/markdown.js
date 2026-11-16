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

function inlineText(token) {
  return (token?.children || [])
    .filter(child => child.type === "text" || child.type === "code_inline")
    .map(child => child.content)
    .join("")
    .trim();
}

// Returns the rendered HTML plus the note's headings ({ id, level, text }) so
// the sidebar can offer them as an in-note table of contents. Heading ids are
// positional ("note-heading-3"), never derived from the text, so they are
// always safe to place in an attribute.
export function renderMarkdown(source) {
  const tokens = markdown.parse(String(source || ""), {});
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
    html: markdown.renderer.render(tokens, markdown.options, {}),
    headings
  };
}
