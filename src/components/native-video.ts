import Hls from 'hls.js';

const HLS_TYPE = /^(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl))(?:\s*;|$)/i;
const HLS_URL = /\.m3u8(?:[?#]|$)/i;

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
  const view = doc.defaultView;
  const motion = view?.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = (
    view?.navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        addEventListener?: EventTarget['addEventListener'];
        removeEventListener?: EventTarget['removeEventListener'];
      };
    }
  )?.connection;
  let disposed = false;
  const disposers: (() => void)[] = [];
  const on = <T extends Event>(
    target: {
      addEventListener?: EventTarget['addEventListener'];
      removeEventListener?: EventTarget['removeEventListener'];
    },
    name: string,
    callback: (event: T) => void
  ) => {
    target.addEventListener?.(name, callback as EventListener);
    disposers.push(() => target.removeEventListener?.(name, callback as EventListener));
  };
  const originalSrc = video.getAttribute('src');
  const authoredSource = video.getAttribute('src')
    ? video
    : Array.from(video.querySelectorAll<HTMLSourceElement>('source[src]')).find((source) => {
        const type = source.getAttribute('type') || '';
        return (
          !type ||
          HLS_TYPE.test(type) ||
          HLS_URL.test(source.getAttribute('src') || '') ||
          video.canPlayType(type)
        );
      });
  const source = authoredSource?.getAttribute('src') || '';
  const isHls = HLS_URL.test(source) || HLS_TYPE.test(authoredSource?.getAttribute('type') || '');
  const useHls = isHls && !video.canPlayType('application/vnd.apple.mpegurl');
  let hls: Hls | undefined;
  let failed = false;
  let networkRecoveries = 0;
  let mediaRecoveries = 0;
  let nativeRetry = false;
  let nativeRecoveries = 0;
  let playRequested = false;
  const pause = () => {
    playRequested = false;
    video.pause();
  };

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    disposers.forEach((dispose) => dispose());
    hls?.destroy();
    hls = undefined;
    pause();
    if (useHls) {
      if (originalSrc === null) video.removeAttribute('src');
      else video.setAttribute('src', originalSrc);
    }
    delete root.dataset.videoReady;
    delete root.dataset.videoControlsReady;
    delete root.dataset.videoControlsHidden;
  };
  if (view)
    on(view, 'pagehide', (event: PageTransitionEvent) => {
      if (!event.persisted) cleanup();
    });
  if (view?.MutationObserver) {
    const observer = new view.MutationObserver(() => {
      if (!root.isConnected) cleanup();
    });
    observer.observe(doc, { childList: true, subtree: true });
    disposers.push(() => observer.disconnect());
  }

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
    root.dataset.videoState = failed || video.error ? 'error' : paused ? 'paused' : 'playing';
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
  const fail = (text = 'Video could not load. Check the video source and reload the page.') => {
    failed = true;
    hls?.destroy();
    hls = undefined;
    pause();
    message(text);
    sync();
  };
  if (isHls && !useHls && authoredSource && authoredSource !== video)
    on(authoredSource, 'error', () => fail());
  const play = (explicit = false) => {
    if (disposed) return;
    if (nativeRetry && explicit) {
      nativeRetry = false;
      failed = false;
      nativeRecoveries++;
      video.load();
    }
    if (disposed || failed) return;
    message('');
    playRequested = true;
    if (useHls && !hls) {
      if (!Hls.isSupported()) {
        fail('HLS video is not supported in this browser.');
        return;
      }
      try {
        hls = new Hls({ autoStartLoad: false });
        const instance = hls;
        instance.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (!disposed && !failed && playRequested) void play();
        });
        instance.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal || failed) return;
          const code = data.response?.code || 0;
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            !(code >= 400 && code < 500 && code !== 408 && code !== 429) &&
            networkRecoveries++ < 1
          ) {
            if (data.details === 'manifestLoadError' || data.details === 'manifestLoadTimeOut')
              instance.loadSource(source);
            else instance.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 1)
            instance.recoverMediaError();
          else fail();
        });
        instance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (
            view?.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)')
              .matches &&
            !motion?.matches &&
            !connection?.saveData
          ) {
            let preferred = -1;
            instance.levels.forEach((level, index) => {
              if (
                level.height > 0 &&
                level.height <= 1080 &&
                (preferred === -1 || level.height > instance.levels[preferred].height)
              )
                preferred = index;
            });
            instance.startLevel = preferred;
          }
          instance.startLoad();
        });
        hls.loadSource(source);
        hls.attachMedia(video);
      } catch (error) {
        console.error('Video HLS setup failed.', error);
        fail();
        return;
      }
    }
    return video.play().catch((error) => {
      if (disposed || failed || error?.name === 'AbortError') return;
      message('Playback could not start. Press Play to try again.');
      sync();
    });
  };
  let userPaused = false;
  let userStarted = false;
  on(toggle, 'click', () => {
    userPaused = !video.paused && !video.ended;
    userStarted = !userPaused;
    if (userPaused) pause();
    else void play(true);
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
    on(video, event, sync);
  on(video, 'error', () => {
    if (isHls) {
      if (useHls) return;
      nativeRetry = nativeRecoveries < 1 && [2, 3].includes(video.error?.code || 0);
      fail(
        nativeRetry
          ? 'Video could not load. Press Play to try again.'
          : 'Video could not load. Check the video source and reload the page.'
      );
      return;
    }
    message('Video could not load. Check the video source and try again.');
    sync();
  });
  if (seek)
    on(seek, 'input', () => {
      if (Number.isFinite(video.duration) && video.duration > 0)
        video.currentTime = Math.min(video.duration, Math.max(0, Number(seek.value)));
      sync();
    });
  if (mute)
    on(mute, 'click', () => {
      const silent = video.muted || video.volume === 0;
      if (video.volume === 0) video.volume = 1;
      video.muted = !silent;
      sync();
    });
  if (volume)
    on(volume, 'input', () => {
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
  if (fullscreen)
    on(fullscreen, 'click', () => {
      const operation =
        doc.fullscreenElement === root ? doc.exitFullscreen() : root.requestFullscreen();
      operation.catch(() => message('Fullscreen is unavailable in this browser.'));
    });
  on(doc, 'fullscreenchange', syncFullscreen);
  syncFullscreen();
  sync();
  if (controlsMode) {
    const view = doc.defaultView;
    const hover = view?.matchMedia('(hover: hover) and (pointer: fine)');
    const controls = find<HTMLElement>('controls');
    if (!view || !hover || !controls) return cleanup;
    let timer: number | undefined;
    disposers.push(() => view.clearTimeout(timer));
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
      !failed &&
      !video.error;
    const update = () => {
      if (disposed) return;
      reveal();
      if (canHide())
        timer = view.setTimeout(() => {
          timer = undefined;
          if (canHide()) root.dataset.videoControlsHidden = 'true';
        }, 2000);
    };
    root.dataset.videoControlsReady = 'true';
    on(root, 'pointerenter', () => {
      over = true;
      reveal();
    });
    on(root, 'pointerleave', () => {
      over = false;
      update();
    });
    on(root, 'focusin', reveal);
    on(root, 'focusout', () => {
      view.queueMicrotask(update);
    });
    on(controls, 'pointerdown', (event: PointerEvent) => {
      pointers.add(event.pointerId);
      reveal();
    });
    const release = (event: PointerEvent) => {
      if (pointers.delete(event.pointerId)) update();
    };
    on(doc, 'pointerup', release);
    on(doc, 'pointercancel', release);
    for (const event of ['play', 'pause', 'ended', 'error']) on(video, event, update);
    on(hover, 'change', update);
    update();
    return cleanup;
  }
  let inView = !view?.IntersectionObserver;
  const updatePlayback = () => {
    if (disposed) return;
    const allowed =
      inView &&
      !doc.hidden &&
      !userPaused &&
      (userStarted || (!motion?.matches && !connection?.saveData));
    video.autoplay = allowed;
    if (allowed) void play();
    else pause();
  };
  if (motion) on(motion, 'change', updatePlayback);
  if (connection) on(connection, 'change', updatePlayback);
  on(doc, 'visibilitychange', updatePlayback);
  if (view?.IntersectionObserver) {
    const observer = new view.IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        updatePlayback();
      },
      { threshold: 0.05 }
    );
    observer.observe(root);
    disposers.push(() => observer.disconnect());
  } else updatePlayback();
  return cleanup;
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
