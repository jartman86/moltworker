/** Escape HTML special characters for Telegram */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert Claude's markdown response to Telegram HTML.
 * Handles: bold, italic, code, pre blocks, links.
 * Falls back gracefully if conversion produces invalid HTML.
 */
export function markdownToTelegramHtml(md: string): string {
  let html = md;

  // Code blocks first (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre>${escapeHtml(code.trimEnd())}</pre>`;
  });

  // Inline code (` ... `)
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Escape remaining HTML entities (but not inside <pre>/<code> tags which are already escaped)
  // We need to be careful here - only escape text outside of tags
  html = html.replace(/(<(?:pre|code)>[\s\S]*?<\/(?:pre|code)>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    if (text) {
      // Escape & < > in plain text portions
      let escaped = text.replace(/&(?!amp;|lt;|gt;)/g, '&amp;');
      escaped = escaped.replace(/<(?!\/?\w)/g, '&lt;');

      // Bold (**text** or __text__)
      escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      escaped = escaped.replace(/__(.+?)__/g, '<b>$1</b>');

      // Italic (*text* or _text_) - avoid matching inside words with underscores
      escaped = escaped.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<i>$1</i>');
      escaped = escaped.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '<i>$1</i>');

      // Strikethrough (~~text~~)
      escaped = escaped.replace(/~~(.+?)~~/g, '<s>$1</s>');

      // Links [text](url)
      escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

      return escaped;
    }
    return match;
  });

  return html;
}
