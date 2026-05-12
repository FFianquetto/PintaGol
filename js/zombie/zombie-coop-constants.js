export const MODEL_BASES = ["assets/models/", "/assets/models/", "../assets/models/"];
export const ZOMBIE_HITS_TO_KILL = 5;
export const PLAYER_TOUCH_DAMAGE = 7; // 3 toques (~21) llenan barra de 20.
export const PLAYER_TOUCH_COOLDOWN_MS = 1200;
export const ZOMBIE_MOVE_SPEED = 2.15;
export const ZOMBIE_HIT_AABB_PAD = 0.34;
export const ZOMBIE_TOUCH_RADIUS = 2.2;
export const ZOMBIE_GROUND_Y = 0.08; // Un poco más abajo para evitar flotado.
export const ZOMBIE_MIN_VISUAL_LIFT = 0.06;
export const TOTAL_WAVES = 3;
export const WAVE_ZOMBIE_COUNTS = [8, 8, 8];
/** Pausa tras limpiar una oleada antes de spawnear la siguiente (oleadas 2 y 3). */
export const INTER_WAVE_GAP_MS = 5000;
export const SEGMENT_STEPS = 7;
export const SNAPSHOT_SEND_MS = 120;
export const COOP_SYNC_MODE = "coopWave";
export const REQUIRED_READY_PLAYERS = 4;
export const PREP_COUNTDOWN_MS = 12000;
export const MAP_PLAY_BOUNDS = 42;
export const PHASE_WAITING_PLAYERS = "waitingPlayers";
export const PHASE_COUNTDOWN = "countdown";
export const PHASE_ACTIVE = "active";

/** Pantalla final y HUD al ganar el modo cooperativo (4 jugadores vs oleadas). */
export const ZOMBIE_COOP_VICTORY_TITLE = "¡Victoria en equipo!";
export function getZombieCoopVictoryOverlayMessage() {
  return `Los 4 jugadores ganaron tras sobrevivir las ${TOTAL_WAVES} oleadas y eliminar a todos los zombies.`;
}
export function getZombieCoopVictoryHudMessage() {
  return `Victoria: los 4 jugadores sobrevivieron las ${TOTAL_WAVES} oleadas.`;
}

/** Pantalla final al perder el modo cooperativo (distinto del “último en pie” del multijugador). */
export const ZOMBIE_COOP_DEFEAT_TITLE = "Derrota ante la horda";
export function getZombieCoopDefeatOverlayMessage() {
  return `Modo zombie cooperativo: los ${REQUIRED_READY_PLAYERS} jugadores fueron eliminados por la horda antes de completar las ${TOTAL_WAVES} oleadas.`;
}
export function getZombieCoopDefeatHudMessage() {
  return "Derrota (cooperativo): todos los jugadores cayeron ante los zombies.";
}
