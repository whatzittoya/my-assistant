// UT post HTML is captured after Moodle's video.js has already initialized, so a
// media attachment arrives as a dead player shell: ~200 `vjs-*` divs with no
// <video>, no <iframe> and no source URL left to recover. It can never play, it
// eats ~1100px of height, and — because we don't load video.js's stylesheet, so
// `.video-js` has no `position` — its `.vjs-iframe-blocker` child (absolute,
// 100%×100%) stretches across the whole page and swallows every click on it.
// Strip the shell and leave a marker so the attachment isn't silently lost.

const MEDIA_CLASS = /class\s*=\s*["'][^"']*(?:\bmediaplugin\b|\bvideo-js\b|\bvjs-)/i;
const MARKER = '<p><em>[media attachment — open the post on UT to view]</em></p>';

function findMediaOpenTag(html: string, from: number): { start: number; end: number } | null {
  const re = /<div\b[^>]*>/gi;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (MEDIA_CLASS.test(m[0])) return { start: m.index, end: re.lastIndex };
  }
  return null;
}

/** Index just past the `</div>` that closes the block opened before `from`. */
function findBlockEnd(html: string, from: number): number {
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] === "/") {
      depth -= 1;
      if (depth === 0) return re.lastIndex;
    } else {
      depth += 1;
    }
  }
  return html.length; // unbalanced markup — drop the remainder
}

export function cleanPostHtml(html: string): string {
  if (!html || !MEDIA_CLASS.test(html)) return html;

  let out = html;
  let searchFrom = 0;
  // Bounded: each pass removes one block, and a post never has many.
  for (let i = 0; i < 20; i += 1) {
    const open = findMediaOpenTag(out, searchFrom);
    if (!open) break;
    const end = findBlockEnd(out, open.end);
    out = out.slice(0, open.start) + MARKER + out.slice(end);
    searchFrom = open.start + MARKER.length;
  }
  return out;
}
