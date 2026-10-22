const REVEAL_SELECTOR = '[data-reveal], [data-reveal-stagger]';
const STAGGER_SELECTOR = ":scope > *:not(.display-contents):not([class*='spacer'])";

export function initRevealFallback() {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
  if (!elements.length) return;
  const targets = (element: HTMLElement) =>
    element.hasAttribute('data-reveal-stagger')
      ? Array.from(element.querySelectorAll<HTMLElement>(STAGGER_SELECTOR)).filter(
          (child) => !child.closest('[data-stagger-stop]')
        )
      : [element];
  elements.forEach((element) => {
    if (element.hasAttribute('data-reveal-stagger')) {
      targets(element).forEach((child, index) => {
        child.style.setProperty('--reveal-index', String(index));
      });
    }
  });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const showWithoutMotion = () => {
    elements.forEach((element) => {
      element.classList.add('is-revealed');
      targets(element).forEach((target) => {
        target.style.animation = 'none';
        target.style.opacity = '1';
      });
    });
  };
  if (motion.matches) {
    showWithoutMotion();
    return;
  }
  if (typeof CSS !== 'undefined' && CSS.supports('animation-trigger: --reveal-trigger play-once'))
    return;

  // The published .reveal-fallback CSS starts persistent animations on
  // .is-revealed. Leave that class off; own temporary inline state only.
  const pending = new Set(elements);
  const restorers = new Map<HTMLElement, () => void>();
  const animations = new Set<Animation>();
  let observer: IntersectionObserver | undefined;
  const property = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const time = (name: string, fallback: number) => {
    const value = property(name);
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed * (value.endsWith('ms') ? 1 : 1000)
      : fallback;
  };
  const cleanup = () => {
    if (pending.size) return;
    observer?.disconnect();
    window.removeEventListener('resize', observe);
    window.removeEventListener('pageshow', observe);
    window.removeEventListener('load', observe);
    if (!animations.size) motion.removeEventListener('change', reduceMotion);
  };
  const show = (target: HTMLElement) => {
    restorers.get(target)?.();
    restorers.delete(target);
  };
  const reveal = (element: HTMLElement, animate = true) => {
    if (!pending.delete(element)) return;
    element.classList.add('is-revealed');
    observer?.unobserve(element);
    targets(element).forEach((target, index) => {
      if (!animate) {
        show(target);
        return;
      }
      try {
        const animation = target.animate(
          [
            {
              opacity: property('--reveal-opacity') || '0',
              transform: `translateY(${property('--animation--fade-distance') || property('--reveal-y') || '3rem'})`,
            },
            { opacity: '1', transform: 'translateY(0)' },
          ],
          {
            duration: time('--reveal-duration', 800),
            easing: property('--reveal-ease') || 'cubic-bezier(0.19, 1, 0.22, 1)',
            delay: element.hasAttribute('data-reveal-stagger')
              ? index * time('--reveal-stagger', 80)
              : 0,
            fill: 'both',
          }
        );
        animations.add(animation);
        const finish = () => {
          animation.onfinish = animation.oncancel = null;
          show(target);
          animations.delete(animation);
          animation.cancel();
          cleanup();
        };
        animation.onfinish = animation.oncancel = finish;
      } catch {
        show(target);
      }
    });
    cleanup();
  };
  function reduceMotion() {
    if (!motion.matches) return;
    animations.forEach((animation) => animation.cancel());
    restorers.forEach((restore) => restore());
    restorers.clear();
    elements.forEach((element) => reveal(element, false));
    showWithoutMotion();
    cleanup();
  }
  function observe() {
    observer?.disconnect();
    try {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.boundingClientRect.top <= window.innerHeight * 0.5) {
              reveal(entry.target as HTMLElement);
            }
          });
        },
        { rootMargin: `0px 0px -${window.innerHeight * 0.5}px 0px`, threshold: 0 }
      );
      pending.forEach((element) => {
        // Initial/deep-link, load, bfcache and resize only; no scroll layout loop.
        if (element.getBoundingClientRect().top <= window.innerHeight * 0.5) reveal(element);
        else observer?.observe(element);
      });
    } catch {
      elements.forEach((element) => reveal(element, false));
    }
    cleanup();
  }
  if (
    !('IntersectionObserver' in window) ||
    elements.some((element) => targets(element).some((target) => !target.animate))
  ) {
    elements.forEach((element) => reveal(element, false));
    return;
  }
  try {
    elements.forEach((element) => {
      targets(element).forEach((target) => {
        if (restorers.has(target)) return;
        const opacity = target.style.getPropertyValue('opacity');
        const priority = target.style.getPropertyPriority('opacity');
        restorers.set(target, () => {
          if (opacity) target.style.setProperty('opacity', opacity, priority);
          else target.style.removeProperty('opacity');
        });
        target.style.opacity = property('--reveal-opacity') || '0';
      });
    });
    motion.addEventListener('change', reduceMotion);
    window.addEventListener('resize', observe);
    window.addEventListener('pageshow', observe);
    window.addEventListener('load', observe);
    observe();
  } catch {
    elements.forEach((element) => reveal(element, false));
  }
}
