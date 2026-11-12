const SCENES = [
  {
    name: 'sydney',
    video: 'https://vz-a8209381-f64.b-cdn.net/adff7128-8019-4292-b12d-2e84754650c3/playlist.m3u8',
    poster: 'https://vz-a8209381-f64.b-cdn.net/adff7128-8019-4292-b12d-2e84754650c3/thumbnail.jpg',
  },
  {
    name: 'melbourne',
    video:
      'https://australian-motoring-services.webflow.io/video-manager/media/3066a941-d42f-48e5-a653-9211f886c662/playlist.m3u8',
    poster:
      'https://australian-motoring-services.webflow.io/video-manager/media/3066a941-d42f-48e5-a653-9211f886c662/poster',
  },
] as const;
const SELECTED = Symbol.for('ams.homeHeroScene');
type Hero = HTMLElement & { [SELECTED]?: string };

export function initHomeHeroScene() {
  const hero = document.querySelector<Hero>('.section_hero-header');
  if (!hero || hero[SELECTED]) return;
  const controller = hero.querySelector('[data-video-controller="starter-native-v1"]');
  const video = controller?.querySelector<HTMLVideoElement>('[data-video-el="player"]');
  const source = video?.querySelector<HTMLSourceElement>('source');
  const artwork = hero.querySelector('.ams-hero_artwork');
  if (!video || !source || !artwork || controller?.dataset.videoReady) return;

  const scene = SCENES[Math.random() < 0.5 ? 0 : 1];
  const mask = getComputedStyle(artwork).getPropertyValue(`--home-bridge-mask-${scene.name}`);
  if (!mask.trim()) return;

  source.setAttribute('data-video-src', scene.video);
  video.setAttribute('poster', scene.poster);
  artwork.style.setProperty('--home-bridge-mask', mask);
  hero[SELECTED] = scene.name;
}
