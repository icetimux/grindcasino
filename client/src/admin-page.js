(function initAdminPage() {
  "use strict";

  const machine = window.SlotMachineCore.createMachine();
  const autoStopMs = window.SlotMachineCore.constants.AUTO_STOP_MS;

  const forceBtn = document.getElementById("forceBtn");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const countdownEl = document.getElementById("countdown");
  const eventStatusEl = document.getElementById("eventStatus");

  let autoStopTimer = null;
  let countdownInterval = null;
  let startRequested = false;

  function updateEventStatus(text) {
    if (eventStatusEl) {
      eventStatusEl.textContent = text;
    }
  }

  function setStartEnabled(enabled) {
    if (startBtn) {
      startBtn.disabled = !enabled;
    }

    if (enabled) {
      startRequested = false;
    }
  }

  function clearCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (countdownEl) {
      countdownEl.textContent = "0.0s";
    }

    if (forceBtn) {
      forceBtn.classList.remove("urgent");
    }
  }

  function startCountdown() {
    clearCountdown();

    const end = performance.now() + autoStopMs;
    if (countdownEl) {
      countdownEl.textContent = "4.0s";
    }
    if (forceBtn) {
      forceBtn.disabled = false;
    }

    countdownInterval = setInterval(() => {
      const remaining = Math.max(0, end - performance.now());

      if (countdownEl) {
        countdownEl.textContent = (remaining / 1000).toFixed(1) + "s";
      }

      if (forceBtn) {
        if (remaining <= 1000 && remaining > 0) {
          forceBtn.classList.add("urgent");
        } else {
          forceBtn.classList.remove("urgent");
        }
      }

      if (remaining <= 0) {
        clearCountdown();
        if (forceBtn) {
          forceBtn.disabled = true;
        }
      }
    }, 100);
  }

  function stopAutoStopTimer() {
    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }
  }

  function startSpinLocally() {
    stopAutoStopTimer();
    machine.startSpin();
    setStartEnabled(false);
    startCountdown();
    autoStopTimer = setTimeout(() => {
      autoStopTimer = null;
      stopRandom();
    }, autoStopMs);
  }

  function stopLocally(result) {
    stopAutoStopTimer();
    clearCountdown();
    machine.scheduleStopsFromIndices(result);
    setStartEnabled(true);
  }

  function stopLocallyBySymbols(symbolNums) {
    stopAutoStopTimer();
    clearCountdown();
    machine.scheduleStopsFromSymbolNums(symbolNums);
    setStartEnabled(true);
  }

  const wsClient = window.SlotMachineCore.connectWebSocket({
    statusElement: "wsStatus",
    onMessage(message) {
      const type = message.type || message.cmd;

      if (type === "spin:start") {
        if (!machine.isSpinning()) {
          startRequested = false;
          startSpinLocally();
        }
      } else if (type === "spin:stop") {
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          if (forceBtn) {
            forceBtn.disabled = true;
          }
          stopLocally(message.result || []);
        }
      } else if (type === "spin:force") {
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          if (forceBtn) {
            forceBtn.disabled = true;
          }
          stopLocallyBySymbols(message.symbolNums || []);
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

  function start() {
    if (machine.isSpinning() || startRequested) {
      return;
    }

    startRequested = true;
    setStartEnabled(false);
    wsClient.send({ type: "spin:start" });
  }

  function stopRandom() {
    if (!machine.isSpinning()) {
      return;
    }

    const result = machine.randomResult();
    wsClient.send({ type: "spin:stop", result });
  }

  function forceStop() {
    const symbolNums = [
      +document.getElementById("a").value || 1,
      +document.getElementById("b").value || 1,
      +document.getElementById("c").value || 1,
    ];

    if (machine.isSpinning()) {
      if (forceBtn) {
        forceBtn.disabled = true;
      }
      wsClient.send({ type: "spin:force", symbolNums });
    }
  }

  if (startBtn) {
    startBtn.addEventListener("click", start);
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", stopRandom);
  }

  if (forceBtn) {
    forceBtn.addEventListener("click", forceStop);
  }

  setStartEnabled(true);
})();
