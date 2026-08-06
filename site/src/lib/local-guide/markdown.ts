const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

function safeHref(value: string): string | null {
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (/^(?:https?:|mailto:|tel:|\/|#)/i.test(href)) return escapeHtml(href);
  return null;
}

function inline(value: string): string {
  let rendered = escapeHtml(value);
  rendered = rendered.replace(/`([^`]+)`/g, '<code>$1</code>');
  rendered = rendered.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, label, href) => {
    const safe = safeHref(href);
    return safe ? `<a href="${safe}" rel="noopener noreferrer">${label}</a>` : label;
  });
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  rendered = rendered.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  rendered = rendered.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, '$1<em>$2</em>');
  return rendered;
}

export function renderSafeLocalGuideMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const flushParagraph = () => { if (paragraph.length) output.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; };
  const closeList = () => { if (list) output.push(`</${list}>`); list = null; };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (heading) { flushParagraph(); closeList(); const level = heading[1].length; output.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const item = unordered ?? ordered;
    if (item) {
      flushParagraph(); const nextList = unordered ? 'ul' : 'ol';
      if (list !== nextList) { closeList(); list = nextList; output.push(`<${list}>`); }
      output.push(`<li>${inline(item[1])}</li>`); continue;
    }
    closeList(); paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  return output.join('\n');
}
