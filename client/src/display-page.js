(function initDisplayPage() {
  "use strict";

  const machine = window.SlotMachineCore.createMachine({
    onSpinStart() {
      if (window.SlotAudio) {
        window.SlotAudio.playSpinStart();
      }
    },
    onReelStopped(index, isLast) {
      if (window.SlotAudio) {
        window.SlotAudio.playReelStop();
        if (isLast) {
          window.SlotAudio.fadeOutSpin(200);
        }
      }
    },
    onResult(symbolIds, soundKey) {
      if (window.SlotAudio && soundKey) {
        // Wait a beat after the reels settle before the result sound.
        setTimeout(() => window.SlotAudio.playWin(soundKey), 150);
      }
    },
  });
  const eventStatusEl = document.getElementById("eventStatus");

  function applySetupAudioConfig() {
    if (!window.SlotAudio || typeof window.SlotAudio.configureWinSounds !== "function") {
      return;
    }

    const setup = window.SlotMachineCore.getActiveSetup();
    const winRules = setup && setup.winRules ? setup.winRules : null;
    const soundFiles = winRules && winRules.soundFiles ? winRules.soundFiles : null;
    window.SlotAudio.configureWinSounds(soundFiles);
  }

  // Load the reel setup from reels.json (falls back to the built-in default),
  // then redraw the reels with it.
  window.SlotMachineCore.loadSetup().then(() => {
    machine.rebuild();
    applySetupAudioConfig();
  });

  function updateEventStatus(text) {
    if (eventStatusEl) {
      eventStatusEl.textContent = text;
    }
  }

  window.SlotMachineCore.connectWebSocket({
    statusElement: "wsStatus",
    onMessage(message) {
      const type = message.type || message.cmd;

      if (type === "spin:start") {
        if (!machine.isSpinning()) {
          machine.startSpin();
        }
      } else if (type === "spin:stop") {
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          machine.scheduleStopsFromIndices(message.result || [], message.soundKey || null);
        }
      } else if (type === "spin:force") {
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          machine.scheduleStopsFromSymbolNums(message.symbolNums || [], message.soundKey || null);
        }
      } else if (type === "impact") {
        updateEventStatus(
          "Last event: impact on sensor " +
          (message.sensor ?? "?") +
          " intensity " +
          Number(message.intensity ?? 0).toFixed(2)
        );
      }
    },
    onInvalidMessage() {
      updateEventStatus("Last event: invalid websocket payload");
    },
  });
})();
