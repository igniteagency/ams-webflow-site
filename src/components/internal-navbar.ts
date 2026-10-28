const HOME_PAGE_ID = '6ac58464423a10a23dfeb5a0';
const INITIALIZED = Symbol.for('ams.internalNavbar');
const BACKGROUND = 'rgba(128,128,128,0.5)';
const BLUR = 'blur(36.3px)';

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
  let scrolled: boolean | undefined;

  function update(self: ScrollTrigger, immediate = false) {
    const next = self.scroll() >= self.start;
    if (next === scrolled && !immediate) return;
    scrolled = next;
    const timing = { duration: immediate || reduced.matches ? 0 : 0.2, overwrite: true };
    gsap.to(bar, {
      backgroundColor: next ? BACKGROUND : 'rgba(128,128,128,0)',
      backdropFilter: next ? BLUR : 'blur(0px)',
      ...timing,
    });
    gsap.to(border, { borderBottomColor: next ? 'transparent' : borderColor, ...timing });
  }

  try {
    gsap.registerPlugin(ScrollTrigger);
    gsap.set(bar, { transitionProperty: 'color' });
    const trigger = ScrollTrigger.create({
      trigger: hero,
      start: () => `bottom top+=${bar.getBoundingClientRect().bottom}`,
      end: 'max',
      onUpdate: (self) => update(self),
      onRefresh: (self) => update(self, true),
    });
    update(trigger, true);
    const refresh = () => trigger.refresh();
    document.fonts.ready.then(refresh);
    addEventListener('pageshow', refresh);
    reduced.addEventListener('change', () => update(trigger, true));
  } catch (error) {
    delete nav[INITIALIZED];
    console.error('Internal navbar scroll could not initialise:', error);
  }
});
