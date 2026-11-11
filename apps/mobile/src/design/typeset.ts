// Line breaks that read well (owner, 1 Nov 2026): no single word left hanging on the last line, and short words
// such as "A" or "to" kept with the word after them. Done with non-breaking spaces, so it works at any width.
// A joined pair is kept short (MAX_JOINED letters): a longer one may not fit a narrow card, and Android then breaks
// inside the word, leaving a lone letter on the next line ("experience / s" on Home, 5 Nov 2026). Unit-tested.
const NBSP = '\u00A0';
const SHORT = /^[\p{L}]{1,2}$/u;
const MAX_JOINED = 14;

export function tidy(text: string): string {
  const words = text.split(' ');
  if (words.length < 3) return text;
  const fits = (i: number) => words[i].length + 1 + words[i + 1].length <= MAX_JOINED;
  return words
    .map((w, i) => {
      if (i === words.length - 1) return w;
      const join = (i === words.length - 2 || SHORT.test(w)) && fits(i);
      return w + (join ? NBSP : ' ');
    })
    .join('');
}

/** `tidy` for React children: plain text, or a list of text and numbers such as `{title} · {minutes} min`. */
export function tidyNode<T>(children: T): T | string {
  if (typeof children === 'string') return tidy(children);
  if (Array.isArray(children) && children.length > 0 && children.every(c => typeof c === 'string' || typeof c === 'number')) {
    return tidy(children.join(''));
  }
  return children;
}
