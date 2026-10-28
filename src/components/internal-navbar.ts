const HOME_PAGE_ID = '6ac58464423a10a23dfeb5a0';
const INITIALIZED = Symbol.for('ams.internalNavbar');
const BACKGROUND = 'rgba(128,128,128,0.5)';
const BLUR = 'blur(36.3px)';
const FADE_SCROLL_DISTANCE = 0.7 * 0.2;

window.Webflow = window.Webflow || [];
window.Webflow.push(() => {
  if (document.documentElement.dataset.wfPage === HOME_PAGE_ID) return;

  const nav = document.querySelector<HTMLElement & { [INITIALIZED]?: boolean }>(
    '[data-el="navbar"]'
  );
  const bar = nav?.querySelector('[data-el="navbar-bar"]');
  const border = nav?.querySelector('[data-el="navbar-border"]');
  const hero = document.querySelector('[data-el="page-hero"]');
  if (!nav || !bar || !border || !hero || nav[INITIALIZED]) return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  nav[INITIALIZED] = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const borderColor = getComputedStyle(border).borderBottomColor;
  try {
    gsap.registerPlugin(ScrollTrigger);
    gsap.set(bar, { transitionProperty: 'color' });
    const fade = gsap.timeline({ paused: true });
    fade.fromTo(bar,
      { backgroundColor: 'rgba(128,128,128,0)', backdropFilter: 'blur(0px)' },
      { backgroundColor: BACKGROUND, backdropFilter: BLUR, duration: 1, ease: 'none' }, 0);
    fade.fromTo(border,
      { borderBottomColor: borderColor },
      { borderBottomColor: 'transparent', duration: 1, ease: 'none' }, 0);
    const update = (self: ScrollTrigger) => {
      const progress = Math.min(1, Math.max(0,
        (self.scroll() - self.start) / (self.end - self.start)));
      fade.progress(reduced.matches ? (progress > 0 ? 1 : 0) : progress);
    };
    const trigger = ScrollTrigger.create({
      trigger: hero,
      start: () => `center top+=${bar.getBoundingClientRect().bottom}`,
      end: () => `+=${Math.max(1, innerHeight * FADE_SCROLL_DISTANCE)}`,
      onUpdate: update,
      onRefresh: update,
    });
    update(trigger);
    const refresh = () => trigger.refresh();
    document.fonts.ready.then(refresh);
    addEventListener('pageshow', refresh);
    reduced.addEventListener('change', () => update(trigger));
  } catch (error) {
    delete nav[INITIALIZED];
    console.error('Internal navbar scroll could not initialise:', error);
  }
});
