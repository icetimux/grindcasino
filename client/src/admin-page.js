(function initAdminPage() {
  "use strict";

  const machine = window.SlotMachineCore.createMachine();

  // Load the reel setup from reels.json (falls back to the built-in default),
  // then redraw the reels and the legend with it.
  renderLegend();
  window.SlotMachineCore.loadSetup().then(() => {
    machine.rebuild();
    renderLegend();
    renderScenarioButtons();
  });

  function renderLegend() {
    const legendEl = document.getElementById("legend");
    if (!legendEl) {
      return;
    }

    const setup = window.SlotMachineCore.getActiveSetup();
    const symbols = setup && Array.isArray(setup.symbols) ? setup.symbols.slice() : [];
    symbols.sort((a, b) => a.id - b.id);

    legendEl.innerHTML = "";
    symbols.forEach((symbol) => {
      const item = document.createElement("span");
      item.className = "legend-item";
      item.appendChild(document.createTextNode(symbol.id + "="));

      if (symbol.image) {
        const img = document.createElement("img");
        img.className = "legend-img";
        img.src = symbol.image;
        img.alt = symbol.label || "";
        item.appendChild(img);
      } else {
        item.appendChild(document.createTextNode(symbol.glyph || ""));
      }

      item.appendChild(document.createTextNode(" " + (symbol.label || "")));
      legendEl.appendChild(item);
    });
  }

  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const scenarioButtonsEl = document.getElementById("scenarioButtons");
  const eventStatusEl = document.getElementById("eventStatus");
  const scenarioButtons = [];

  const SCENARIOS = [
    { sound: "jackpot", color: "green", label: "JACKPOT" },
    { sound: "bigwin", color: "yellow", label: "HIGH WIN" },
    { sound: "win", color: "orange", label: "MID WIN" },
    { sound: "lose", color: "red", label: "LOSE", hideSymbols: true },
  ];

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

  let startRequested = false;
  let remoteSpinning = false;

  function createScenarioSymbolNode(symbol) {
    if (symbol && symbol.image) {
      const img = document.createElement("img");
      img.className = "scenario-symbol-img";
      img.src = symbol.image;
      img.alt = symbol.label || "";
      return img;
    }

    const span = document.createElement("span");
    span.className = "scenario-symbol-text";
    span.textContent = symbol && symbol.glyph ? symbol.glyph : "?";
    return span;
  }

  function getScenarioRules() {
    const setup = window.SlotMachineCore.getActiveSetup();
    const winRules = setup && setup.winRules ? setup.winRules : null;
    const rules = winRules && Array.isArray(winRules.rules) ? winRules.rules : [];
    const ruleBySound = {};

    rules.forEach((rule) => {
      if (rule && rule.sound && Array.isArray(rule.symbols)) {
        const key = normalizeSoundKey(rule.sound);
        if (key) {
          ruleBySound[key] = rule.symbols.slice();
        }
      }
    });

    return SCENARIOS.map((scenario) => {
      if (scenario.hideSymbols) {
        return {
          ...scenario,
          symbols: [],
        };
      }

      return {
        ...scenario,
        symbols: ruleBySound[scenario.sound] || [],
      };
    });
  }

  function symbolsSignature(symbolNums) {
    return (symbolNums || []).slice().sort((a, b) => a - b).join(",");
  }

  function getRuleSignatures() {
    const setup = window.SlotMachineCore.getActiveSetup();
    const winRules = setup && setup.winRules ? setup.winRules : null;
    const rules = winRules && Array.isArray(winRules.rules) ? winRules.rules : [];
    const signatures = new Set();

    rules.forEach((rule) => {
      if (rule && Array.isArray(rule.symbols) && rule.symbols.length >= 3) {
        signatures.add(symbolsSignature(rule.symbols.slice(0, 3)));
      }
    });

    return signatures;
  }

  function randomDistinctIds(ids) {
    const pool = ids.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, 3);
  }

  function pickForcedLoseSymbols() {
    const setup = window.SlotMachineCore.getActiveSetup();
    const ids = (setup && Array.isArray(setup.symbols) ? setup.symbols : []).map((symbol) => symbol && symbol.id).filter((id) => Number.isInteger(id));

    if (ids.length < 3) {
      return [];
    }

    const blocked = getRuleSignatures();

    for (let attempt = 0; attempt < 80; attempt++) {
      const candidate = randomDistinctIds(ids);
      if (new Set(candidate).size !== 3) {
        continue;
      }
      if (!blocked.has(symbolsSignature(candidate))) {
        return candidate;
      }
    }

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        for (let k = j + 1; k < ids.length; k++) {
          const candidate = [ids[i], ids[j], ids[k]];
          if (!blocked.has(symbolsSignature(candidate))) {
            return candidate;
          }
        }
      }
    }

    return [];
  }

  function forceScenarioStop(scenario) {
    if (!remoteSpinning || !scenario) {
      return;
    }

    if (scenario.sound === "lose") {
      const loseSymbols = pickForcedLoseSymbols();
      if (loseSymbols.length >= 3) {
        wsClient.send({ type: "spin:force", symbolNums: loseSymbols, soundKey: "lose" });
      }
      return;
    }

    forceStop(scenario.symbols);
  }

  function renderScenarioButtons() {
    if (!scenarioButtonsEl) {
      return;
    }

    scenarioButtonsEl.innerHTML = "";
    scenarioButtons.length = 0;

    const setup = window.SlotMachineCore.getActiveSetup();
    const symbols = (setup && Array.isArray(setup.symbols) ? setup.symbols : []).slice();
    const symbolById = {};
    symbols.forEach((symbol) => {
      symbolById[symbol.id] = symbol;
    });

    getScenarioRules().forEach((scenario) => {
      const button = document.createElement("button");
      button.className = "scenario-btn scenario-" + scenario.color;
      button.type = "button";

      const title = document.createElement("span");
      title.className = "scenario-title";
      title.textContent = scenario.label;
      button.appendChild(title);

      if (!scenario.hideSymbols) {
        const symbolsWrap = document.createElement("span");
        symbolsWrap.className = "scenario-symbols";

        scenario.symbols.forEach((id) => {
          const symbol = symbolById[id] || null;
          const token = document.createElement("span");
          token.className = "scenario-symbol-token";
          token.appendChild(createScenarioSymbolNode(symbol));
          symbolsWrap.appendChild(token);
        });

        button.appendChild(symbolsWrap);
      }

      button.addEventListener("click", () => forceScenarioStop(scenario));

      scenarioButtons.push(button);
      scenarioButtonsEl.appendChild(button);
    });

    syncControls();
  }

  function setScenarioButtonsEnabled(enabled) {
    scenarioButtons.forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function setStopEnabled(enabled) {
    if (stopBtn) {
      stopBtn.disabled = !enabled;
    }
  }

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

  function syncControls() {
    setStartEnabled(!remoteSpinning);
    setStopEnabled(remoteSpinning);
    setScenarioButtonsEnabled(remoteSpinning);
  }

  function startSpinLocally() {
    remoteSpinning = true;
    machine.startSpin();
    syncControls();
  }

  function stopLocally(result) {
    remoteSpinning = false;
    machine.scheduleStopsFromIndices(result);
    syncControls();
  }

  function stopLocallyBySymbols(symbolNums) {
    remoteSpinning = false;
    machine.scheduleStopsFromSymbolNums(symbolNums);
    syncControls();
  }

  const wsClient = window.SlotMachineCore.connectWebSocket({
    statusElement: "wsStatus",
    onMessage(message) {
      const type = message.type || message.cmd;

      if (type === "spin:start") {
        remoteSpinning = true;
        if (!machine.isSpinning()) {
          startRequested = false;
          startSpinLocally();
        } else {
          syncControls();
        }
      } else if (type === "spin:stop") {
        remoteSpinning = false;
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          machine.scheduleStopsFromIndices(message.result || [], message.soundKey || null);
          syncControls();
        } else {
          syncControls();
        }
      } else if (type === "spin:force") {
        remoteSpinning = false;
        if (machine.isSpinning() && !machine.hasPendingResult()) {
          machine.scheduleStopsFromSymbolNums(message.symbolNums || [], message.soundKey || null);
          syncControls();
        } else {
          syncControls();
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
    if (remoteSpinning || startRequested) {
      return;
    }

    startRequested = true;
    syncControls();
    wsClient.send({ type: "spin:start" });
  }

  function stopRandom() {
    if (!remoteSpinning) {
      return;
    }

    const result = machine.randomResult();
    wsClient.send({ type: "spin:stop", result });
  }

  function forceStop(symbolNums) {
    if (remoteSpinning && Array.isArray(symbolNums) && symbolNums.length >= 3) {
      wsClient.send({ type: "spin:force", symbolNums });
    }
  }

  if (startBtn) {
    startBtn.addEventListener("click", start);
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", stopRandom);
  }

  renderScenarioButtons();

  syncControls();
})();
