/**
 * Música de fondo: en <body> data-bgm="overture" (lobby y juego) o "halo" (multijugador).
 * Si el navegador bloquea autoplay, inicia con el primer clic o tecla.
 */
(function () {
  'use strict';

  var SRC = {
    overture: 'assets/sfx/Overture.MP3',
    halo: 'assets/sfx/Halo.MP3'
  };
  var AUDIO_SFX_KEY = 'pintagol_audio_sfx_volume';
  var AUDIO_MUSIC_KEY = 'pintagol_audio_music_volume';
  var AUDIO_PREV_SFX_KEY = 'pintagol_audio_prev_sfx_volume';
  var AUDIO_PREV_MUSIC_KEY = 'pintagol_audio_prev_music_volume';
  var DEFAULT_VOLUME_PERCENT = 72;

  function clampVolumePercent(value, fallback) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  function loadMusicVolume() {
    try {
      var raw = window.localStorage.getItem(AUDIO_MUSIC_KEY);
      var percent = raw == null ? DEFAULT_VOLUME_PERCENT : clampVolumePercent(raw, DEFAULT_VOLUME_PERCENT);
      return percent / 100;
    } catch (_err) {
      return DEFAULT_VOLUME_PERCENT / 100;
    }
  }

  function loadPercent(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw == null) return fallback;
      return clampVolumePercent(raw, fallback);
    } catch (_err) {
      return fallback;
    }
  }

  function savePercent(key, value) {
    try {
      window.localStorage.setItem(key, String(clampVolumePercent(value, 0)));
    } catch (_err) {
      /* no-op */
    }
  }

  function isTypingTarget(target) {
    if (!target) return false;
    var tag = String(target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
  }

  function getMode() {
    var b = document.body;
    if (!b) return 'overture';
    var mode = (b.getAttribute('data-bgm') || '').toLowerCase();
    return SRC[mode] ? mode : 'overture';
  }

  function init() {
    if (document.getElementById('pintagol-bgm')) return;
    var a = new Audio();
    a.id = 'pintagol-bgm';
    a.preload = 'auto';
    a.loop = true;
    a.volume = loadMusicVolume();
    a.src = SRC[getMode()];
    document.body.appendChild(a);

    function cleanup() {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    }
    function unlock() {
      a.play()
        .then(cleanup)
        .catch(function () {});
    }
    a.play()
      .then(cleanup)
      .catch(function () {
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
      });

    function applyMusicVolume() {
      a.volume = loadMusicVolume();
    }

    window.addEventListener('storage', function (ev) {
      if (!ev || ev.key !== AUDIO_MUSIC_KEY) return;
      applyMusicVolume();
    });

    window.addEventListener('keydown', function (ev) {
      if (!ev || ev.code !== 'KeyM' || ev.repeat) return;
      if (isTypingTarget(ev.target)) return;
      var currentMusic = loadPercent(AUDIO_MUSIC_KEY, DEFAULT_VOLUME_PERCENT);
      var currentSfx = loadPercent(AUDIO_SFX_KEY, DEFAULT_VOLUME_PERCENT);
      var currentlyMuted = currentMusic === 0 && currentSfx === 0;
      if (!currentlyMuted) {
        savePercent(AUDIO_PREV_MUSIC_KEY, currentMusic);
        savePercent(AUDIO_PREV_SFX_KEY, currentSfx);
        savePercent(AUDIO_MUSIC_KEY, 0);
        savePercent(AUDIO_SFX_KEY, 0);
      } else {
        var restoreMusic = loadPercent(AUDIO_PREV_MUSIC_KEY, DEFAULT_VOLUME_PERCENT);
        var restoreSfx = loadPercent(AUDIO_PREV_SFX_KEY, DEFAULT_VOLUME_PERCENT);
        savePercent(AUDIO_MUSIC_KEY, restoreMusic);
        savePercent(AUDIO_SFX_KEY, restoreSfx);
      }
      applyMusicVolume();
      ev.preventDefault();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
