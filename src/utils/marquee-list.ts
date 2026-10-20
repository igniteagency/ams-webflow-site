const MARQUEE_SPEED = 76.8;

export function duplicateMarqueeList() {
  document.querySelectorAll<HTMLElement>('[data-el="marquee-list"]').forEach((list) => {
    if (list.dataset.marqueeReady) return;
    const track = list.parentElement;
    if (!track) return;
    list.dataset.marqueeReady = 'true';
    list.style.flex = '0 0 auto';
    const originals = Array.from(list.children);
    const repeats: Element[] = [];
    let clone: HTMLElement | undefined;
    let frame = 0;
    let lastWidth = 0;
    let lastUnit = 0;
    let container = track.parentElement;
    while (container && getComputedStyle(container).display === 'contents') {
      container = container.parentElement;
    }
    if (!container) return;
    const viewport = container;

    const decorate = (copy: Element) => {
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      return copy;
    };
    const build = () => {
      frame = 0;
      const width = viewport.getBoundingClientRect().width;
      const unit = originals.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
      const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
      const sequence = unit + gap * originals.length;
      if (!width || !sequence || (width === lastWidth && sequence === lastUnit)) return;
      lastWidth = width;
      lastUnit = sequence;
      clone?.remove();
      repeats.forEach((el) => el.remove());
      repeats.length = 0;
      const count = Math.max(1, Math.ceil((width + gap) / sequence));
      for (let i = 1; i < count; i++) {
        originals.forEach((el) => {
          const copy = decorate(el.cloneNode(true) as Element);
          list.append(copy);
          repeats.push(copy);
        });
      }
      const duration = `${(sequence * count) / MARQUEE_SPEED}s`;
      list.style.animation = 'none';
      list.style.animationDuration = duration;
      clone = decorate(list.cloneNode(true) as HTMLElement) as HTMLElement;
      clone.removeAttribute('data-el');
      track.insertBefore(clone, list.nextSibling);
      void track.offsetWidth;
      list.style.removeProperty('animation');
      clone.style.removeProperty('animation');
      list.style.animationDuration = duration;
      clone.style.animationDuration = duration;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    originals.forEach((el) => observer.observe(el));
    list.querySelectorAll('img').forEach((img) => img.addEventListener('load', schedule));
    document.fonts.ready.then(schedule);
    build();
  });
}
