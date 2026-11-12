const SCENES = ['sydney', 'melbourne'] as const;
const SELECTED = Symbol.for('ams.homeHeroScene');
type Hero = HTMLElement & { [SELECTED]?: string };

export function initHomeHeroScene() {
  const hero = document.querySelector<Hero>('.section_hero-header');
  if (!hero || hero[SELECTED]) return;
  const controller = hero.querySelector('[data-video-controller="starter-native-v1"]');
  const video = controller?.querySelector<HTMLVideoElement>('[data-video-el="player"]');
  const source = video?.querySelector<HTMLSourceElement>('source');
  const artwork = hero.querySelector('.ams-hero_artwork');
  const settings = hero.querySelector('.component-style[data-hero-sydney-video]');
  if (!video || !source || !artwork || controller?.dataset.videoReady) return;

  const scene = SCENES[Math.random() < 0.5 ? 0 : 1];
  const videoUrl = settings?.getAttribute(`data-hero-${scene}-video`)?.trim();
  const posterUrl = settings?.getAttribute(`data-hero-${scene}-poster`)?.trim();
  const mask = getComputedStyle(artwork).getPropertyValue(`--home-bridge-mask-${scene}`);
  if (!videoUrl || !posterUrl || !mask.trim()) return;

  source.setAttribute('data-video-src', videoUrl);
  video.setAttribute('poster', posterUrl);
  artwork.style.setProperty('--home-bridge-mask', mask);
  hero[SELECTED] = scene;
}
