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
    if (title) title.textContent = "Victoria";
    text.textContent = "Victoria: completaron las 3 oleadas y eliminaron a todos los zombies.";
    if (card) card.classList.add("victory");
  } else {
    if (title) title.textContent = "Derrota";
    text.textContent = "Derrota: los 4 jugadores fueron eliminados por los zombies.";
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
