/* The full picture: a picture in the side panel opens over the whole page, whole and never cropped,
   with its caption, who made it, its licence and a link to the original (asked for, Nov 2026: "we want
   to see it in the full"). An entry with several pictures steps through them: the arrows, the arrow
   keys, the strip at the foot, or a swipe. A click on the picture shows it at its own size, to look
   around it, without zooming the page. Escape, the cross or a click on the dark closes it.
   An item is { src, type: 'image' | 'video', poster, alt, caption, credit, licence, source }. */
export function createViewer(esc) {
  let el = null, items = [], at = 0, title = '', back = null;

  function make() {
    el = document.createElement('div');
    el.id = 'picview'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Picture');
    document.body.append(el);
    el.addEventListener('click', (e) => {
      const c = (s) => e.target.closest(s);
      if (c('[data-pv-x]')) return close();
      if (c('[data-pv-prev]')) return go(at - 1);
      if (c('[data-pv-next]')) return go(at + 1);
      const th = c('[data-pv-at]');
      if (th) return go(Number(th.dataset.pvAt));
      if (c('.pv-stage img')) { el.querySelector('.pv-stage').classList.toggle('zoom'); return undefined; }
      if (e.target.classList.contains('pv-stage') || e.target === el) return close();
      return undefined;
    });
    // A swipe steps to the next or the last picture (not while looking around a picture at its own size).
    let x0 = null;
    el.addEventListener('pointerdown', (e) => { x0 = e.pointerType === 'mouse' || el.querySelector('.pv-stage.zoom') ? null : { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!x0) return;
      const dx = e.clientX - x0.x, dy = e.clientY - x0.y; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(at + (dx < 0 ? 1 : -1));
    });
    addEventListener('keydown', (e) => {
      if (el.hidden) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); e.preventDefault(); go(at + 1); }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); e.preventDefault(); go(at - 1); }
      else if (e.key === ' ') e.stopImmediatePropagation();
    }, true);
  }
  function draw() {
    const m = items[at], many = items.length > 1;
    const media = m.type === 'video'
      ? `<video src="${esc(m.src)}"${m.poster ? ` poster="${esc(m.poster)}"` : ''} controls playsinline autoplay></video>`
      : `<img src="${esc(m.src)}" alt="${esc(m.alt || m.caption || title)}" title="Click to see it at its own size">`;
    const said = [m.credit, m.licence].filter(Boolean).map(esc).join(' · ');
    el.innerHTML = `<div class="pv-top"><div class="pv-name"><b>${esc(title)}</b>${many ? `<small>Picture ${at + 1} of ${items.length}</small>` : ''}</div>
        ${m.source ? `<a class="pv-orig" href="${esc(m.source)}" target="_blank" rel="noopener">Open original ↗</a>` : ''}
        <button type="button" class="pv-x" data-pv-x aria-label="Close">✕</button></div>
      <div class="pv-stage">${media}</div>
      ${many ? '<button type="button" class="pv-nav prev" data-pv-prev aria-label="Previous picture">‹</button><button type="button" class="pv-nav next" data-pv-next aria-label="Next picture">›</button>' : ''}
      <p class="pv-cap">${m.caption ? `<span>${esc(m.caption)}</span>` : ''}${said ? `<small>${said}</small>` : ''}</p>
      ${many ? `<div class="pv-strip">${items.map((x, i) => `<button type="button" data-pv-at="${i}" class="${i === at ? 'on' : ''}" aria-label="Picture ${i + 1}"><img src="${esc(x.type === 'video' ? x.poster || '' : x.src)}" alt="" loading="lazy">${x.type === 'video' ? '<i>▶</i>' : ''}</button>`).join('')}</div>` : ''}`;
  }
  function go(i) { if (items.length < 2) return; at = (i + items.length) % items.length; draw(); }
  function open(name, list, i = 0) {
    if (!list.length) return;
    if (!el) make();
    back = document.activeElement;
    title = name; items = list; at = Math.max(0, Math.min(list.length - 1, i));
    draw();
    el.hidden = false;
    document.body.classList.add('picview');
    el.querySelector('.pv-x').focus();
  }
  function close() {
    if (!el || el.hidden) return;
    el.hidden = true; el.innerHTML = '';
    document.body.classList.remove('picview');
    back?.focus?.({ preventScroll: true });
  }
  return { open, close, isOpen: () => !!el && !el.hidden };
}
