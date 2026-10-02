const TAU = Math.PI * 2;
const WORLD_HALF_WIDTH = 470;
const NOVA_COOLDOWN = 12;
const STANCES = ["balanced", "assault", "bulwark"];
const DRONE_ROLES = [
  { id: "striker", label: "STRIKER", color: "#45f6ff", hp: 62, damage: 9.4, range: 450, fireRate: 0.43, speed: 720 },
  { id: "rail", label: "RAIL", color: "#ff63d9", hp: 54, damage: 14.5, range: 585, fireRate: 0.82, speed: 900 },
  { id: "bulwark", label: "BULWARK", color: "#768cff", hp: 86, damage: 7.4, range: 390, fireRate: 0.58, speed: 660 },
  { id: "medic", label: "MEDIC", color: "#56ffb5", hp: 66, damage: 6.5, range: 410, fireRate: 0.66, speed: 680 }
];
const BOSS_NAMES = ["RIFT WARDEN", "HEX TYRANT", "NULL COLOSSUS", "OMEGA REGENT"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const ease = (value) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
const distanceSquared = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
const distance = (a, b) => Math.sqrt(distanceSquared(a, b));
const pad = (value, width = 2) => String(value).padStart(width, "0");
const format = (value) => Math.max(0, Math.floor(value)).toLocaleString("en-US");

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function polygon(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index][0], points[index][1]);
  }
  ctx.closePath();
}

