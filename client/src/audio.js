(function initSlotAudio(global) {
  "use strict";

  const HowlCtor = global.Howl;
  const HowlerGlobal = global.Howler;

  function makeSound(src, options) {
    const config = options || {};

    if (!HowlCtor) {
      return { play() {} };
    }

    return new HowlCtor({
      src: [src],
      preload: true,
      loop: Boolean(config.loop),
      // Web Audio (html5:false) allows the same clip to overlap/layer,
      // which we want when reels stop close together.
      html5: false,
    });
  }

  const spinning = makeSound("/public/sounds/spinning.wav", { loop: true });
  const thunk = makeSound("/public/sounds/thunk.wav");

  // Result sounds, keyed to match reels.json winRules sound keys.
  // This project currently ships a single result clip; all keys map to win.wav.
  const resultClip = "/public/sounds/win.wav";
  const winSounds = {
    jackpot: makeSound(resultClip),
    bigwin: makeSound(resultClip),
    win: makeSound(resultClip),
    lose: makeSound(resultClip),
  };

  const RESULT_FADE_MS = 400;
  const RESULT_MIN_HOLD_MS = 250;

  let unlocked = false;
  let spinId = null;

  function normalizeSoundKey(value) {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
      return "";
    }

    return trimmed.replace(/\.wav$/i, "");
  }

  function showUnlockOverlay() {
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "audioUnlock";
    overlay.textContent = "🔊 Click to enable sound";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font:600 clamp(18px,4vw,42px)/1.2 system-ui,sans-serif",
      "color:#fff",
      "background:rgba(0,0,0,0.72)",
      "cursor:pointer",
      "z-index:9999",
      "text-align:center",
      "padding:24px",
    ].join(";");

    function unlock() {
      if (unlocked) {
        return;
      }
      unlocked = true;

      // Resume the Web Audio context that browsers keep suspended until a gesture.
      if (HowlerGlobal && HowlerGlobal.ctx && HowlerGlobal.ctx.state !== "running") {
        HowlerGlobal.ctx.resume();
      }

      overlay.removeEventListener("click", unlock);
      global.removeEventListener("keydown", unlock);
      global.removeEventListener("touchstart", unlock);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    overlay.addEventListener("click", unlock);
    global.addEventListener("keydown", unlock);
    global.addEventListener("touchstart", unlock);

    document.body.appendChild(overlay);
  }

  if (HowlCtor) {
    // If audio is already permitted (context running) we skip the overlay.
    const ctxRunning = HowlerGlobal && HowlerGlobal.ctx && HowlerGlobal.ctx.state === "running";
    if (ctxRunning) {
      unlocked = true;
    } else if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showUnlockOverlay);
      } else {
        showUnlockOverlay();
      }
    }
  }

  global.SlotAudio = {
    // Plays once when the reels start spinning.
    playSpinStart() {
      if (HowlCtor && spinId !== null && spinId !== undefined) {
        spinning.stop(spinId);
      }
      spinId = spinning.play();
      if (HowlCtor && spinId !== null && spinId !== undefined) {
        spinning.volume(1, spinId);
      }
    },
    // Plays each time a reel comes to a complete stop. Calls overlap by design.
    playReelStop() {
      thunk.play();
    },
    // Plays a result sound by key ("jackpot" | "bigwin" | "win" | "lose").
    // Call when all reels have fully stopped.
    playWin(key) {
      const sound = winSounds[normalizeSoundKey(key)] || winSounds.win;
      if (sound) {
        const id = sound.play();

        if (!HowlCtor || id === null || id === undefined) {
          return;
        }

        sound.loop(false, id);
        sound.volume(1, id);

        const durationMs = Math.max(0, sound.duration(id) * 1000);
        const fadeMs = Math.min(RESULT_FADE_MS, Math.max(120, Math.round(durationMs * 0.45)));
        const fadeDelay = durationMs > 0
          ? Math.max(RESULT_MIN_HOLD_MS, Math.round(durationMs - fadeMs))
          : 700;

        setTimeout(() => {
          const fromVolume = sound.volume(id);
          sound.fade(fromVolume, 0, fadeMs, id);
          setTimeout(() => sound.stop(id), fadeMs + 30);
        }, fadeDelay);
      }
    },
    // Fades the spinning loop to silence over durationMs, then stops it.
    // Call when the final reel has fully stopped.
    fadeOutSpin(durationMs) {
      const duration = typeof durationMs === "number" ? durationMs : 500;
      if (!HowlCtor || spinId === null || spinId === undefined) {
        return;
      }
      const id = spinId;
      spinId = null;
      spinning.fade(spinning.volume(id), 0, duration, id);
      setTimeout(() => spinning.stop(id), duration);
    },
  };
})(window);
