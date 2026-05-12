import {
  ZOMBIE_COOP_VICTORY_TITLE,
  getZombieCoopVictoryOverlayMessage,
  ZOMBIE_COOP_DEFEAT_TITLE,
  getZombieCoopDefeatOverlayMessage
} from "./zombie-coop-constants.js";

export function setZombieHudStatus(text) {
  const el = document.getElementById("astro-status");
  if (!el) return;
  el.textContent = text;
}

export function showZombieEndOverlay(resultType) {
  const overlay = document.getElementById("astro-defeat-overlay");
  const title = document.getElementById("astro-defeat-title");
  const text = document.getElementById("astro-defeat-text");
  if (!overlay || !text) return;
  const card = overlay.querySelector(".astro-defeat-card");
  if (resultType === "victory") {
    if (title) title.textContent = ZOMBIE_COOP_VICTORY_TITLE;
    text.textContent = getZombieCoopVictoryOverlayMessage();
    if (card) card.classList.add("victory");
  } else {
    if (title) title.textContent = ZOMBIE_COOP_DEFEAT_TITLE;
    text.textContent = getZombieCoopDefeatOverlayMessage();
    if (card) card.classList.remove("victory");
  }
  overlay.hidden = false;
}

export function hideZombieEndOverlay() {
  const overlay = document.getElementById("astro-defeat-overlay");
  if (overlay) {
    const card = overlay.querySelector(".astro-defeat-card");
    if (card) card.classList.remove("victory");
    overlay.hidden = true;
  }
}
