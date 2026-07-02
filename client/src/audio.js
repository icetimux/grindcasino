(function initSlotAudio(global) {
  "use strict";

  const HowlCtor = global.Howl;
  const HowlerGlobal = global.Howler;

  function makeSound(src) {
    if (!HowlCtor) {
      return { play() {} };
    }

    return new HowlCtor({
      src: [src],
      preload: true,
      // Web Audio (html5:false) allows the same clip to overlap/layer,
      // which we want when reels stop close together.
      html5: false,
    });
  }

  const spinning = makeSound("/public/sounds/spinning.wav");
  const thunk = makeSound("/public/sounds/thunk.wav");

  // Result sounds, keyed to match reels.json winRules sound keys.
  const winSounds = {
    jackpot: makeSound("/public/sounds/jackpot.wav"),
    bigwin: makeSound("/public/sounds/bigwin.wav"),
    win: makeSound("/public/sounds/win.wav"),
    lose: makeSound("/public/sounds/lose.wav"),
  };

  let unlocked = false;
  let spinId = null;

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
      spinId = spinning.play();
    },
    // Plays each time a reel comes to a complete stop. Calls overlap by design.
    playReelStop() {
      thunk.play();
    },
    // Plays a result sound by key ("jackpot" | "bigwin" | "win" | "lose").
    // Call when all reels have fully stopped.
    playWin(key) {
      const sound = winSounds[key];
      if (sound) {
        sound.play();
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