function hexPath(ctx, radius, squash = 1) {
  ctx.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 6 + (index * TAU) / 6;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * squash;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class RiftCommandGame {
  constructor(canvas, audio, callbacks = {}, options = {}) {
    this.canvas = canvas;
    // options.renderer: a Renderer3D (WebGL). Without one the classic 2D canvas renderer is used.
    // options.headless: simulation only (blueprint studio, tests that never draw).
    this.renderer = options.renderer || null;
    this.headless = Boolean(options.headless);
    this.ctx = this.renderer || this.headless ? null : canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.audio = audio;
    this.callbacks = callbacks;
    this.fx = [];
    this.freeze = 0;
    this.mode = "menu";
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.viewScale = 1;
    this.lastTime = performance.now();
    this.elapsed = 0;
    this.shake = 0;
    this.flash = 0;
    this.moveInput = { x: 0, y: 0 };
    this.keys = new Set();
    this.camera = { x: 0, y: 0 };
    this.player = null;
    this.squad = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.gates = [];
    this.scenery = [];
    this.particles = [];
    this.rings = [];
    this.previewScenery = this.makePreviewScenery();
    this.hudClock = 0;
    this.toastClock = 0;
    this.novaCooldown = 0;
    this.stance = "balanced";
    this.stanceClock = 0;
    this.medicClock = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.kills = 0;
    this.cores = 0;
    this.score = 0;
    this.runDamage = 1;
    this.runFireRate = 1;
    this.sector = 1;
    this.goal = 2400;
    this.boss = null;
    this.bossSpawned = false;
    this.ending = null;
    this.endTimer = 0;
    this.upgrades = { damage: 0, armor: 0, squad: 0 };
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.hud = this.findHud();

    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    if (this.headless) return;
    window.addEventListener("resize", this.resize, { passive: true });
    window.visualViewport?.addEventListener("resize", this.resize, { passive: true });
    this.resize();
    requestAnimationFrame(this.frame);
  }

  /** Queue a presentation event (explosion, muzzle flash...) for the 3D renderer. */
  emitFx(event) {
    if (!this.renderer) return;
    if (this.fx.length < 240) this.fx.push(event);
  }

  findHud() {
    const id = (name) => document.getElementById(name);
    return {
      healthFill: id("healthFill"),
      healthText: id("healthText"),
      shieldFill: id("shieldFill"),
      shieldText: id("shieldText"),
      sectorLabel: id("sectorLabel"),
      progressFill: id("progressFill"),
      objectiveText: id("objectiveText"),
      coreCount: id("coreCount"),
      squadCount: id("squadCount"),
      comboBadge: id("comboBadge"),
      comboValue: id("comboValue"),
      bossHud: id("bossHud"),
      bossHealthFill: id("bossHealthFill"),
      bossHealthText: id("bossHealthText"),
      novaButton: id("novaButton"),
      novaTimer: id("novaTimer"),
      stanceButton: id("stanceButton"),
      stanceLabel: id("stanceLabel"),
      bossName: id("bossName")
    };
  }

  resize() {
    if (this.renderer) {
      this.renderer.resize();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    const portraitScale = this.width / 520;
    const landscapeScale = Math.min(this.width / 1040, this.height / 720);
    this.viewScale = clamp(this.width / this.height < 0.78 ? portraitScale : landscapeScale, 0.66, 1.42);
  }

  makePreviewScenery() {
    const rng = createRng(94017);
    const items = [];
    for (let index = 0; index < 60; index += 1) {
      const y = index * 105 + rng() * 95;
      const side = rng() > 0.5 ? 1 : -1;
      items.push({
        x: side * (265 + rng() * 210) + this.pathX(y) * 0.22,
        y,
        type: rng() > 0.65 ? "crystal" : rng() > 0.48 ? "beacon" : "rock",
        size: 0.7 + rng() * 1.15,
        hue: rng()
      });
    }
    return items;
  }

  start(sector = 1, upgrades = {}) {
    this.sector = clamp(Math.floor(sector) || 1, 1, 99);
    this.upgrades = {
      damage: clamp(Math.floor(upgrades.damage) || 0, 0, 5),
      armor: clamp(Math.floor(upgrades.armor) || 0, 0, 5),
      squad: clamp(Math.floor(upgrades.squad) || 0, 0, 5)
    };
    this.goal = 2300 + (this.sector - 1) * 160;
    const bonusArmor = this.upgrades.armor * 15;
    const bonusShield = this.upgrades.armor * 8;
    this.player = {
      x: this.pathX(0),
      y: 0,
      vx: 0,
      vy: 0,
      radius: 23,
      hp: 120 + bonusArmor,
      maxHp: 120 + bonusArmor,
      shield: 48 + bonusShield,
      maxShield: 48 + bonusShield,
      speed: 265,
      damage: 18 * (1 + this.upgrades.damage * 0.12),
      lastShot: 0,
      invulnerable: 0,
      damageClock: 99,
      alive: true,
      facing: 0
    };
    this.squad = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.gates = [];
    this.scenery = [];
    this.particles = [];
    this.rings = [];
    this.camera.x = this.player.x;
    this.camera.y = 110;
    this.novaCooldown = 0;
    this.stance = "balanced";
    this.stanceClock = 0;
    this.medicClock = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.kills = 0;
    this.cores = 0;
    this.score = 0;
    this.runDamage = 1;
    this.runFireRate = 1;
    this.boss = null;
    this.bossSpawned = false;
    this.ending = null;
    this.endTimer = 0;
    this.freeze = 0;
    this.fx.length = 0;
    this.moveInput.x = 0;
    this.moveInput.y = 0;
    this.buildSector();
    const startingDrones = 2 + this.upgrades.squad;
    this.addDrones(startingDrones, false);
    this.mode = "playing";
    this.updateHud(true);
    this.audio.startAmbience();
    this.toast(`SECTOR ${pad(this.sector)} // ADVANCE TO THE RIFT`);
  }

  showMenu() {
    this.mode = "menu";
    this.moveInput.x = 0;
    this.moveInput.y = 0;
    this.audio.stopAmbience();
  }

  pause() {
    if (this.mode !== "playing" || this.ending) return false;
    this.mode = "paused";
    this.moveInput.x = 0;
    this.moveInput.y = 0;
    return true;
  }

  resume() {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    this.lastTime = performance.now();
  }

  setMoveInput(x, y) {
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      this.moveInput.x = x / magnitude;
      this.moveInput.y = y / magnitude;
    } else {
      this.moveInput.x = x;
      this.moveInput.y = y;
    }
  }

  buildSector() {
    const rng = createRng(7001 + this.sector * 971);
    const gateTypes = ["recruit", "shield", "damage", "haste", "repair", "multiply"];
    let row = 0;
    for (let y = 380; y < this.goal - 290; y += 420 + rng() * 80) {
      const center = this.pathX(y);
      let leftType;
      let rightType;
      if (row === 0) {
        leftType = "recruit";
        rightType = "shield";
      } else {
        leftType = gateTypes[Math.floor(rng() * gateTypes.length)];
        do {
          rightType = gateTypes[Math.floor(rng() * gateTypes.length)];
        } while (rightType === leftType);
      }
      this.gates.push(this.makeGate(center - 132, y, leftType, row));
      this.gates.push(this.makeGate(center + 132, y, rightType, row));
      row += 1;
    }

    let waveIndex = 0;
    for (let y = 245; y < this.goal - 190; y += 215 + rng() * 80) {
      this.spawnWave(y, waveIndex, rng);
      waveIndex += 1;
    }

    for (let y = 680; y < this.goal - 300; y += 660 + rng() * 110) {
      const center = this.pathX(y);
      const side = rng() > 0.5 ? 1 : -1;
      this.enemies.push(this.createEnemy("turret", center + side * (180 + rng() * 55), y + rng() * 80));
    }

    const sceneryCount = Math.min(150, 58 + Math.floor(this.goal / 70));
    for (let index = 0; index < sceneryCount; index += 1) {
      const y = rng() * (this.goal + 620) - 260;
      const side = rng() > 0.5 ? 1 : -1;
      const center = this.pathX(y);
      const roll = rng();
      this.scenery.push({
        x: center + side * (260 + rng() * 250),
        y,
        type: roll > 0.73 ? "crystal" : roll > 0.51 ? "beacon" : roll > 0.2 ? "rock" : "wreck",
        size: 0.62 + rng() * 1.25,
        hue: rng()
      });
    }
  }

  makeGate(x, y, type, row) {
    const map = {
      recruit: { label: "+3 DRONES", symbol: "+3", color: "#45f6ff" },
      shield: { label: "SHIELD +35", symbol: "⬡", color: "#5572ff" },
      damage: { label: "DAMAGE +25%", symbol: "⌁", color: "#ff48ce" },
      haste: { label: "FIRE RATE +20%", symbol: "»", color: "#ffd85a" },
      repair: { label: "FULL REPAIR", symbol: "+", color: "#4dffad" },
      multiply: { label: "SQUAD x2", symbol: "x2", color: "#8a63ff" }
    };
    return { x, y, width: 108, type, row, passed: false, selected: false, ...map[type] };
  }

  spawnWave(y, waveIndex, rng) {
    const count = clamp(3 + Math.floor(this.sector * 0.62) + (waveIndex % 3), 3, 12);
    const center = this.pathX(y);
    for (let index = 0; index < count; index += 1) {
      const roll = rng();
      let type = "grunt";
      if (this.sector >= 2 && roll > 0.62) type = "shooter";
      if (this.sector >= 2 && roll > 0.78) type = "charger";
      if (this.sector >= 3 && roll > 0.86) type = "shield";
      if (this.sector >= 4 && roll > 0.92) type = "jammer";
      if (this.sector >= 5 && roll > 0.965) type = "splitter";
      if (this.sector >= 3 && waveIndex % 4 === 3 && index === Math.floor(count / 2)) type = "brute";
      const column = index - (count - 1) / 2;
      this.enemies.push(this.createEnemy(
        type,
        center + column * 54 + (rng() - 0.5) * 25,
        y + Math.abs(column) * 18 + rng() * 30
      ));
    }
  }

  createEnemy(type, x, y) {
    const sectorScale = 1 + (this.sector - 1) * 0.16;
    const templates = {
      grunt: { hp: 44, radius: 18, speed: 90, damage: 11, reward: 45, range: 28 },
      shooter: { hp: 58, radius: 20, speed: 70, damage: 9, reward: 70, range: 360 },
      charger: { hp: 72, radius: 21, speed: 145, damage: 17, reward: 90, range: 31 },
      shield: { hp: 96, radius: 24, speed: 64, damage: 12, reward: 115, range: 34, shield: 78 },
      jammer: { hp: 76, radius: 23, speed: 59, damage: 8, reward: 130, range: 385 },
      splitter: { hp: 92, radius: 24, speed: 78, damage: 13, reward: 145, range: 30 },
      brute: { hp: 148, radius: 29, speed: 53, damage: 20, reward: 125, range: 35 },
      turret: { hp: 210, radius: 34, speed: 0, damage: 13, reward: 180, range: 440 },
      boss: { hp: 920, radius: 67, speed: 47, damage: 22, reward: 1900, range: 470 }
    };
    const template = templates[type] || templates.grunt;
    const bossScale = type === "boss" ? Math.pow(1.22, this.sector - 1) : sectorScale;
    const hp = template.hp * bossScale;
    return {
      id: `${type}-${Math.random().toString(36).slice(2)}`,
      type, x, y, vx: 0, vy: 0, radius: template.radius,
      hp, maxHp: hp,
      shield: (template.shield || 0) * sectorScale,
      maxShield: (template.shield || 0) * sectorScale,
      speed: template.speed * (1 + Math.min(0.32, (this.sector - 1) * 0.028)),
      damage: template.damage * sectorScale,
      reward: template.reward, range: template.range,
      lastShot: Math.random() * 0.8, attackClock: 0, dashClock: 0,
      hitFlash: 0, alive: true, active: false, phase: Math.random() * TAU, slow: 0,
      phaseStage: 0, splitSpawned: false
    };
  }

  addDrones(count, burst = true) {
    const maxSquad = 13 + this.upgrades.squad * 2;
    const amount = Math.max(0, Math.min(count, maxSquad - this.squad.length));
    for (let index = 0; index < amount; index += 1) {
      const slot = this.squad.length;
      const role = DRONE_ROLES[slot % DRONE_ROLES.length];
      const maxHp = role.hp + this.upgrades.armor * 6;
      this.squad.push({
        x: this.player ? this.player.x + (Math.random() - 0.5) * 40 : 0,
        y: this.player ? this.player.y - 25 - Math.random() * 30 : 0,
        vx: 0, vy: 0, radius: role.id === "bulwark" ? 17 : 15,
        hp: maxHp, maxHp,
        damage: role.damage * (1 + this.upgrades.damage * 0.12),
        range: role.range, fireRate: role.fireRate, projectileSpeed: role.speed,
        role: role.id, roleLabel: role.label, color: role.color,
        lastShot: Math.random() * 0.8, phase: Math.random() * TAU, slot,
        alive: true, hitFlash: 0
      });
    }
    if (amount > 0 && this.player) this.emitFx({ type: "warp", count: amount });
    if (burst && amount > 0 && this.player) {
      this.emitBurst(this.player.x, this.player.y, "#45f6ff", 18 + amount * 2, 130);
      this.toast(`SQUAD EXPANDED // +${amount} SPECIALIST${amount === 1 ? "" : "S"}`);
    }
    return amount;
  }

  cycleStance() {
    if (this.mode !== "playing" || this.ending || !this.player?.alive) return false;
    const next = (STANCES.indexOf(this.stance) + 1) % STANCES.length;
    this.stance = STANCES[next];
    this.stanceClock = 0.6;
    const labels = { balanced: "BALANCED LINK", assault: "ASSAULT WEDGE", bulwark: "BULWARK WALL" };
    this.toast(`TACTICAL STANCE // ${labels[this.stance]}`);
    this.emitBurst(this.player.x, this.player.y, this.stance === "assault" ? "#ff63d9" : this.stance === "bulwark" ? "#768cff" : "#45f6ff", 20, 150);
    this.haptic(24);
    this.emitFx({ type: "stance", stance: this.stance });
    this.updateHud(true);
    return true;
  }

  pathX(y) {
    return Math.sin(y * 0.00205) * 82 + Math.sin(y * 0.00071 + 1.3) * 54;
  }

  maxSquad() {
    return 13 + this.upgrades.squad * 2;
  }

  activateNova() {
    if (this.mode !== "playing" || this.ending || this.novaCooldown > 0 || !this.player?.alive) return false;
    this.novaCooldown = NOVA_COOLDOWN;
    const radius = 440;
    const damage = 82 * (1 + this.upgrades.damage * 0.12) * this.runDamage;
    this.rings.push({ x: this.player.x, y: this.player.y, radius: 18, maxRadius: radius, life: 0.7, maxLife: 0.7, color: "#8ffbff" });
    this.rings.push({ x: this.player.x, y: this.player.y, radius: 8, maxRadius: radius * 0.72, life: 0.46, maxLife: 0.46, color: "#ff5cdb" });
    for (const enemy of this.enemies) {
      if (!enemy.alive || distance(enemy, this.player) > radius) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const magnitude = Math.max(1, Math.hypot(dx, dy));
      enemy.x += (dx / magnitude) * 52;
      enemy.y += (dy / magnitude) * 52;
      enemy.slow = 2.4;
      this.damageEnemy(enemy, damage, true);
    }
    for (const projectile of this.projectiles) {
      if (projectile.side === "enemy" && distance(projectile, this.player) < radius) projectile.life = 0;
    }
    this.shake = Math.max(this.shake, 13);
    this.flash = 0.32;
    this.emitFx({ type: "nova", x: this.player.x, y: this.player.y, radius });
    this.audio.nova();
    this.haptic([35, 30, 65]);
    this.toast("NOVA PULSE // HOSTILES DISRUPTED");
    return true;
  }

  frame(timestamp) {
    const rawDelta = (timestamp - this.lastTime) / 1000;
    const delta = Math.min(0.034, Math.max(0, rawDelta || 0));
    this.lastTime = timestamp;
    this.elapsed += delta;
    if (this.mode === "playing") this.update(delta);
    if (this.renderer) this.renderer.render(this, timestamp / 1000, delta);
    else this.render(timestamp / 1000);
    requestAnimationFrame(this.frame);
  }

  update(delta) {
    if (!this.player) return;
    if (this.ending) {
      this.updateEffects(delta);
      this.endTimer -= delta;
      if (this.endTimer <= 0) this.completeEnding();
      return;
    }
    if (this.freeze > 0) {
      // Cinematic hold (3D guardian reveal): the battlefield waits for the camera.
      this.freeze = Math.max(0, this.freeze - delta);
      this.updateEffects(delta);
      return;
    }

    this.updatePlayer(delta);
    this.updateSquad(delta);
    this.updateEnemies(delta);
    this.updateProjectiles(delta);
    this.updatePickups(delta);
    this.updateGates();
    this.updateEffects(delta);
    this.updateCombat(delta);

    this.camera.x = lerp(this.camera.x, this.player.x * 0.42 + this.pathX(this.player.y) * 0.58, 1 - Math.pow(0.0005, delta));
    this.camera.y = lerp(this.camera.y, this.player.y + 125, 1 - Math.pow(0.0003, delta));
    this.novaCooldown = Math.max(0, this.novaCooldown - delta);
    this.comboTimer = Math.max(0, this.comboTimer - delta);
    if (this.comboTimer <= 0) this.combo = 1;
    this.hudClock -= delta;
    if (this.hudClock <= 0) {
      this.hudClock = 0.08;
      this.updateHud();
    }

    if (!this.bossSpawned && this.player.y >= this.goal - 430) this.spawnBoss();
  }

  updatePlayer(delta) {
    const inputMagnitude = Math.hypot(this.moveInput.x, this.moveInput.y);
    const moveX = inputMagnitude > 0.05 ? this.moveInput.x : 0;
    const moveY = inputMagnitude > 0.05 ? -this.moveInput.y : 0;
    const responsiveness = 1 - Math.pow(0.000025, delta);
    this.player.vx = lerp(this.player.vx, moveX * this.player.speed, responsiveness);
    this.player.vy = lerp(this.player.vy, moveY * this.player.speed, responsiveness);
    if (!moveX) this.player.vx *= Math.pow(0.035, delta);
    if (!moveY) this.player.vy *= Math.pow(0.035, delta);
    this.player.x += this.player.vx * delta;
    this.player.y += this.player.vy * delta;
    const missionLimit = this.bossSpawned ? this.goal + 170 : this.goal - 70;
    this.player.x = clamp(this.player.x, -WORLD_HALF_WIDTH + 35, WORLD_HALF_WIDTH - 35);
    this.player.y = clamp(this.player.y, 0, missionLimit);
    this.player.facing = lerp(this.player.facing, clamp(this.player.vx / this.player.speed, -1, 1) * 0.34, responsiveness);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - delta);
    this.player.damageClock += delta;
    if (this.player.damageClock > 3.4 && this.player.shield < this.player.maxShield) {
      this.player.shield = Math.min(this.player.maxShield, this.player.shield + 7.2 * delta);
    }
  }

  updateSquad(delta) {
    const living = this.squad.filter((drone) => drone.alive);
    this.medicClock = Math.max(0, this.medicClock - delta);
    living.forEach((drone, index) => {
      drone.slot = index;
      let desiredX;
      let desiredY;
      if (this.stance === "assault") {
        const side = index % 2 === 0 ? -1 : 1;
        const rank = Math.floor(index / 2) + 1;
        desiredX = this.player.x + side * rank * 34 - this.player.vx * 0.08;
        desiredY = this.player.y - 42 - rank * 34 - this.player.vy * 0.08;
      } else if (this.stance === "bulwark") {
        const cols = Math.min(7, living.length);
        const row = Math.floor(index / cols);
        const col = index % cols;
        const inRow = Math.min(cols, living.length - row * cols);
        desiredX = this.player.x + (col - (inRow - 1) / 2) * 43;
        desiredY = this.player.y + 28 - row * 46;
      } else {
        const row = Math.floor(index / 4) + 1;
        const itemsInRow = Math.min(4, living.length - (row - 1) * 4);
        const positionInRow = index % 4;
        desiredX = this.player.x + (positionInRow - (itemsInRow - 1) / 2) * 48 - this.player.vx * 0.1;
        desiredY = this.player.y - row * 55 - Math.abs(positionInRow - (itemsInRow - 1) / 2) * 8 - this.player.vy * 0.08;
      }
      const spring = this.stance === "bulwark" ? 13 : 10.5;
      drone.vx += (desiredX - drone.x) * spring * delta;
      drone.vy += (desiredY - drone.y) * spring * delta;
      const damping = Math.pow(0.003, delta);
      drone.vx *= damping; drone.vy *= damping;
      drone.x += drone.vx * delta; drone.y += drone.vy * delta;
      drone.hitFlash = Math.max(0, drone.hitFlash - delta * 5);
    });
    if (this.medicClock <= 0 && living.some((drone) => drone.role === "medic")) {
      const damaged = [this.player, ...living].filter((unit) => unit?.alive && unit.hp < unit.maxHp);
      if (damaged.length) {
        damaged.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        const target = damaged[0];
        const amount = target === this.player ? 7 : 10;
        target.hp = Math.min(target.maxHp, target.hp + amount);
        this.emitBurst(target.x, target.y, "#56ffb5", 7, 70);
        this.rings.push({ x: target.x, y: target.y, radius: 5, maxRadius: 48, life: 0.42, maxLife: 0.42, color: "#56ffb5" });
        this.medicClock = 4.2;
      } else this.medicClock = 1.4;
    }
    this.squad = living;
  }

  updateEnemies(delta) {
    const friendTargets = [this.player, ...this.squad];
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.active = enemy.y - this.player.y < 920 && enemy.y - this.player.y > -540;
      if (!enemy.active) continue;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta * 7);
      enemy.attackClock = Math.max(0, enemy.attackClock - delta);
      enemy.dashClock = Math.max(0, enemy.dashClock - delta);
      enemy.slow = Math.max(0, enemy.slow - delta);
      const slowFactor = enemy.slow > 0 ? 0.42 : 1;
      let target = this.player;
      let bestDistance = distanceSquared(enemy, this.player);
      for (const candidate of friendTargets) {
        if (!candidate?.alive) continue;
        const candidateDistance = distanceSquared(enemy, candidate);
        if (candidateDistance < bestDistance) { bestDistance = candidateDistance; target = candidate; }
      }
      const targetDistance = Math.sqrt(bestDistance);
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const magnitude = Math.max(0.001, targetDistance);
      const nx = dx / magnitude; const ny = dy / magnitude;

      if (["grunt", "brute", "shield", "splitter"].includes(enemy.type)) {
        if (targetDistance > enemy.range) {
          enemy.vx = lerp(enemy.vx, nx * enemy.speed * slowFactor, 1 - Math.pow(0.005, delta));
          enemy.vy = lerp(enemy.vy, ny * enemy.speed * slowFactor, 1 - Math.pow(0.005, delta));
          enemy.x += enemy.vx * delta; enemy.y += enemy.vy * delta;
        } else if (enemy.attackClock <= 0) {
          enemy.attackClock = enemy.type === "brute" ? 1.15 : enemy.type === "shield" ? 0.95 : 0.72;
          this.damageFriendly(target, enemy.damage, enemy.type === "brute" || enemy.type === "shield");
        }
      } else if (enemy.type === "charger") {
        const boost = enemy.dashClock <= 0 && targetDistance < 300 ? 2.35 : 1;
        if (boost > 1) enemy.dashClock = 1.35;
        if (targetDistance > enemy.range) {
          enemy.vx = lerp(enemy.vx, nx * enemy.speed * boost * slowFactor, 1 - Math.pow(0.0015, delta));
          enemy.vy = lerp(enemy.vy, ny * enemy.speed * boost * slowFactor, 1 - Math.pow(0.0015, delta));
          enemy.x += enemy.vx * delta; enemy.y += enemy.vy * delta;
        } else if (enemy.attackClock <= 0) {
          enemy.attackClock = 1.0;
          this.damageFriendly(target, enemy.damage * (boost > 1 ? 1.35 : 1), true);
        }
      } else if (["shooter", "turret", "jammer"].includes(enemy.type)) {
        if (enemy.type !== "turret" && targetDistance > enemy.range * 0.72) {
          enemy.x += nx * enemy.speed * slowFactor * delta; enemy.y += ny * enemy.speed * slowFactor * delta;
        }
        enemy.lastShot -= delta;
        if (targetDistance < enemy.range && enemy.lastShot <= 0) {
          enemy.lastShot = enemy.type === "turret" ? 1.35 : enemy.type === "jammer" ? 1.55 : 1.1;
          this.fireProjectile(enemy, target, false, enemy.damage, enemy.type === "turret" ? 385 : 430, enemy.type === "jammer" ? "#ba62ff" : undefined);
        }
      } else if (enemy.type === "boss") {
        this.updateBossPhase(enemy);
        if (targetDistance > 250) { enemy.x += nx * enemy.speed * slowFactor * delta; enemy.y += ny * enemy.speed * slowFactor * delta; }
        else if (targetDistance < 165) { enemy.x -= nx * enemy.speed * 0.5 * delta; enemy.y -= ny * enemy.speed * 0.5 * delta; }
        enemy.lastShot -= delta;
        if (enemy.lastShot <= 0) {
          const ratio = enemy.hp / enemy.maxHp;
          enemy.lastShot = ratio < 0.34 ? 0.78 : ratio < 0.67 ? 1.02 : 1.42;
          this.fireBossVolley(enemy, target);
        }
        if (targetDistance < 85 && enemy.attackClock <= 0) { enemy.attackClock = 1.25; this.damageFriendly(target, enemy.damage * 1.3, true); }
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.alive || enemy.type === "boss");
  }

  updateBossPhase(enemy) {
    const ratio = enemy.hp / enemy.maxHp;
    const wanted = ratio <= 0.33 ? 2 : ratio <= 0.66 ? 1 : 0;
    if (wanted <= enemy.phaseStage) return;
    enemy.phaseStage = wanted;
    const count = wanted === 1 ? 4 : 6;
    const types = wanted === 1 ? ["shooter", "charger"] : ["shield", "jammer", "brute"];
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TAU;
      const type = types[index % types.length];
      const reinforcement = this.createEnemy(type, enemy.x + Math.cos(angle) * 150, enemy.y + Math.sin(angle) * 120);
      reinforcement.active = true;
      this.enemies.push(reinforcement);
    }
    this.rings.push({ x: enemy.x, y: enemy.y, radius: 14, maxRadius: 360, life: 0.8, maxLife: 0.8, color: wanted === 1 ? "#ff63d9" : "#ba62ff" });
    this.emitFx({ type: "phase", x: enemy.x, y: enemy.y, stage: wanted });
    this.shake = Math.max(this.shake, 13);
    this.toast(`${enemy.bossName || "RIFT GUARDIAN"} // PHASE ${wanted + 1}`, "danger");
    this.audio.alert();
  }

  updateCombat(delta) {
    if (!this.player.alive) return;
    const jammed = this.enemies.some((enemy) => enemy.alive && enemy.active && enemy.type === "jammer" && distance(enemy, this.player) < 365);
    const stanceFire = this.stance === "assault" ? 1.26 : this.stance === "bulwark" ? 0.84 : 1;
    const stanceDamage = this.stance === "assault" ? 1.12 : this.stance === "bulwark" ? 0.94 : 1;
    const jammerFactor = jammed ? 0.7 : 1;
    const target = this.findTarget(this.player, 520);
    this.player.lastShot -= delta;
    if (target && this.player.lastShot <= 0) {
      this.player.lastShot = 0.21 / (this.runFireRate * stanceFire * jammerFactor);
      this.fireProjectile(this.player, target, true, this.player.damage * this.runDamage * stanceDamage, 780, "#d9ffff");
    }
    for (const drone of this.squad) {
      drone.lastShot -= delta;
      if (drone.lastShot > 0) continue;
      const droneTarget = this.findTarget(drone, drone.range || 430);
      if (!droneTarget) continue;
      drone.lastShot = (drone.fireRate || 0.52) / (this.runFireRate * stanceFire * jammerFactor);
      this.fireProjectile(drone, droneTarget, true, drone.damage * this.runDamage * stanceDamage, drone.projectileSpeed || 690, drone.color || "#45f6ff");
    }
  }

  findTarget(origin, maxRange) {
    let target = null;
    let best = maxRange * maxRange;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !enemy.active) continue;
      const candidate = distanceSquared(origin, enemy);
      if (candidate < best) {
        best = candidate;
        target = enemy;
      }
    }
    return target;
  }

  fireProjectile(origin, target, friendly, damage, speed, color) {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const magnitude = Math.max(1, Math.hypot(dx, dy));
    const spread = friendly ? (Math.random() - 0.5) * 0.02 : (Math.random() - 0.5) * 0.055;
    const cosine = Math.cos(spread);
    const sine = Math.sin(spread);
    const nx = dx / magnitude;
    const ny = dy / magnitude;
    this.projectiles.push({
      x: origin.x + nx * (origin.radius || 18),
      y: origin.y + ny * (origin.radius || 18),
      vx: (nx * cosine - ny * sine) * speed,
      vy: (nx * sine + ny * cosine) * speed,
      side: friendly ? "friendly" : "enemy",
      damage,
      radius: friendly ? 4.5 : 6,
      life: 1.35,
      color: color || (friendly ? "#45f6ff" : "#ff486f"),
      source: origin === this.player ? "commander" : origin.role || origin.type || "unit"
    });
    this.emitFx({ type: "muzzle", x: origin.x, y: origin.y, tx: target.x, ty: target.y, source: origin === this.player ? "commander" : origin.role || origin.type, color: color || (friendly ? "#45f6ff" : "#ff486f"), unit: origin });
    this.audio.shoot(friendly);
    this.emitParticle(origin.x, origin.y, color || (friendly ? "#45f6ff" : "#ff486f"), 1, 35, 0.16);
  }

  fireBossVolley(origin, target) {
    const baseAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
    for (let index = -2; index <= 2; index += 1) {
      const angle = baseAngle + index * 0.13;
      const speed = 370 + Math.abs(index) * 16;
      this.projectiles.push({
        x: origin.x + Math.cos(angle) * 46,
        y: origin.y + Math.sin(angle) * 46,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        side: "enemy",
        damage: origin.damage * (index === 0 ? 1 : 0.72),
        radius: index === 0 ? 8 : 5.5,
        life: 1.65,
        color: index === 0 ? "#fff0b2" : "#ff3f91",
        source: "boss"
      });
    }
    this.emitFx({ type: "muzzle", x: origin.x, y: origin.y, tx: target.x, ty: target.y, source: "boss", color: "#ff3f91", unit: origin });
    this.audio.shoot(false);
    this.shake = Math.max(this.shake, 3);
  }

  updateProjectiles(delta) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      if (projectile.life <= 0) continue;
      if (projectile.side === "friendly") {
        for (const enemy of this.enemies) {
          if (!enemy.alive || !enemy.active) continue;
          const hitRadius = enemy.radius + projectile.radius;
          if (distanceSquared(projectile, enemy) <= hitRadius * hitRadius) {
            projectile.life = 0;
            this.damageEnemy(enemy, projectile.damage, false);
            break;
          }
        }
      } else {
        let target = null;
        for (const drone of this.squad) {
          const hitRadius = drone.radius + projectile.radius;
          if (distanceSquared(projectile, drone) <= hitRadius * hitRadius) {
            target = drone;
            break;
          }
        }
        if (!target) {
          const hitRadius = this.player.radius + projectile.radius;
          if (distanceSquared(projectile, this.player) <= hitRadius * hitRadius) target = this.player;
        }
        if (target) {
          projectile.life = 0;
          this.damageFriendly(target, projectile.damage, false);
        }
      }
    }
    if (this.projectiles.length > 220) this.projectiles.splice(0, this.projectiles.length - 220);
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  damageEnemy(enemy, amount, heavy = false) {
    if (!enemy.alive) return;
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, amount);
      enemy.shield -= absorbed;
      amount -= absorbed;
      this.emitBurst(enemy.x, enemy.y, "#8ca2ff", heavy ? 8 : 4, 85);
      this.rings.push({ x: enemy.x, y: enemy.y, radius: enemy.radius, maxRadius: enemy.radius * 1.8, life: 0.22, maxLife: 0.22, color: "#8ca2ff" });
      if (amount <= 0) { enemy.hitFlash = 0.45; this.audio.hit(false); return; }
    }
    enemy.hp -= amount;
    enemy.hitFlash = 1;
    this.emitFx({ type: "hit", x: enemy.x, y: enemy.y, heavy, unit: enemy });
    this.emitBurst(enemy.x, enemy.y, enemy.type === "boss" ? "#ff4cad" : "#ff526e", heavy ? 8 : 3, heavy ? 120 : 55);
    this.audio.hit(heavy || enemy.type === "boss");
    if (enemy.hp > 0) return;
    enemy.alive = false;
    if (enemy.type === "splitter" && !enemy.splitSpawned) {
      enemy.splitSpawned = true;
      for (const side of [-1, 1]) {
        const shard = this.createEnemy("grunt", enemy.x + side * 28, enemy.y - 8);
        shard.hp *= 0.72; shard.maxHp = shard.hp; shard.speed *= 1.25; shard.active = true;
        this.enemies.push(shard);
      }
      this.toast("SPLITTER CORE // TWO SIGNALS DETECTED", "danger");
    }
    this.kills += 1;
    this.combo = this.comboTimer > 0 ? Math.min(9, this.combo + 1) : 1;
    this.comboTimer = 2.5;
    const multiplier = 1 + (this.combo - 1) * 0.18;
    this.score += Math.floor(enemy.reward * multiplier);
    const drops = enemy.type === "boss" ? 18 + this.sector * 2 : enemy.type === "brute" ? 3 : enemy.type === "turret" ? 4 : ["shield", "jammer", "splitter"].includes(enemy.type) ? 3 : Math.random() > 0.55 ? 2 : 1;
    for (let index = 0; index < drops; index += 1) {
      const angle = (index / Math.max(1, drops)) * TAU + Math.random() * 0.7;
      const speed = 55 + Math.random() * 95;
      this.pickups.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        value: enemy.type === "boss" ? 2 : 1,
        life: 13,
        phase: Math.random() * TAU
      });
    }
    this.emitFx({ type: "kill", x: enemy.x, y: enemy.y, enemy: enemy.type, radius: enemy.radius });
    const burstCount = enemy.type === "boss" ? 52 : enemy.type === "brute" || enemy.type === "turret" ? 22 : 12;
    this.emitBurst(enemy.x, enemy.y, enemy.type === "boss" ? "#ff4bd8" : "#ff5a77", burstCount, enemy.type === "boss" ? 270 : 145);
    this.rings.push({
      x: enemy.x,
      y: enemy.y,
      radius: 4,
      maxRadius: enemy.radius * (enemy.type === "boss" ? 4.5 : 2.5),
      life: enemy.type === "boss" ? 0.9 : 0.35,
      maxLife: enemy.type === "boss" ? 0.9 : 0.35,
      color: enemy.type === "boss" ? "#ff63d9" : "#ff526e"
    });
    this.shake = Math.max(this.shake, enemy.type === "boss" ? 18 : heavy ? 7 : 3);
    if (enemy.type === "boss") {
      this.boss = enemy;
      this.beginEnding(true);
    }
  }

  damageFriendly(target, amount, heavy) {
    if (!target?.alive) return;
    if (this.stance === "bulwark") amount *= target === this.player ? 0.78 : 0.7;
    if (target === this.player) {
      if (this.player.invulnerable > 0) return;
      this.player.invulnerable = heavy ? 0.32 : 0.16;
      this.player.damageClock = 0;
      let remaining = amount;
      if (this.player.shield > 0) {
        const absorbed = Math.min(this.player.shield, remaining);
        this.player.shield -= absorbed;
        remaining -= absorbed;
      }
      this.player.hp -= remaining;
      this.emitFx({ type: "player-hit", shield: remaining <= 0, heavy });
      this.flash = Math.max(this.flash, heavy ? 0.24 : 0.12);
      this.shake = Math.max(this.shake, heavy ? 10 : 5);
      this.emitBurst(target.x, target.y, remaining > 0 ? "#ff536d" : "#55eaff", heavy ? 14 : 6, heavy ? 145 : 80);
      this.audio.hit(heavy);
      this.haptic(heavy ? 45 : 18);
      if (this.player.hp <= 0) {
        this.player.hp = 0;
        this.player.alive = false;
        this.emitFx({ type: "kill", x: target.x, y: target.y, enemy: "commander", radius: target.radius });
        this.emitBurst(target.x, target.y, "#ff4d82", 46, 250);
        this.beginEnding(false);
      }
    } else {
      target.hp -= amount;
      target.hitFlash = 1;
      this.emitBurst(target.x, target.y, "#6befff", heavy ? 10 : 4, 85);
      if (target.hp <= 0) {
        target.alive = false;
        this.emitFx({ type: "kill", x: target.x, y: target.y, enemy: "drone", radius: target.radius });
        this.emitBurst(target.x, target.y, "#6befff", 17, 155);
        this.toast("DRONE SIGNAL LOST", "danger");
      }
    }
  }

  updatePickups(delta) {
    for (const pickup of this.pickups) {
      pickup.life -= delta;
      pickup.vx *= Math.pow(0.035, delta);
      pickup.vy *= Math.pow(0.035, delta);
      pickup.x += pickup.vx * delta;
      pickup.y += pickup.vy * delta;
      const pickupDistance = distance(pickup, this.player);
      if (pickupDistance < 190) {
        const strength = (1 - pickupDistance / 190) * 1350 + 120;
        pickup.x += ((this.player.x - pickup.x) / Math.max(1, pickupDistance)) * strength * delta;
        pickup.y += ((this.player.y - pickup.y) / Math.max(1, pickupDistance)) * strength * delta;
      }
      if (pickupDistance < 29) {
        pickup.life = 0;
        this.cores += pickup.value;
        this.emitFx({ type: "pickup" });
        this.score += 25 * pickup.value;
        this.audio.pickup();
        this.emitBurst(this.player.x, this.player.y, "#ffd85a", 4, 75);
      }
    }
    this.pickups = this.pickups.filter((pickup) => pickup.life > 0);
  }

  updateGates() {
    for (const gate of this.gates) {
      if (gate.passed || this.player.y < gate.y - 25) continue;
      const rowGates = this.gates.filter((candidate) => candidate.row === gate.row);
      if (this.player.y > gate.y + 58) {
        rowGates.forEach((candidate) => { candidate.passed = true; });
        continue;
      }
      if (Math.abs(this.player.x - gate.x) <= gate.width * 0.62 && Math.abs(this.player.y - gate.y) < 45) {
        rowGates.forEach((candidate) => { candidate.passed = true; });
        gate.selected = true;
        this.applyGate(gate);
        break;
      }
    }
  }

  applyGate(gate) {
    switch (gate.type) {
      case "recruit": {
        const added = this.addDrones(3, false);
        this.toast(added > 0 ? `RECRUIT LINK // +${added} DRONES` : "SQUAD CAPACITY MAXIMUM");
        break;
      }
      case "shield":
        this.player.maxShield += 18;
        this.player.shield = Math.min(this.player.maxShield, this.player.shield + 35);
        this.toast("QUANTUM SHIELD // +35");
        break;
      case "damage":
        this.runDamage *= 1.25;
        this.toast("ION OVERCHARGE // DAMAGE +25%");
        break;
      case "haste":
        this.runFireRate *= 1.2;
        this.toast("RAPID LINK // FIRE RATE +20%");
        break;
      case "repair":
        this.player.hp = this.player.maxHp;
        this.player.shield = Math.max(this.player.shield, this.player.maxShield * 0.45);
        for (const drone of this.squad) drone.hp = drone.maxHp;
        this.toast("NANITE REPAIR // SQUAD RESTORED");
        break;
      case "multiply": {
        const added = this.addDrones(this.squad.length, false);
        this.toast(added > 0 ? `UPLINK CLONED // +${added} DRONES` : "SQUAD CAPACITY MAXIMUM");
        break;
      }
      default:
        break;
    }
    this.score += 150;
    this.emitFx({ type: "gate", x: gate.x, y: gate.y, color: gate.color, gate });
    this.emitBurst(gate.x, gate.y, gate.color, 24, 190);
    this.rings.push({ x: gate.x, y: gate.y, radius: 10, maxRadius: 145, life: 0.55, maxLife: 0.55, color: gate.color });
    this.audio.gate(true);
    this.haptic([22, 20, 30]);
  }

  spawnBoss() {
    this.bossSpawned = true;
    const boss = this.createEnemy("boss", this.pathX(this.goal + 70), this.goal + 150);
    boss.active = true;
    boss.bossName = BOSS_NAMES[(this.sector - 1) % BOSS_NAMES.length];
    this.enemies.push(boss);
    this.boss = boss;
    boss.variant = (this.sector - 1) % BOSS_NAMES.length;
    if (this.renderer?.cinematics) this.freeze = 2.1;
    this.emitFx({ type: "boss", x: boss.x, y: boss.y, unit: boss });
    this.toast(`WARNING // ${boss.bossName} INBOUND`, "danger");
    this.audio.alert();
    this.haptic([40, 60, 40, 60, 80]);
  }

  updateEffects(delta) {
    for (const particle of this.particles) {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= Math.pow(0.11, delta);
      particle.vy *= Math.pow(0.11, delta);
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    if (this.particles.length > 320) this.particles.splice(0, this.particles.length - 320);
    for (const ring of this.rings) {
      ring.life -= delta;
      const progress = 1 - ring.life / ring.maxLife;
      ring.radius = lerp(5, ring.maxRadius, ease(progress));
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);
    this.shake *= Math.pow(0.009, delta);
    this.flash = Math.max(0, this.flash - delta);
  }

  emitParticle(x, y, color, count = 1, speed = 60, life = 0.4) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.35 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: life * (0.65 + Math.random() * 0.55),
        maxLife: life,
        size: 1.5 + Math.random() * 3.8,
        color
      });
    }
  }

  emitBurst(x, y, color, count, speed) {
    this.emitParticle(x, y, color, this.reducedMotion ? Math.ceil(count * 0.35) : count, speed, 0.45 + Math.random() * 0.35);
  }

  beginEnding(success) {
    if (this.ending) return;
    this.ending = success ? "success" : "defeat";
    this.endTimer = success ? (this.renderer ? 2.6 : 1.7) : (this.renderer ? 1.9 : 1.15);
    this.emitFx({ type: "ending", success });
    this.moveInput.x = 0;
    this.moveInput.y = 0;
    this.updateHud(true);
    if (success) {
      this.audio.victory();
      this.flash = 0.22;
    } else {
      this.audio.defeat();
      this.shake = 16;
    }
  }

  completeEnding() {
    const success = this.ending === "success";
    this.mode = "ended";
    this.audio.stopAmbience();
    const earnedCredits = success
      ? 55 + this.sector * 18 + this.cores
      : Math.max(8, Math.floor(this.cores * 0.42) + Math.floor(this.kills / 3));
    const results = {
      success,
      sector: this.sector,
      score: Math.floor(this.score + this.player.y * 0.35),
      kills: this.kills,
      cores: this.cores,
      credits: earnedCredits,
      squad: this.squad.length
    };
    this.callbacks.onFinish?.(results);
  }

  haptic(pattern) {
    this.callbacks.onHaptic?.(pattern);
  }

  toast(message, type = "normal") {
    this.callbacks.onToast?.(message, type);
  }

  updateHud(force = false) {
    if (!this.player || !this.hud.healthFill) return;
    const healthRatio = clamp(this.player.hp / this.player.maxHp, 0, 1);
    const shieldRatio = clamp(this.player.shield / this.player.maxShield, 0, 1);
    const progress = clamp(this.player.y / this.goal, 0, 1);
    this.hud.healthFill.style.transform = `scaleX(${healthRatio})`;
    this.hud.healthText.textContent = Math.ceil(this.player.hp);
    this.hud.shieldFill.style.transform = `scaleX(${shieldRatio})`;
    this.hud.shieldText.textContent = Math.ceil(this.player.shield);
    this.hud.sectorLabel.textContent = `SECTOR ${pad(this.sector)}`;
    this.hud.progressFill.style.width = `${progress * 100}%`;
    this.hud.coreCount.textContent = format(this.cores);
    this.hud.squadCount.textContent = String(this.squad.length + 1);
    this.hud.objectiveText.textContent = this.bossSpawned
      ? this.boss?.alive ? "DESTROY THE RIFT GUARDIAN" : "RIFT COLLAPSING"
      : "ADVANCE TO THE RIFT";
    const cooldownRatio = 1 - clamp(this.novaCooldown / NOVA_COOLDOWN, 0, 1);
    this.hud.novaButton.style.setProperty("--cooldown", cooldownRatio.toFixed(3));
    const ready = this.novaCooldown <= 0.01;
    this.hud.novaButton.classList.toggle("ready", ready);
    this.hud.novaTimer.textContent = ready ? "READY" : `${this.novaCooldown.toFixed(1)}s`;
    if (this.hud.stanceButton) {
      this.hud.stanceButton.dataset.stance = this.stance;
      this.hud.stanceLabel.textContent = this.stance.toUpperCase();
    }
    const comboVisible = this.combo > 1 && this.comboTimer > 0;
    this.hud.comboBadge.classList.toggle("visible", comboVisible);
    this.hud.comboValue.textContent = `x${this.combo}`;
    const bossVisible = this.bossSpawned && this.boss?.alive;
    this.hud.bossHud.classList.toggle("hidden", !bossVisible);
    if (bossVisible) {
      if (this.hud.bossName) this.hud.bossName.textContent = this.boss.bossName || "RIFT GUARDIAN";
      const bossRatio = clamp(this.boss.hp / this.boss.maxHp, 0, 1);
      this.hud.bossHealthFill.style.width = `${bossRatio * 100}%`;
      this.hud.bossHealthText.textContent = `${Math.ceil(bossRatio * 100)}%`;
    }
    if (force) this.callbacks.onHud?.(this.getState());
  }

  getState() {
    return {
      mode: this.mode,
      sector: this.sector,
      score: Math.floor(this.score),
      squad: this.squad.length + 1,
      kills: this.kills,
      cores: this.cores,
      stance: this.stance
    };
  }

  worldToScreen(x, y) {
    return {
      x: this.width * 0.5 + (x - this.camera.x) * this.viewScale,
      y: this.height * 0.61 - (y - this.camera.y) * this.viewScale * 0.68
    };
  }

  visibleAt(x, y, margin = 130) {
    const point = this.worldToScreen(x, y);
    return point.x > -margin && point.x < this.width + margin && point.y > -margin && point.y < this.height + margin;
  }

  render(time) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.mode === "menu") {
      this.renderAttract(time);
      return;
    }
    const shakeX = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake > 0.2 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.drawWorld(time);
    ctx.restore();
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = clamp(this.flash * 1.7, 0, 0.36);
      ctx.fillStyle = this.ending === "success" ? "#b7ffff" : "#ff467c";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  renderAttract(time) {
    this.camera.y = (time * 31) % 3400;
    this.camera.x = this.pathX(this.camera.y) * 0.66;
    this.drawGround(time, true);
    const items = this.previewScenery.filter((item) => this.visibleAt(item.x, item.y, 100));
    items.sort((a, b) => b.y - a.y);
    for (const item of items) this.drawScenery(item, time, 0.58);

    const player = { x: this.pathX(this.camera.y - 100), y: this.camera.y - 105, radius: 23, facing: Math.sin(time * 0.7) * 0.18 };
    const fakeDrones = [];
    for (let index = 0; index < 7; index += 1) {
      const row = Math.floor(index / 4) + 1;
      const col = index % 4;
      const count = row === 1 ? 4 : 3;
      fakeDrones.push({
        x: player.x + (col - (count - 1) / 2) * 48,
        y: player.y - row * 55,
        radius: 15,
        slot: index,
        phase: index,
        hp: 1,
        maxHp: 1,
        hitFlash: 0
      });
    }
    fakeDrones.sort((a, b) => b.y - a.y).forEach((drone) => this.drawDrone(drone, time, 0.62));
    this.drawCommander(player, time, 0.7);
    const veil = this.ctx.createLinearGradient(0, 0, 0, this.height);
    veil.addColorStop(0, "rgba(2,3,12,.05)");
    veil.addColorStop(0.64, "rgba(2,3,12,.28)");
    veil.addColorStop(1, "rgba(2,3,12,.66)");
    this.ctx.fillStyle = veil;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawWorld(time) {
    this.drawGround(time, false);
    const drawables = [];
    for (const item of this.scenery) {
      if (this.visibleAt(item.x, item.y, 100)) drawables.push({ kind: "scenery", y: item.y, item });
    }
    for (const gate of this.gates) {
      if (this.visibleAt(gate.x, gate.y, 160)) drawables.push({ kind: "gate", y: gate.y + 24, item: gate });
    }
    for (const pickup of this.pickups) {
      if (this.visibleAt(pickup.x, pickup.y, 70)) drawables.push({ kind: "pickup", y: pickup.y, item: pickup });
    }
    for (const enemy of this.enemies) {
      if (enemy.alive && this.visibleAt(enemy.x, enemy.y, 160)) drawables.push({ kind: "enemy", y: enemy.y, item: enemy });
    }
    for (const drone of this.squad) {
      if (this.visibleAt(drone.x, drone.y, 90)) drawables.push({ kind: "drone", y: drone.y, item: drone });
    }
    if (this.player && this.visibleAt(this.player.x, this.player.y, 100)) drawables.push({ kind: "player", y: this.player.y, item: this.player });
    drawables.sort((a, b) => b.y - a.y);
    for (const drawable of drawables) {
      if (drawable.kind === "scenery") this.drawScenery(drawable.item, time, 1);
      else if (drawable.kind === "gate") this.drawGate(drawable.item, time);
      else if (drawable.kind === "pickup") this.drawPickup(drawable.item, time);
      else if (drawable.kind === "enemy") this.drawEnemy(drawable.item, time);
      else if (drawable.kind === "drone") this.drawDrone(drawable.item, time, 1);
      else if (drawable.kind === "player") this.drawCommander(drawable.item, time, 1);
    }
    this.drawProjectiles();
    this.drawRings();
    this.drawParticles();
  }

  drawGround(time, preview) {
    const ctx = this.ctx;
    const palettes = [
      ["#0c1635", "#071022", "#030712", "rgba(35,71,146,.18)"],
      ["#21103d", "#100b2d", "#050718", "rgba(137,62,214,.18)"],
      ["#0b2c37", "#071b29", "#031015", "rgba(32,174,180,.16)"],
      ["#351525", "#1b0b1e", "#0c0610", "rgba(205,59,121,.15)"],
      ["#172c22", "#0b1a19", "#040d11", "rgba(63,188,131,.14)"]
    ];
    const palette = palettes[(Math.max(1, this.sector) - 1) % palettes.length];
    const background = ctx.createLinearGradient(0, 0, 0, this.height);
    background.addColorStop(0, palette[0]);
    background.addColorStop(0.52, palette[1]);
    background.addColorStop(1, palette[2]);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);

    const haze = ctx.createRadialGradient(this.width * 0.5, this.height * 0.33, 10, this.width * 0.5, this.height * 0.33, Math.max(this.width, this.height) * 0.72);
    haze.addColorStop(0, preview ? "rgba(56,98,221,.23)" : palette[3]);
    haze.addColorStop(0.55, "rgba(16,43,85,.09)");
    haze.addColorStop(1, "rgba(2,4,13,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGrid();
    this.drawPath(time);

    ctx.save();
    ctx.globalAlpha = 0.34;
    for (let index = 0; index < 22; index += 1) {
      const seed = index * 97.31;
      const x = ((Math.sin(seed) * 0.5 + 0.5) * (this.width + 120) - 60);
      const drift = (time * (3 + (index % 4))) % (this.height + 80);
      const y = ((Math.cos(seed * 1.7) * 0.5 + 0.5) * this.height + drift) % (this.height + 80) - 40;
      const size = 0.8 + (index % 3) * 0.5;
      ctx.fillStyle = index % 5 === 0 ? "#ff5bd5" : "#80efff";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 6;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  drawGrid() {
    const ctx = this.ctx;
    const minY = this.camera.y - this.height / (this.viewScale * 0.68) * 0.72;
    const maxY = this.camera.y + this.height / (this.viewScale * 0.68) * 0.72;
    const firstY = Math.floor(minY / 120) * 120;
    ctx.save();
    ctx.lineWidth = 1;
    for (let y = firstY; y <= maxY; y += 120) {
      const left = this.worldToScreen(-WORLD_HALF_WIDTH - 230, y);
      const right = this.worldToScreen(WORLD_HALF_WIDTH + 230, y);
      const major = Math.round(y / 120) % 5 === 0;
      ctx.strokeStyle = major ? "rgba(66,174,219,.15)" : "rgba(58,129,178,.065)";
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
    for (let x = -720; x <= 720; x += 120) {
      const bottom = this.worldToScreen(x, minY);
      const top = this.worldToScreen(x, maxY);
      const major = Math.round(x / 120) % 5 === 0;
      ctx.strokeStyle = major ? "rgba(66,174,219,.12)" : "rgba(58,129,178,.055)";
      ctx.beginPath();
      ctx.moveTo(bottom.x, bottom.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPath(time) {
    const ctx = this.ctx;
    const verticalRange = this.height / (this.viewScale * 0.68);
    const minY = this.camera.y - verticalRange * 0.78;
    const maxY = this.camera.y + verticalRange * 0.84;
    const leftPoints = [];
    const rightPoints = [];
    for (let y = minY; y <= maxY + 100; y += 75) {
      const center = this.pathX(y);
      const width = 205 + Math.sin(y * 0.0031) * 20;
      leftPoints.push(this.worldToScreen(center - width, y));
      rightPoints.push(this.worldToScreen(center + width, y));
    }
    ctx.save();
    ctx.beginPath();
    leftPoints.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    rightPoints.reverse().forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    const pathGradient = ctx.createLinearGradient(0, 0, this.width, 0);
    pathGradient.addColorStop(0, "rgba(10,20,42,.7)");
    pathGradient.addColorStop(0.5, "rgba(19,34,62,.88)");
    pathGradient.addColorStop(1, "rgba(8,18,38,.7)");
    ctx.fillStyle = pathGradient;
    ctx.fill();

    const drawEdge = (offset, color) => {
      ctx.beginPath();
      for (let y = minY; y <= maxY + 100; y += 60) {
        const center = this.pathX(y);
        const width = 205 + Math.sin(y * 0.0031) * 20;
        const point = this.worldToScreen(center + width * offset, y);
        if (y === minY) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.stroke();
    };
    drawEdge(-1, "rgba(62,217,255,.5)");
    drawEdge(1, "rgba(255,64,199,.38)");
    ctx.shadowBlur = 0;

    ctx.setLineDash([13, 18]);
    ctx.lineDashOffset = -(time * 35) % 31;
    ctx.beginPath();
    for (let y = minY; y <= maxY + 90; y += 50) {
      const point = this.worldToScreen(this.pathX(y), y);
      if (y === minY) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = "rgba(94,225,255,.2)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawScenery(item, time, alpha = 1) {
    const ctx = this.ctx;
    const point = this.worldToScreen(item.x, item.y);
    const scale = this.viewScale * item.size;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(scale, scale * 0.84);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,5,.4)";
    ctx.beginPath();
    ctx.ellipse(6, 15, 29, 10, 0, 0, TAU);
    ctx.fill();
    if (item.type === "rock") {
      const gradient = ctx.createLinearGradient(-20, -30, 22, 18);
      gradient.addColorStop(0, item.hue > 0.75 ? "#344a6c" : "#273450");
      gradient.addColorStop(1, "#101729");
      polygon(ctx, [[-25, 12], [-19, -13], [-5, -27], [17, -19], [28, 4], [15, 18], [-8, 21]]);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(111,175,216,.22)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-18, -11);
      ctx.lineTo(-1, -5);
      ctx.lineTo(16, -18);
      ctx.stroke();
    } else if (item.type === "crystal") {
      const color = item.hue > 0.5 ? "#ff4ed3" : "#46f4ff";
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      polygon(ctx, [[-17, 14], [-9, -14], [-2, -35], [7, -11], [15, -24], [19, 15]]);
      const gradient = ctx.createLinearGradient(0, -35, 0, 16);
      gradient.addColorStop(0, "#f3ffff");
      gradient.addColorStop(0.22, color);
      gradient.addColorStop(1, "#243273");
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (item.type === "beacon") {
      ctx.fillStyle = "#17213d";
      polygon(ctx, [[-14, 14], [-8, -25], [8, -25], [14, 14]]);
      ctx.fill();
      ctx.strokeStyle = "#5776a2";
      ctx.stroke();
      ctx.fillStyle = item.hue > 0.5 ? "#ff4bd8" : "#45f6ff";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.fillRect(-4, -29, 8, 17);
      ctx.globalAlpha = 0.22 * alpha * (0.65 + Math.sin(time * 3 + item.y) * 0.35);
      ctx.fillRect(-28, -52, 56, 4);
    } else {
      ctx.rotate(-0.22);
      ctx.fillStyle = "#202b48";
      polygon(ctx, [[-29, 12], [-21, -10], [15, -17], [30, 1], [17, 14]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,78,138,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -7);
      ctx.lineTo(12, 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGate(gate, time) {
    const ctx = this.ctx;
    const point = this.worldToScreen(gate.x, gate.y);
    const scale = this.viewScale;
    const fade = gate.passed ? (gate.selected ? 0.42 : 0.13) : 1;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(scale, scale * 0.92);
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(0,0,6,.48)";
    ctx.beginPath();
    ctx.ellipse(0, 22, 64, 18, 0, 0, TAU);
    ctx.fill();
    ctx.shadowColor = gate.color;
    ctx.shadowBlur = gate.passed ? 5 : 18;
    ctx.fillStyle = "#121a38";
    polygon(ctx, [[-61, 25], [-54, -47], [-42, -55], [-32, 24]]);
    ctx.fill();
    polygon(ctx, [[61, 25], [54, -47], [42, -55], [32, 24]]);
    ctx.fill();
    ctx.strokeStyle = gate.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-49, -43);
    ctx.lineTo(49, -43);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-47, -38, 94, 55);
    ctx.globalAlpha = fade * (0.12 + Math.sin(time * 5 + gate.row) * 0.025);
    ctx.fillStyle = gate.color;
    ctx.fillRect(-45, -36, 90, 51);
    ctx.globalAlpha = fade;
    ctx.shadowBlur = 9;
    ctx.fillStyle = gate.color;
    ctx.font = "900 19px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(gate.symbol, 0, -13);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f2ffff";
    ctx.font = "900 8.5px system-ui";
    ctx.fillText(gate.label, 0, 4);
    if (!gate.passed) {
      ctx.strokeStyle = gate.color;
      ctx.globalAlpha = 0.26 + Math.sin(time * 4 + gate.row) * 0.1;
      ctx.beginPath();
      ctx.ellipse(0, 20, 71, 19, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPickup(pickup, time) {
    const ctx = this.ctx;
    const point = this.worldToScreen(pickup.x, pickup.y);
    const scale = this.viewScale;
    const bob = Math.sin(time * 5 + pickup.phase) * 4;
    ctx.save();
    ctx.translate(point.x, point.y + bob * scale);
    ctx.scale(scale, scale);
    ctx.rotate(time * 2.2 + pickup.phase);
    ctx.shadowColor = "#ffd85a";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffd85a";
    polygon(ctx, [[0, -11], [9, -4], [9, 5], [0, 12], [-9, 5], [-9, -4]]);
    ctx.fill();
    ctx.fillStyle = "#fff6b3";
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawCommander(player, time, alpha = 1) {
    const ctx = this.ctx;
    const point = this.worldToScreen(player.x, player.y);
    const scale = this.viewScale;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(scale, scale * 0.92);
    ctx.rotate(player.facing || 0);
    ctx.globalAlpha = alpha * (player.invulnerable > 0 && Math.floor(time * 22) % 2 ? 0.46 : 1);
    ctx.fillStyle = "rgba(0,0,5,.54)";
    ctx.beginPath();
    ctx.ellipse(3, 19, 29, 11, 0, 0, TAU);
    ctx.fill();

    const thruster = 10 + Math.sin(time * 15) * 3;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#48f6ff";
    ctx.shadowColor = "#48f6ff";
    ctx.shadowBlur = 15;
    polygon(ctx, [[-12, 15], [-4, 15], [-8, 15 + thruster]]);
    ctx.fill();
    polygon(ctx, [[12, 15], [4, 15], [8, 15 + thruster]]);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;

    const hull = ctx.createLinearGradient(-24, -20, 24, 20);
    hull.addColorStop(0, "#d9ffff");
    hull.addColorStop(0.28, "#538cff");
    hull.addColorStop(0.64, "#25336e");
    hull.addColorStop(1, "#ff52ce");
    polygon(ctx, [[0, -31], [19, -10], [28, 12], [11, 18], [0, 10], [-11, 18], [-28, 12], [-19, -10]]);
    ctx.fillStyle = hull;
    ctx.fill();
    ctx.strokeStyle = "#8ffbff";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#090e29";
    polygon(ctx, [[0, -20], [10, -8], [7, 5], [0, 10], [-7, 5], [-10, -8]]);
    ctx.fill();
    ctx.fillStyle = "#baffff";
    ctx.shadowColor = "#45f6ff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, -8, 6.5, 9, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.beginPath();
    ctx.moveTo(-20, 5);
    ctx.lineTo(-31, 12);
    ctx.moveTo(20, 5);
    ctx.lineTo(31, 12);
    ctx.stroke();

    ctx.strokeStyle = "rgba(78,247,255,.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 6, 36, 17, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawDrone(drone, time, alpha = 1) {
    const ctx = this.ctx;
    const point = this.worldToScreen(drone.x, drone.y);
    const scale = this.viewScale;
    const role = DRONE_ROLES.find((item) => item.id === drone.role) || DRONE_ROLES[drone.slot % DRONE_ROLES.length];
    const color = drone.color || role.color;
    const bob = Math.sin(time * 5.5 + drone.phase) * 2.5;
    ctx.save();
    ctx.translate(point.x, point.y + bob * scale);
    ctx.scale(scale, scale * 0.92);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,5,.44)";
    ctx.beginPath(); ctx.ellipse(0, 13, 21, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = drone.hitFlash > 0 ? "#ffffff" : "#172142";
    ctx.strokeStyle = color; ctx.lineWidth = role.id === "bulwark" ? 2.4 : 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = 9;
    if (role.id === "rail") {
      polygon(ctx, [[0,-20],[8,-4],[27,4],[9,9],[0,18],[-9,9],[-27,4],[-8,-4]]); ctx.fill(); ctx.stroke();
      ctx.fillStyle=color; ctx.fillRect(-3,-27,6,26);
    } else if (role.id === "bulwark") {
      hexPath(ctx, 19, .82); ctx.fill(); ctx.stroke();
      ctx.strokeStyle="rgba(170,192,255,.8)"; ctx.beginPath(); ctx.arc(0,0,25,Math.PI*.12,Math.PI*.88); ctx.stroke();
    } else if (role.id === "medic") {
      polygon(ctx, [[0,-18],[13,-5],[23,7],[7,11],[0,18],[-7,11],[-23,7],[-13,-5]]); ctx.fill(); ctx.stroke();
      ctx.fillStyle=color; ctx.fillRect(-3,-11,6,19); ctx.fillRect(-9,-5,18,6);
    } else {
      polygon(ctx, [[0,-18],[12,-3],[24,7],[7,10],[0,17],[-7,10],[-24,7],[-12,-3]]); ctx.fill(); ctx.stroke();
      ctx.fillStyle=color; ctx.beginPath(); ctx.arc(0,-2,4.2,0,TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (drone.hp < drone.maxHp) this.drawMiniHealth(ctx, drone.hp / drone.maxHp, -18, 24, 36);
    ctx.restore();
  }

  drawEnemy(enemy, time) {
    if (enemy.type === "boss") {
      this.drawBoss(enemy, time);
      return;
    }
    const ctx = this.ctx;
    const point = this.worldToScreen(enemy.x, enemy.y);
    const scale = this.viewScale * (enemy.type === "brute" ? 1.22 : enemy.type === "turret" ? 1.16 : enemy.type === "shield" ? 1.12 : 1);
    const pulse = 0.75 + Math.sin(time * 4 + enemy.phase) * 0.18;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(scale, scale * 0.92);
    ctx.fillStyle = "rgba(0,0,5,.5)";
    ctx.beginPath();
    ctx.ellipse(4, 15, enemy.radius * 1.15, enemy.radius * 0.42, 0, 0, TAU);
    ctx.fill();
    const hostile = enemy.hitFlash > 0 ? "#ffffff" : enemy.type === "turret" ? "#78244e" : enemy.type === "jammer" ? "#321a58" : "#3a1832";
    ctx.fillStyle = hostile;
    ctx.strokeStyle = enemy.type === "shooter" ? "#ff9f51" : enemy.type === "jammer" ? "#ba62ff" : enemy.type === "shield" ? "#879cff" : enemy.type === "charger" ? "#ff6a54" : "#ff4d8d";
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 8;
    if (enemy.type === "grunt") {
      polygon(ctx, [[0, -21], [17, -10], [21, 10], [8, 17], [0, 10], [-8, 17], [-21, 10], [-17, -10]]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff536f";
      ctx.fillRect(-12, -4, 24, 5);
    } else if (enemy.type === "shooter") {
      polygon(ctx, [[0, -23], [16, -8], [27, 1], [15, 8], [8, 17], [-8, 17], [-15, 8], [-27, 1], [-16, -8]]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb25c";
      ctx.fillRect(-4, -17, 8, 21);
      ctx.fillRect(-20, -2, 40, 4);
    } else if (enemy.type === "brute") {
      hexPath(ctx, 28, 0.88); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ff4378"; ctx.globalAlpha = pulse; hexPath(ctx, 11, 0.88); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#59203e"; ctx.fillRect(-34, -5, 10, 22); ctx.fillRect(24, -5, 10, 22);
    } else if (enemy.type === "charger") {
      polygon(ctx, [[0,-24],[10,-8],[28,4],[12,11],[0,20],[-12,11],[-28,4],[-10,-8]]); ctx.fill(); ctx.stroke();
      ctx.fillStyle="#ff6a54"; polygon(ctx,[[-22,-2],[-37,-12],[-29,8]]);ctx.fill(); polygon(ctx,[[22,-2],[37,-12],[29,8]]);ctx.fill();
    } else if (enemy.type === "shield") {
      hexPath(ctx, 26, .88); ctx.fill(); ctx.stroke();
      ctx.strokeStyle="#a8b8ff"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,1,33,Math.PI*.1,Math.PI*.9);ctx.stroke();
      if (enemy.shield > 0) { ctx.globalAlpha=.35+.25*pulse; ctx.strokeStyle="#879cff";ctx.beginPath();ctx.arc(0,0,37,0,TAU);ctx.stroke();ctx.globalAlpha=1; }
    } else if (enemy.type === "jammer") {
      polygon(ctx,[[0,-24],[18,-8],[27,10],[8,17],[0,9],[-8,17],[-27,10],[-18,-8]]);ctx.fill();ctx.stroke();
      ctx.strokeStyle="#ba62ff";ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(0,0,34+Math.sin(time*4+enemy.phase)*5,0,TAU);ctx.stroke();ctx.globalAlpha=1;
      ctx.fillStyle="#e8c8ff";ctx.beginPath();ctx.arc(0,-2,5,0,TAU);ctx.fill();
    } else if (enemy.type === "splitter") {
      hexPath(ctx, 24, .9);ctx.fill();ctx.stroke();ctx.rotate(Math.sin(time*2+enemy.phase)*.22);
      ctx.strokeStyle="#ff7bb7";ctx.beginPath();ctx.moveTo(-19,-18);ctx.lineTo(18,17);ctx.moveTo(18,-18);ctx.lineTo(-19,17);ctx.stroke();
    } else {
      ctx.fillStyle = hostile;
      hexPath(ctx, 30, 0.72);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(time * 0.7);
      ctx.fillStyle = "#ff3d91";
      for (let index = 0; index < 4; index += 1) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(-3, -35, 6, 19);
      }
      ctx.rotate(-time * 0.7);
      ctx.fillStyle = "#e4faff";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (enemy.hp < enemy.maxHp || enemy.active) this.drawMiniHealth(ctx, enemy.hp / enemy.maxHp, -enemy.radius, -enemy.radius - 13, enemy.radius * 2);
    ctx.restore();
  }

  drawBoss(enemy, time) {
    const ctx = this.ctx;
    const point = this.worldToScreen(enemy.x, enemy.y);
    const scale = this.viewScale;
    const pulse = 0.6 + Math.sin(time * 3.2) * 0.28;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.scale(scale, scale * 0.9);
    ctx.fillStyle = "rgba(0,0,5,.65)";
    ctx.beginPath();
    ctx.ellipse(8, 35, 78, 27, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(Math.sin(time * 0.8) * 0.06);
    ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : "#28152f";
    ctx.strokeStyle = "#ff3e91";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ff3e91";
    ctx.shadowBlur = 14;
    polygon(ctx, [[0, -70], [31, -48], [58, -22], [69, 20], [33, 34], [0, 22], [-33, 34], [-69, 20], [-58, -22], [-31, -48]]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#421c46";
    polygon(ctx, [[-58, -18], [-92, -4], [-83, 17], [-49, 10]]);
    ctx.fill();
    polygon(ctx, [[58, -18], [92, -4], [83, 17], [49, 10]]);
    ctx.fill();
    ctx.strokeStyle = "#ff699f";
    ctx.stroke();
    ctx.fillStyle = `rgba(255,72,190,${pulse})`;
    ctx.shadowBlur = 24;
    hexPath(ctx, 22, 0.9);
    ctx.fill();
    ctx.fillStyle = "#fff2ff";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#11182f";
    ctx.fillRect(-51, 20, 19, 39);
    ctx.fillRect(32, 20, 19, 39);
    ctx.fillStyle = "#ff4b8d";
    ctx.fillRect(-49, 51, 15, 7);
    ctx.fillRect(34, 51, 15, 7);
    ctx.restore();
  }

  drawMiniHealth(ctx, ratio, x, y, width) {
    const clamped = clamp(ratio, 0, 1);
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.fillRect(x, y, width, 4);
    ctx.fillStyle = clamped > 0.5 ? "#4dffad" : clamped > 0.25 ? "#ffd85a" : "#ff4f70";
    ctx.fillRect(x + 1, y + 1, Math.max(0, (width - 2) * clamped), 2);
    ctx.restore();
  }

  drawProjectiles() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const projectile of this.projectiles) {
      if (!this.visibleAt(projectile.x, projectile.y, 50)) continue;
      const point = this.worldToScreen(projectile.x, projectile.y);
      const tail = this.worldToScreen(projectile.x - projectile.vx * 0.025, projectile.y - projectile.vy * 0.025);
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = projectile.radius * this.viewScale * 0.9;
      ctx.lineCap = "round";
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRings() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ring of this.rings) {
      const point = this.worldToScreen(ring.x, ring.y);
      const alpha = clamp(ring.life / ring.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2 + alpha * 5;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, ring.radius * this.viewScale, ring.radius * this.viewScale * 0.68, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const particle of this.particles) {
      if (!this.visibleAt(particle.x, particle.y, 40)) continue;
      const point = this.worldToScreen(particle.x, particle.y);
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 6;
      const size = particle.size * this.viewScale * (0.55 + alpha * 0.65);
      ctx.fillRect(point.x - size * 0.5, point.y - size * 0.5, size, size);
    }
    ctx.restore();
  }
}
