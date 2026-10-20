function show(element: HTMLElement | null, visible: boolean) {
  if (!element) return;
  element.hidden = !visible;
}

function time(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function initNativeVideo(root: HTMLElement) {
  const find = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-video-el="${name}"]`);
  const video = find<HTMLVideoElement>('player');
  const toggle = find<HTMLButtonElement>('toggle');
  if (!video || !toggle || root.dataset.videoReady) return;
  const controlsMode = video.dataset.videoPlayer?.toLowerCase() === 'true';
  const doc = root.ownerDocument;

  const status = find<HTMLElement>('status');
  const seek = find<HTMLInputElement>('seek');
  const elapsed = find<HTMLElement>('time');
  const mute = find<HTMLButtonElement>('mute');
  const volume = find<HTMLInputElement>('volume');
  const fullscreen = find<HTMLButtonElement>('fullscreen');
  const playIcon = find<HTMLElement>('play-icon');
  const pauseIcon = find<HTMLElement>('pause-icon');
  video.removeAttribute('controls');
  video.controls = false;
  video.removeAttribute('autoplay');
  video.autoplay = false;
  video.playsInline = true;
  video.muted = !controlsMode;
  video.loop = !controlsMode;
  if (controlsMode) {
    video.removeAttribute('muted');
    video.removeAttribute('loop');
  }
  root.dataset.videoMode = controlsMode ? 'controls' : 'background';
  root.dataset.videoReady = 'true';

  show(status, false);
  const message = (text: string) => {
    if (status) status.textContent = text;
    show(status, !!text);
  };
  const sync = () => {
    const paused = video.paused || video.ended;
    root.dataset.videoState = video.error ? 'error' : paused ? 'paused' : 'playing';
    toggle.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    show(playIcon, paused);
    show(pauseIcon, !paused);
    if (elapsed) elapsed.textContent = `${time(video.currentTime)} / ${time(video.duration)}`;
    if (seek) {
      seek.disabled = !Number.isFinite(video.duration) || video.duration <= 0;
      seek.max = String(seek.disabled ? 0 : video.duration);
      seek.value = String(video.currentTime || 0);
      seek.setAttribute('aria-valuetext', `${time(video.currentTime)} of ${time(video.duration)}`);
    }
    if (mute) {
      const muted = video.muted || video.volume === 0;
      mute.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
      mute.setAttribute('aria-pressed', String(muted));
      show(find<HTMLElement>('volume-up-icon'), !muted);
      show(find<HTMLElement>('volume-off-icon'), muted);
    }
    if (volume) volume.value = String(video.muted ? 0 : video.volume);
  };
  const play = () => {
    message('');
    return video.play().catch(() => {
      message('Playback could not start. Press Play to try again.');
      sync();
    });
  };
  let userPaused = false;
  let userStarted = false;
  toggle.addEventListener('click', () => {
    userPaused = !video.paused && !video.ended;
    userStarted = !userPaused;
    if (userPaused) video.pause();
    else void play();
  });
  for (const event of [
    'play',
    'pause',
    'ended',
    'timeupdate',
    'durationchange',
    'loadedmetadata',
    'volumechange',
  ])
    video.addEventListener(event, sync);
  video.addEventListener('error', () => {
    message('Video could not load. Check the video source and try again.');
    sync();
  });
  seek?.addEventListener('input', () => {
    if (Number.isFinite(video.duration) && video.duration > 0)
      video.currentTime = Math.min(video.duration, Math.max(0, Number(seek.value)));
    sync();
  });
  mute?.addEventListener('click', () => {
    const silent = video.muted || video.volume === 0;
    if (video.volume === 0) video.volume = 1;
    video.muted = !silent;
    sync();
  });
  volume?.addEventListener('input', () => {
    video.volume = Math.min(1, Math.max(0, Number(volume.value)));
    video.muted = video.volume === 0;
    sync();
  });
  const syncFullscreen = () => {
    const active = doc.fullscreenElement === root;
    fullscreen?.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    show(find<HTMLElement>('fullscreen-icon'), !active);
    show(find<HTMLElement>('fullscreen-exit-icon'), active);
  };
  if (fullscreen) fullscreen.disabled = !doc.fullscreenEnabled || !root.requestFullscreen;
  fullscreen?.addEventListener('click', () => {
    const operation =
      doc.fullscreenElement === root ? doc.exitFullscreen() : root.requestFullscreen();
    operation.catch(() => message('Fullscreen is unavailable in this browser.'));
  });
  doc.addEventListener('fullscreenchange', syncFullscreen);
  syncFullscreen();
  sync();
  if (controlsMode) {
    const view = doc.defaultView;
    const hover = view?.matchMedia('(hover: hover) and (pointer: fine)');
    const controls = find<HTMLElement>('controls');
    if (!view || !hover || !controls) return;
    let timer: number | undefined;
    let over = root.matches(':hover');
    const pointers = new Set<number>();
    const reveal = () => {
      view.clearTimeout(timer);
      timer = undefined;
      root.dataset.videoControlsHidden = 'false';
    };
    const canHide = () =>
      hover.matches &&
      !over &&
      !root.contains(doc.activeElement) &&
      !pointers.size &&
      !video.paused &&
      !video.ended &&
      !video.error;
    const update = () => {
      reveal();
      if (canHide())
        timer = view.setTimeout(() => {
          timer = undefined;
          if (canHide()) root.dataset.videoControlsHidden = 'true';
        }, 2000);
    };
    root.dataset.videoControlsReady = 'true';
    root.addEventListener('pointerenter', () => {
      over = true;
      reveal();
    });
    root.addEventListener('pointerleave', () => {
      over = false;
      update();
    });
    root.addEventListener('focusin', reveal);
    root.addEventListener('focusout', () => {
      view.queueMicrotask(update);
    });
    controls.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId);
      reveal();
    });
    const release = (event: PointerEvent) => {
      if (pointers.delete(event.pointerId)) update();
    };
    doc.addEventListener('pointerup', release);
    doc.addEventListener('pointercancel', release);
    for (const event of ['play', 'pause', 'ended', 'error']) video.addEventListener(event, update);
    hover.addEventListener('change', update);
    update();
    return;
  }
  const view = doc.defaultView;
  const motion = view?.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (
    view?.navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        addEventListener?: (name: string, callback: () => void) => void;
      };
    }
  )?.connection;
  let inView = !view?.IntersectionObserver;
  const updatePlayback = () => {
    const allowed =
      inView &&
      !doc.hidden &&
      !userPaused &&
      (userStarted || (!motion?.matches && !connection?.saveData));
    video.autoplay = allowed;
    if (allowed) void play();
    else video.pause();
  };
  motion?.addEventListener('change', updatePlayback);
  connection?.addEventListener?.('change', updatePlayback);
  doc.addEventListener('visibilitychange', updatePlayback);
  if (view?.IntersectionObserver) {
    new view.IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        updatePlayback();
      },
      { threshold: 0.05 }
    ).observe(root);
  } else updatePlayback();
}

export function initNativeVideos(scope: ParentNode = document) {
  scope
    .querySelectorAll<HTMLElement>('[data-video-controller="starter-native-v1"]')
    .forEach(initNativeVideo);
}

if (typeof window !== 'undefined') {
  window.Webflow = window.Webflow || [];
  window.Webflow.push(() => initNativeVideos());
}
