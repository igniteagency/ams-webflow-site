const HOME_PAGE_ID = '6ac58464423a10a23dfeb5a0';
const FLIP_URL = 'https://cdn.prod.website-files.com/gsap/3.15.0/Flip.min.js';
const SCROLL_DISTANCE = 0.7;
const LIFT_DISTANCE = 0.16;

window.Webflow = window.Webflow || [];
window.Webflow.push(() => {
  if (document.documentElement.dataset.wfPage !== HOME_PAGE_ID) return;

  const hero = document.querySelector('[data-el="home-hero"]');
  const source = hero?.querySelector<SVGSVGElement>('[data-el="home-hero-logo"] svg');
  const nav = document.querySelector('[data-el="navbar"]');
  const brand = nav?.querySelector('[data-el="navbar-brand"]');
  const link = brand?.querySelector('a');
  const name = brand?.querySelector('p');
  const mark = link?.querySelector('svg');
  if (!hero || !source || !nav || !brand || !link || !name || !mark) return;
  if (
    hero.dataset.logoScroll ||
    typeof gsap === 'undefined' ||
    typeof ScrollTrigger === 'undefined'
  ) {
    return;
  }

  hero.dataset.logoScroll = 'loading';

  async function start(
    hero: HTMLElement,
    source: SVGSVGElement,
    nav: HTMLElement,
    name: HTMLElement,
    mark: HTMLElement
  ) {
    if (typeof Flip === 'undefined') await window.loadScript(FLIP_URL);
    await document.fonts.ready;
    gsap.registerPlugin(Flip, ScrollTrigger);

    const navbar = nav.querySelector('[data-el="navbar-bar"]');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const originals = new Map(
      [source, nav, name, mark, ...(navbar ? [navbar] : [])].map((element) => [element, element.getAttribute('style')])
    );
    const restore = (element: HTMLElement | SVGSVGElement) => {
      const style = originals.get(element);
      if (style == null) element.removeAttribute('style');
      else element.setAttribute('style', style);
    };
    const traveller = document.createElement('div');
    const travellingMark = source.cloneNode(true) as SVGSVGElement;
    for (const attribute of ['id', 'class', 'style', 'data-w-id', 'data-flip-id']) {
      travellingMark.removeAttribute(attribute);
    }
    gsap.set(travellingMark, { display: 'block', width: '100%', height: '100%' });
    traveller.append(travellingMark);
    traveller.setAttribute('aria-hidden', 'true');
    traveller.dataset.el = 'home-logo-traveller';
    gsap.set(traveller, {
      position: 'fixed',
      color: getComputedStyle(source).color,
      pointerEvents: 'none',
      maxWidth: 'none',
      margin: 0,
      opacity: 0,
      zIndex: Number(getComputedStyle(nav).zIndex) - 1,
    });
    document.body.append(traveller);

    let timeline: gsap.core.Timeline | undefined;
    let trigger: ScrollTrigger | undefined;
    let frame = 0;
    let origin: DOMRect;
    let sourceMatrix: DOMMatrix;

    function sync() {
      if (!timeline) return;
      const progress = timeline.progress();
      const lift = Math.min(1, progress / LIFT_DISTANCE);
      traveller.style.opacity = String(progress === 1 ? 0 : lift);
      mark.style.opacity = progress === 1 ? '1' : '0';
      hero.dataset.logoScroll = progress === 0 ? 'hero' : progress === 1 ? 'nav' : 'moving';
      if (progress === 0) {
        restore(source);
      } else if (lift === 1) {
        source.style.visibility = 'hidden';
      } else {
        // Match the travelling mark while it lifts out from behind the bridge.
        const rect = traveller.getBoundingClientRect();
        const scale = rect.width / origin.width;
        source.style.visibility = 'visible';
        source.style.transformOrigin = '0 0';
        source.style.transform = `matrix(${scale},0,0,${scale},${sourceMatrix.e + rect.x - origin.x},${sourceMatrix.f + rect.y - origin.y + scrollY})`;
      }
    }

    function build() {
      trigger?.kill();
      timeline?.kill();
      restore(source);
      restore(name);
      if (navbar) {
        restore(navbar);
        gsap.set(navbar, { transitionProperty: 'color' });
      }
      gsap.set(nav, { position: 'fixed' });
      const rect = source.getBoundingClientRect();
      origin = new DOMRect(rect.x, rect.y + scrollY, rect.width, rect.height);
      sourceMatrix = new DOMMatrix(getComputedStyle(source).transform);
      const end = mark.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      gsap.set(traveller, {
        clearProps: 'transform',
        autoRound: false,
        left: origin.x,
        top: origin.y,
        width: origin.width,
        height: origin.height,
      });
      gsap.set(name, { x: end.x - nameRect.x });
      const first = Flip.getState([traveller, name]);
      gsap.set(traveller, {
        left: end.x,
        top: end.y,
        width: end.width,
        height: end.height,
        autoRound: false,
      });
      gsap.set(name, { x: 0 });
      timeline = gsap.timeline({ paused: true, onUpdate: sync });
      timeline.add(
        Flip.from(first, { duration: 1, scale: true, ease: 'none', autoRound: false }),
        0
      );
      if (navbar) {
        timeline.fromTo(
          navbar,
          { backgroundColor: 'rgba(255,255,255,0)', backdropFilter: 'blur(0px)' },
          { backgroundColor: '#fff3', backdropFilter: 'blur(36.3px)', duration: 0.2, ease: 'none' },
          0.8
        );
      }
      const distance = Math.round(innerHeight * SCROLL_DISTANCE);
      if (reduced.matches) {
        trigger = ScrollTrigger.create({
          start: 0,
          end: distance,
          onUpdate: (self) => timeline?.progress(self.scroll() > 20 ? 1 : 0),
        });
        timeline.progress(scrollY > 20 ? 1 : 0);
      } else {
        trigger = ScrollTrigger.create({
          start: 0,
          end: distance,
          animation: timeline,
          scrub: true,
        });
        timeline.progress(Math.min(1, Math.max(0, scrollY / distance)));
      }
      sync();
    }

    function scheduleBuild() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(build);
    }

    function cleanup() {
      cancelAnimationFrame(frame);
      trigger?.kill();
      timeline?.kill();
      traveller.remove();
      originals.forEach((_, element) => restore(element));
      delete hero.dataset.logoScroll;
      removeEventListener('resize', scheduleBuild);
      removeEventListener('pageshow', scheduleBuild);
      reduced.removeEventListener('change', scheduleBuild);
    }

    try {
      build();
      addEventListener('resize', scheduleBuild);
      addEventListener('pageshow', scheduleBuild);
      reduced.addEventListener('change', scheduleBuild);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  start(hero, source, nav, name, mark).catch((error) => {
    delete hero.dataset.logoScroll;
    console.error('Home logo scroll could not initialise:', error);
  });
});
