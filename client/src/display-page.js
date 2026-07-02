(function initDisplayPage() {
  "use strict";

  const machine = window.SlotMachineCore.createMachine();
  const eventStatusEl = document.getElementById("eventStatus");

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
          machine.scheduleStopsFromIndices(message.result || []);
        }
      } else if (type === "spin:force") {
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          machine.scheduleStopsFromSymbolNums(message.symbolNums || []);
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
