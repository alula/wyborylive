(() => {
  // UI Text Constants
  const UI_TEXT = {
    CONNECTION: {
      CONNECTED: "POŁĄCZONO",
      CONNECTING: "ŁĄCZENIE...",
      DISCONNECTED: "ROZŁĄCZONO",
    },
    SOUND: {
      ENABLE: "WŁĄCZ DŹWIĘK",
      DISABLE: "WYŁĄCZ DŹWIĘK",
      TOOLTIP_ENABLE: "Włącz powiadomienia dźwiękowe",
      TOOLTIP_DISABLE: "Wyłącz powiadomienia dźwiękowe",
      TOOLTIP_CLICK_TO_ENABLE: "Kliknij aby włączyć powiadomienia dźwiękowe",
      TOOLTIP_BLOCKED: "Powiadomienia dźwiękowe zablokowane przez przeglądarkę",
    },
    FULLSCREEN: {
      ENTER: "PEŁNY EKRAN",
      EXIT: "NORMALNY WIDOK",
    },
    ERRORS: {
      DATA_PROCESSING: "Błąd podczas przetwarzania danych",
      ERROR_PREFIX: "Błąd: ",
    },
  };

  let eventSource = null;
  let lastData = null;
  let isFullscreen = false;
  let serverVersion = null;
  let soundEnabled = false;
  let notificationSound = null;

  // Initialize notification sound
  function initSound() {
    notificationSound = new Audio("/gadu.wav");
    notificationSound.preload = "auto";
    notificationSound.volume = 0.7;
  }

  // Check if audio can be played (autoplay permissions)
  async function checkAudioCapability() {
    if (!notificationSound) return false;

    try {
      // Try to play and immediately pause to test autoplay capability
      const playPromise = notificationSound.play();
      if (playPromise !== undefined) {
        await playPromise;
        notificationSound.pause();
        notificationSound.currentTime = 0;
        return true;
      }
    } catch (error) {
      console.log("Audio autoplay blocked:", error);
      return false;
    }
    return false;
  }

  // Load sound setting from localStorage
  async function loadSoundSetting() {
    const savedSound = localStorage.getItem("wyborySoundEnabled");
    const soundToggle = document.getElementById("soundToggle");

    // Check if audio can be played
    const canPlayAudio = await checkAudioCapability();

    if (!canPlayAudio) {
      // Audio is blocked, disable sound and update button
      soundEnabled = false;
      soundToggle.textContent = UI_TEXT.SOUND.ENABLE;
      soundToggle.classList.remove("enabled");
      soundToggle.title = UI_TEXT.SOUND.TOOLTIP_CLICK_TO_ENABLE;
    } else {
      // Audio can be played, use saved setting
      soundEnabled = savedSound === "true";
      if (soundEnabled) {
        soundToggle.textContent = UI_TEXT.SOUND.DISABLE;
        soundToggle.classList.add("enabled");
        soundToggle.title = UI_TEXT.SOUND.TOOLTIP_DISABLE;
      } else {
        soundToggle.textContent = UI_TEXT.SOUND.ENABLE;
        soundToggle.classList.remove("enabled");
        soundToggle.title = UI_TEXT.SOUND.TOOLTIP_ENABLE;
      }
    }
  }

  // Play notification sound
  function playNotificationSound() {
    if (soundEnabled && notificationSound) {
      notificationSound.currentTime = 0;
      notificationSound.play().catch((error) => {
        console.log("Could not play notification sound:", error);
        // If sound fails, disable it and update button
        soundEnabled = false;
        const soundToggle = document.getElementById("soundToggle");
        soundToggle.textContent = UI_TEXT.SOUND.ENABLE;
        soundToggle.classList.remove("enabled");
        soundToggle.title = UI_TEXT.SOUND.TOOLTIP_BLOCKED;
        localStorage.setItem("wyborySoundEnabled", "false");
      });
    }
  }

  // Load fullscreen setting from localStorage and check if mobile
  function loadFullscreenSetting() {
    const savedFullscreen = localStorage.getItem("wyboryFullscreen");
    const isMobile = window.innerWidth <= 768;

    // Default to fullscreen on desktop, normal view on mobile
    isFullscreen = savedFullscreen ? savedFullscreen === "true" : !isMobile;

    const body = document.body;
    const toggle = document.getElementById("fullscreenToggle");

    if (isFullscreen) {
      body.classList.add("fullscreen-mode");
      toggle.textContent = UI_TEXT.FULLSCREEN.EXIT;
    } else {
      body.classList.remove("fullscreen-mode");
      toggle.textContent = UI_TEXT.FULLSCREEN.ENTER;
    }
  }

  function formatNumber(num) {
    return num.toLocaleString("pl-PL");
  }

  function updateConnectionStatus(status) {
    const statusEl = document.getElementById("connectionStatus");
    statusEl.className = "connection-status status-" + status;

    switch (status) {
      case "connected":
        statusEl.textContent = UI_TEXT.CONNECTION.CONNECTED;
        break;
      case "connecting":
        statusEl.textContent = UI_TEXT.CONNECTION.CONNECTING;
        break;
      case "disconnected":
        statusEl.textContent = UI_TEXT.CONNECTION.DISCONNECTED;
        break;
    }
  }

  function renderElectionData(data) {
    const content = document.getElementById("content");
    const lastUpdate = document.getElementById("lastUpdate");

    // Check if this is new data
    const isNewData =
      lastData && JSON.stringify(lastData) !== JSON.stringify(data);

    // Update last update timestamp
    const updateTime = new Date(data.lastUpdate).toLocaleString("pl-PL");
    lastUpdate.textContent = `Ostatnia aktualizacja: ${updateTime}`;

    // Calculate percentages
    const trzaskowskiPercent =
      data.totalVotes > 0
        ? ((data.totalTrzaskowski / data.totalVotes) * 100).toFixed(2)
        : "0.00";
    const nawrockiPercent =
      data.totalVotes > 0
        ? ((data.totalNawrocki / data.totalVotes) * 100).toFixed(2)
        : "0.00";
    const invalidPercent =
      data.totalVotes > 0
        ? ((data.totalInvalidVotes / data.totalVotes) * 100).toFixed(2)
        : "0.00";

    // Detect which data has changed for visual feedback
    let changedElements = [];
    if (lastData) {
      if (lastData.totalTrzaskowski !== data.totalTrzaskowski)
        changedElements.push("trzaskowski");
      if (lastData.totalNawrocki !== data.totalNawrocki)
        changedElements.push("nawrocki");
      if (lastData.totalInvalidVotes !== data.totalInvalidVotes)
        changedElements.push("invalid");
    }

    if (isFullscreen) {
      content.innerHTML = `
                    <div class="fullscreen-content">
                        <div class="national-results">
                            <h2 class="national-title">Wyniki Ogólnokrajowe</h2>
                            
                            <div class="vote-bar">
                                <div class="vote-bar-fill trzaskowski-fill" style="width: ${trzaskowskiPercent}%">
                                    ${trzaskowskiPercent}%
                                </div>
                                <div class="vote-bar-fill nawrocki-fill" style="width: ${nawrockiPercent}%">
                                    ${nawrockiPercent}%
                                </div>
                            </div>
                            
                            <div class="vote-summary">
                                <div class="candidate-summary trzaskowski-summary ${
                                  changedElements.includes("trzaskowski")
                                    ? "data-updated"
                                    : ""
                                }">
                                    <div class="candidate-name">TRZASKOWSKI Rafał</div>
                                    <div class="candidate-votes">${formatNumber(
                                      data.totalTrzaskowski
                                    )}</div>
                                    <div class="candidate-percentage">${trzaskowskiPercent}%</div>
                                </div>
                                <div class="candidate-summary nawrocki-summary ${
                                  changedElements.includes("nawrocki")
                                    ? "data-updated"
                                    : ""
                                }">
                                    <div class="candidate-name">NAWROCKI Karol</div>
                                    <div class="candidate-votes">${formatNumber(
                                      data.totalNawrocki
                                    )}</div>
                                    <div class="candidate-percentage">${nawrockiPercent}%</div>
                                </div>
                                <div class="candidate-summary invalid-summary ${
                                  changedElements.includes("invalid")
                                    ? "data-updated"
                                    : ""
                                }">
                                    <div class="candidate-name">Głosy nieważne</div>
                                    <div class="candidate-votes">${formatNumber(
                                      data.totalInvalidVotes
                                    )}</div>
                                    <div class="candidate-percentage">${invalidPercent}%</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="voivodeships">
                            <h2 class="voivodeships-title">Wyniki według województw</h2>
                            <div class="voivodeships-grid">
                                ${data.voivodeships
                                  .map((voiv) => {
                                    const tPercent =
                                      voiv.total > 0
                                        ? (
                                            (voiv.trzaskowski / voiv.total) *
                                            100
                                          ).toFixed(1)
                                        : "0.0";
                                    const nPercent =
                                      voiv.total > 0
                                        ? (
                                            (voiv.nawrocki / voiv.total) *
                                            100
                                          ).toFixed(1)
                                        : "0.0";

                                    // Check if this voivodeship data changed
                                    const oldVoiv = lastData?.voivodeships.find(
                                      (v) => v.name === voiv.name
                                    );
                                    const voivChanged =
                                      oldVoiv &&
                                      (oldVoiv.trzaskowski !==
                                        voiv.trzaskowski ||
                                        oldVoiv.nawrocki !== voiv.nawrocki);

                                    return `
                                        <div class="voivodeship ${
                                          voivChanged ? "data-updated" : ""
                                        }">
                                            <div class="voivodeship-header">
                                                <div class="voivodeship-name">${
                                                  voiv.name
                                                }</div>
                                                <div class="voivodeship-total">${formatNumber(
                                                  voiv.total
                                                )} głosów</div>
                                            </div>
                                            <div class="voivodeship-bar">
                                                <div class="voivodeship-fill trzaskowski-fill" style="width: ${tPercent}%">
                                                    T: ${tPercent}%
                                                </div>
                                                <div class="voivodeship-fill nawrocki-fill" style="width: ${nPercent}%; right: 0;">
                                                    N: ${nPercent}%
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                  })
                                  .join("")}
                            </div>
                        </div>
                    </div>
                `;
    } else {
      content.innerHTML = `
                    <div class="national-results">
                        <h2 class="national-title">Wyniki Ogólnokrajowe</h2>
                        
                        <div class="vote-bar">
                            <div class="vote-bar-fill trzaskowski-fill" style="width: ${trzaskowskiPercent}%">
                                ${trzaskowskiPercent}%
                            </div>
                            <div class="vote-bar-fill nawrocki-fill" style="width: ${nawrockiPercent}%">
                                ${nawrockiPercent}%
                            </div>
                        </div>
                        
                        <div class="vote-summary">
                            <div class="candidate-summary trzaskowski-summary ${
                              changedElements.includes("trzaskowski")
                                ? "data-updated"
                                : ""
                            }">
                                <div class="candidate-name">TRZASKOWSKI Rafał</div>
                                <div class="candidate-votes">${formatNumber(
                                  data.totalTrzaskowski
                                )}</div>
                                <div class="candidate-percentage">${trzaskowskiPercent}%</div>
                            </div>
                            <div class="candidate-summary nawrocki-summary ${
                              changedElements.includes("nawrocki")
                                ? "data-updated"
                                : ""
                            }">
                                <div class="candidate-name">NAWROCKI Karol</div>
                                <div class="candidate-votes">${formatNumber(
                                  data.totalNawrocki
                                )}</div>
                                <div class="candidate-percentage">${nawrockiPercent}%</div>
                            </div>
                            <div class="candidate-summary invalid-summary ${
                              changedElements.includes("invalid")
                                ? "data-updated"
                                : ""
                            }">
                                <div class="candidate-name">Głosy nieważne</div>
                                <div class="candidate-votes">${formatNumber(
                                  data.totalInvalidVotes
                                )}</div>
                                <div class="candidate-percentage">${invalidPercent}%</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="voivodeships">
                        <h2 class="voivodeships-title">Wyniki według województw</h2>
                        <div class="voivodeships-grid">
                            ${data.voivodeships
                              .map((voiv) => {
                                const tPercent =
                                  voiv.total > 0
                                    ? (
                                        (voiv.trzaskowski / voiv.total) *
                                        100
                                      ).toFixed(1)
                                    : "0.0";
                                const nPercent =
                                  voiv.total > 0
                                    ? (
                                        (voiv.nawrocki / voiv.total) *
                                        100
                                      ).toFixed(1)
                                    : "0.0";

                                // Check if this voivodeship data changed
                                const oldVoiv = lastData?.voivodeships.find(
                                  (v) => v.name === voiv.name
                                );
                                const voivChanged =
                                  oldVoiv &&
                                  (oldVoiv.trzaskowski !== voiv.trzaskowski ||
                                    oldVoiv.nawrocki !== voiv.nawrocki);

                                return `
                                    <div class="voivodeship ${
                                      voivChanged ? "data-updated" : ""
                                    }">
                                        <div class="voivodeship-header">
                                            <div class="voivodeship-name">${
                                              voiv.name
                                            }</div>
                                            <div class="voivodeship-total">Łącznie głosów: ${formatNumber(
                                              voiv.total
                                            )}</div>
                                        </div>
                                        <div class="voivodeship-bar">
                                            <div class="voivodeship-fill trzaskowski-fill" style="width: ${tPercent}%">
                                                T: ${tPercent}%
                                            </div>
                                            <div class="voivodeship-fill nawrocki-fill" style="width: ${nPercent}%; right: 0;">
                                                N: ${nPercent}%
                                            </div>
                                        </div>
                                    </div>
                                `;
                              })
                              .join("")}
                        </div>
                    </div>
                `;
    }

    // Play notification sound and add updating animation if data changed
    if (isNewData) {
      playNotificationSound();
      content.classList.add("updating");
      setTimeout(() => content.classList.remove("updating"), 1000);
    }

    lastData = data;
  }

  function showError(message) {
    const content = document.getElementById("content");
    content.innerHTML = `
                <div class="error">
                    ${UI_TEXT.ERRORS.ERROR_PREFIX}${message}
                </div>
            `;
  }

  function connectToEventSource() {
    updateConnectionStatus("connecting");

    eventSource = new EventSource("/api/elections/stream2");

    eventSource.onopen = function () {
      console.log("Connected to election data stream v2");
      updateConnectionStatus("connected");
    };

    eventSource.onmessage = function (event) {
      try {
        const message = JSON.parse(event.data);
        console.log("Received message:", message);

        switch (message.type) {
          case "version":
            if (serverVersion && serverVersion !== message.data.serverVersion) {
              console.log("Server version changed, reloading page...");
              window.location.reload();
              return;
            }
            serverVersion = message.data.serverVersion;
            console.log("Server version:", serverVersion);
            break;

          case "election-data":
            renderElectionData(message.data);
            break;

          case "keepalive":
            if (serverVersion && serverVersion !== message.data.serverVersion) {
              console.log(
                "Server version changed during keepalive, reloading page..."
              );
              window.location.reload();
              return;
            }
            console.log("Keepalive received");
            break;

          default:
            console.log("Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("Error parsing message:", error);
        showError(UI_TEXT.ERRORS.DATA_PROCESSING);
      }
    };

    eventSource.onerror = function (error) {
      console.error("EventSource error:", error);
      updateConnectionStatus("disconnected");
      eventSource.close();

      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        console.log("Attempting to reconnect...");
        connectToEventSource();
      }, 5000);
    };
  }

  function toggleFullscreen() {
    const body = document.body;
    const toggle = document.getElementById("fullscreenToggle");

    isFullscreen = !isFullscreen;

    if (isFullscreen) {
      body.classList.add("fullscreen-mode");
      toggle.textContent = UI_TEXT.FULLSCREEN.EXIT;
    } else {
      body.classList.remove("fullscreen-mode");
      toggle.textContent = UI_TEXT.FULLSCREEN.ENTER;
    }

    // Save fullscreen setting
    localStorage.setItem("wyboryFullscreen", isFullscreen.toString());

    // Re-render current data with new layout
    if (lastData) {
      renderElectionData(lastData);
    }
  }

  function toggleSound() {
    const soundToggle = document.getElementById("soundToggle");

    if (!soundEnabled) {
      // Try to enable sound - this requires user interaction
      soundEnabled = true;

      // Test if we can play audio now (with user interaction)
      if (notificationSound) {
        notificationSound.currentTime = 0;
        notificationSound
          .play()
          .then(() => {
            // Success - audio is now enabled
            soundToggle.textContent = UI_TEXT.SOUND.DISABLE;
            soundToggle.classList.add("enabled");
            soundToggle.title = UI_TEXT.SOUND.TOOLTIP_DISABLE;
            localStorage.setItem("wyborySoundEnabled", "true");
            console.log("Audio notifications enabled");
          })
          .catch((error) => {
            // Failed - audio still blocked
            console.log("Audio still blocked after user interaction:", error);
            soundEnabled = false;
            soundToggle.textContent = UI_TEXT.SOUND.ENABLE;
            soundToggle.classList.remove("enabled");
            soundToggle.title = UI_TEXT.SOUND.TOOLTIP_BLOCKED;
            localStorage.setItem("wyborySoundEnabled", "false");
          });
      }
    } else {
      // Disable sound
      soundEnabled = false;
      soundToggle.textContent = UI_TEXT.SOUND.ENABLE;
      soundToggle.classList.remove("enabled");
      soundToggle.title = UI_TEXT.SOUND.TOOLTIP_ENABLE;
      localStorage.setItem("wyborySoundEnabled", "false");
      console.log("Audio notifications disabled");
    }
  }

  // Start connection when page loads
  document.addEventListener("DOMContentLoaded", function () {
    initSound();
    loadFullscreenSetting();
    // Load sound setting after a short delay to ensure DOM is ready
    setTimeout(() => loadSoundSetting(), 100);
    connectToEventSource();

    // Add fullscreen toggle event listener
    const fullscreenToggle = document.getElementById("fullscreenToggle");
    fullscreenToggle.addEventListener("click", toggleFullscreen);

    // Add sound toggle event listener
    const soundToggle = document.getElementById("soundToggle");
    soundToggle.addEventListener("click", toggleSound);
  });

  // Close connection when page unloads
  window.addEventListener("beforeunload", function () {
    if (eventSource) {
      eventSource.close();
    }
  });
})()
