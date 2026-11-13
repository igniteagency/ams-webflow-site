const HOME_PAGE_ID = '6ac58464423a10a23dfeb5a0';
const INITIALIZED = Symbol.for('ams.homeHeroScene');

export function initHomeHeroScene() {
  const root = document.documentElement as HTMLElement & { [INITIALIZED]?: boolean };
  if (root.dataset.wfPage !== HOME_PAGE_ID || root[INITIALIZED]) return;
  root[INITIALIZED] = true;
  const scene = Math.random() < 0.5 ? 'sydney' : 'melbourne';
  root.dataset.homeHeroScene = scene;

  let observer: MutationObserver | undefined;
  let poster: HTMLImageElement | undefined;
  let posterReady = false;
  let video: HTMLVideoElement | undefined;
  const reveal = () => {
    if (!video) return;
    root.dataset.homeHeroMedia = 'ready';
    video.removeEventListener('loadeddata', reveal);
  };
  const fallback = () => {
    delete root.dataset.homeHeroScene;
    observer?.disconnect();
    return true;
  };
  const apply = () => {
    const hero = document.querySelector('.section_hero-header');
    const settings = hero?.querySelector('.bg-visual_component[data-hero-sydney-video]');
    if (!settings) return false;
    const videoUrl = settings.getAttribute(`data-hero-${scene}-video`)?.trim();
    const posterUrl = settings.getAttribute(`data-hero-${scene}-poster`)?.trim();
    if (!videoUrl || !posterUrl) return fallback();

    const controller = settings.querySelector('[data-video-controller="starter-native-v1"]');
    if (controller?.dataset.videoReady) return fallback();
    if (!poster) {
      poster = new Image();
      poster.fetchPriority = 'high';
      poster.src = posterUrl;
      poster.decode().then(() => {
        posterReady = true;
        reveal();
      }, () => { /* Keep the embedded preview if the full poster fails. */ });
    }

    const player = controller?.querySelector<HTMLVideoElement>('[data-video-el="player"]');
    const source = player?.querySelector<HTMLSourceElement>('source');
    if (!player || !source) return false;
    video = player;
    source.setAttribute('data-video-src', videoUrl);
    video.setAttribute('poster', posterUrl);
    video.addEventListener('loadeddata', reveal, { once: true });
    if (posterReady || video.readyState >= 2) reveal();
    return true;
  };

  // Observe streaming HTML so the selected poster starts before DOMContentLoaded.
  if (apply()) return;
  if (document.readyState !== 'loading') return void fallback();
  observer = new MutationObserver(() => {
    if (apply()) observer?.disconnect();
  });
  observer.observe(root, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    observer?.disconnect();
    if (!video && !apply()) fallback();
  }, { once: true });
}
