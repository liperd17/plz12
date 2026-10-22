import Phaser from 'phaser';
import './style.css';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const GRID_SPACING = 100;
const PLAYER_SIZE = 48;
const BLOCK_SIZE = PLAYER_SIZE * 4;
const MONSTER_TEXTURE = 'enemy-bat';
const MONSTER_SIZE = 32;
const MONSTER_SPEED = 120;
const MONSTER_START_COUNT = 3;
const MONSTER_MAX_COUNT = 30;
const MONSTER_SPAWN_INTERVAL = 5000;
const MONSTER_TARGET_INTERVAL = 250;
const MONSTER_PATH_UPDATE_INTERVAL = 500;
const MONSTER_PLAYER_CLEARANCE = 500;
const MONSTER_ATTACK_COOLDOWN = 3000;
const MONSTER_ATTACK_DAMAGE = 5;
const MONSTER_DEATH_FADE_DURATION = 300;
const PLAYER_HIT_FLASH_DURATION = 1000;
const PLAYER_COLOR = 0x4ade80;
const PLAYER_HIT_COLOR = 0xff0000;
const PLAYER_MAX_HEALTH = 100;
const PLAYER_HEALTH_BAR_WIDTH = 220;
const PLAYER_HEALTH_BAR_HEIGHT = 16;
const PLAYER_START_LEVEL = 1;
const PLAYER_MAX_LEVEL = 20;
const PLAYER_START_XP_REQUIREMENT = 10;
const PLAYER_XP_REQUIREMENT_STEP = 5;
const MONSTER_LEVEL_SPAWN_BONUS = 0.25;
const WEAPON_STORAGE_CAPACITY = 5;
const TEMPORARY_WEAPON_ID = 'temporaryA';
const TEMPORARY_WEAPON_PICKUP_DISTANCE = 300;
const PROJECTILE_INTERVAL = 1500;
const PROJECTILE_DAMAGE = 1;
const PROJECTILE_SPEED = 400;
const PROJECTILE_RADIUS = 5;
const PROJECTILE_LIFETIME = 2000;
const RADAR_RADIUS = 500;
const OBSTACLE_MIN_COUNT = 20;
const OBSTACLE_MAX_COUNT = 30;
const OBSTACLE_SPAWN_CLEARANCE = 500;
const OBSTACLE_MIN_GAP = PLAYER_SIZE * 3;
const OBSTACLE_AREA = PLAYER_SIZE * PLAYER_SIZE * 2;
const BASE_PLAYER_SPEED = PLAYER_SIZE;
const PLAYER_SPEED = BASE_PLAYER_SPEED * 5;

type ObstaclePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NavigationEdge = {
  index: number;
  distance: number;
};

type NavigationNode = {
  x: number;
  y: number;
  edges: NavigationEdge[];
};

type UpgradeKind = 'attackSpeed' | 'movementSpeed' | 'heal' | 'radar';
type UpgradeRarity = 'common' | 'advanced';

type UpgradeChoice = {
  kind: UpgradeKind;
  rarity: UpgradeRarity;
};

type StoredWeaponId = typeof TEMPORARY_WEAPON_ID;

class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private weaponPickup!: Phaser.GameObjects.Rectangle;
  private weaponPickupLabel!: Phaser.GameObjects.Text;
  private monsters!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private radarGraphics!: Phaser.GameObjects.Graphics;
  private playerHealth = PLAYER_MAX_HEALTH;
  private playerHealthFill!: Phaser.GameObjects.Rectangle;
  private playerHealthText!: Phaser.GameObjects.Text;
  private experience = 0;
  private experienceToNextLevel = PLAYER_START_XP_REQUIREMENT;
  private playerLevel = PLAYER_START_LEVEL;
  private experienceFill!: Phaser.GameObjects.Rectangle;
  private experienceText!: Phaser.GameObjects.Text;
  private storedWeapons: StoredWeaponId[] = [];
  private weaponStorageText!: Phaser.GameObjects.Text;
  private projectileTimer!: Phaser.Time.TimerEvent;
  private monsterSpawnTimer!: Phaser.Time.TimerEvent;
  private attackSpeedMultiplier = 1;
  private movementSpeedMultiplier = 1;
  private radarRadius = RADAR_RADIUS;
  private gameOverOverlay!: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text>;
  private obstaclePlacements: ObstaclePlacement[] = [];
  private navigationRects: Phaser.Geom.Rectangle[] = [];
  private navigationNodes: NavigationNode[] = [];
  private monsterTarget = new Phaser.Math.Vector2();
  private navigationGoal = new Phaser.Math.Vector2();
  private navigationDistances: number[] = [];
  private monsterAttackCooldownActive = false;
  private isGameOver = false;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  create() {
    this.playerHealth = PLAYER_MAX_HEALTH;
    this.experience = 0;
    this.experienceToNextLevel = PLAYER_START_XP_REQUIREMENT;
    this.playerLevel = PLAYER_START_LEVEL;
    this.storedWeapons = [];
    this.attackSpeedMultiplier = 1;
    this.movementSpeedMultiplier = 1;
    this.radarRadius = RADAR_RADIUS;
    this.monsterAttackCooldownActive = false;
    this.isGameOver = false;
    this.obstaclePlacements = [];
    this.navigationRects = [];
    this.navigationNodes = [];
    this.navigationDistances = [];

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.createMonsterTexture();

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x263244, 0.7);
    for (let x = 0; x <= WORLD_WIDTH; x += GRID_SPACING) {
      grid.lineBetween(x, 0, x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += GRID_SPACING) {
      grid.lineBetween(0, y, WORLD_WIDTH, y);
    }

    const blocks = this.physics.add.staticGroup();
    const blocksPerSide = Math.ceil(WORLD_WIDTH / BLOCK_SIZE);
    const firstBlockCenter = BLOCK_SIZE / 2;
    const sideLengthBetweenCenters = WORLD_WIDTH - BLOCK_SIZE;
    const blockSpacing = sideLengthBetweenCenters / (blocksPerSide - 1);
    const addBlock = (x: number, y: number) => {
      const gray = Math.round(128 * Phaser.Math.FloatBetween(0.9, 1.1));
      const color = Phaser.Display.Color.GetColor(gray, gray, gray);
      blocks.add(this.add.rectangle(x, y, BLOCK_SIZE, BLOCK_SIZE, color));
    };

    for (let index = 0; index < blocksPerSide; index += 1) {
      const position = firstBlockCenter + index * blockSpacing;
      addBlock(position, firstBlockCenter);
      addBlock(position, WORLD_HEIGHT - firstBlockCenter);
      addBlock(firstBlockCenter, position);
      addBlock(WORLD_WIDTH - firstBlockCenter, position);
    }

    const obstacleGroup = this.physics.add.staticGroup();
    const obstacles: ObstaclePlacement[] = [];
    const obstacleCount = Phaser.Math.Between(OBSTACLE_MIN_COUNT, OBSTACLE_MAX_COUNT);
    const playerStartX = WORLD_WIDTH / 2;
    const playerStartY = WORLD_HEIGHT / 2;

    for (let index = 0; index < obstacleCount; index += 1) {
      let placement: ObstaclePlacement | undefined;

      for (let attempt = 0; attempt < 1000 && !placement; attempt += 1) {
        const ratio = Phaser.Math.FloatBetween(1 / 4, 2 / 3);
        const width = Math.sqrt(OBSTACLE_AREA * ratio);
        const height = Math.sqrt(OBSTACLE_AREA / ratio);
        const x = Phaser.Math.FloatBetween(
          BLOCK_SIZE / 2 + width / 2,
          WORLD_WIDTH - BLOCK_SIZE / 2 - width / 2,
        );
        const y = Phaser.Math.FloatBetween(
          BLOCK_SIZE / 2 + height / 2,
          WORLD_HEIGHT - BLOCK_SIZE / 2 - height / 2,
        );
        const playerGapX = Math.max(Math.abs(x - playerStartX) - width / 2, 0);
        const playerGapY = Math.max(Math.abs(y - playerStartY) - height / 2, 0);

        if (Math.hypot(playerGapX, playerGapY) < OBSTACLE_SPAWN_CLEARANCE) {
          continue;
        }

        const overlapsNearbyObstacle = obstacles.some((obstacle) => {
          const gapX = Math.max(
            Math.abs(x - obstacle.x) - (width + obstacle.width) / 2,
            0,
          );
          const gapY = Math.max(
            Math.abs(y - obstacle.y) - (height + obstacle.height) / 2,
            0,
          );
          return Math.hypot(gapX, gapY) < OBSTACLE_MIN_GAP;
        });

        if (!overlapsNearbyObstacle) {
          placement = { x, y, width, height };
        }
      }

      if (!placement) {
        throw new Error(`Unable to place obstacle ${index + 1} without violating spacing rules.`);
      }

      obstacles.push(placement);
      obstacleGroup.add(
        this.add.rectangle(
          placement.x,
          placement.y,
          placement.width,
          placement.height,
          0x8b3a32,
        ),
      );
    }
    this.obstaclePlacements = obstacles;
    this.createNavigationGraph();

    this.player = this.add.rectangle(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      PLAYER_COLOR,
    );
    this.player.setDepth(2);
    this.weaponPickup = this.add.rectangle(
      this.player.x + TEMPORARY_WEAPON_PICKUP_DISTANCE,
      this.player.y,
      24,
      24,
      0xf4b942,
    );
    this.weaponPickup.setRotation(Math.PI / 4).setDepth(2);
    this.weaponPickup.setData('weaponId', TEMPORARY_WEAPON_ID);
    this.weaponPickupLabel = this.add.text(
      this.weaponPickup.x,
      this.weaponPickup.y - 24,
      '임시 아이템 A',
      {
        color: '#ffd166',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        backgroundColor: '#111827',
        padding: { x: 4, y: 2 },
      },
    ).setOrigin(0.5).setDepth(3);
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.add.existing(this.weaponPickup, true);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.add.collider(this.player, blocks);
    this.physics.add.collider(this.player, obstacleGroup);
    this.createPlayerHud();
    this.physics.add.overlap(
      this.player,
      this.weaponPickup,
      this.onWeaponPickup,
      undefined,
      this,
    );

    this.monsters = this.physics.add.group();
    this.monsterTarget.set(this.player.x, this.player.y);
    this.updateNavigationPaths();
    for (let index = 0; index < MONSTER_START_COUNT; index += 1) {
      if (!this.spawnMonster()) {
        throw new Error(`Unable to place starting monster ${index + 1}.`);
      }
    }

    this.physics.add.collider(this.monsters, blocks);
    this.physics.add.collider(this.monsters, obstacleGroup);
    this.physics.add.collider(this.monsters, this.monsters);
    this.physics.add.overlap(
      this.player,
      this.monsters,
      this.onPlayerContact,
      undefined,
      this,
    );

    this.projectiles = this.physics.add.group();
    this.physics.add.overlap(
      this.projectiles,
      this.monsters,
      this.onProjectileHit,
      undefined,
      this,
    );
    this.projectileTimer = this.time.addEvent({
      delay: this.getProjectileInterval(),
      loop: true,
      callback: () => this.fireProjectile(),
    });

    this.time.addEvent({
      delay: MONSTER_TARGET_INTERVAL,
      loop: true,
      callback: () => this.monsterTarget.set(this.player.x, this.player.y),
    });
    this.time.addEvent({
      delay: MONSTER_PATH_UPDATE_INTERVAL,
      loop: true,
      callback: () => this.updateNavigationPaths(),
    });
    this.monsterSpawnTimer = this.time.addEvent({
      delay: this.getMonsterSpawnInterval(),
      loop: true,
      callback: () => this.spawnMonsterOnTimer(),
    });

    this.radarGraphics = this.add.graphics().setDepth(3);
    keyboard.on('keydown-SPACE', this.restartAfterGameOver, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown-SPACE', this.restartAfterGameOver, this);
    });
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player);
  }

  private createPlayerHud() {
    const experienceBackground = this.add.rectangle(
      20,
      10,
      PLAYER_HEALTH_BAR_WIDTH,
      12,
      0x14263d,
    );
    experienceBackground.setOrigin(0, 0).setScrollFactor(0).setDepth(10);

    this.experienceFill = this.add.rectangle(
      20,
      10,
      PLAYER_HEALTH_BAR_WIDTH,
      12,
      0x38a9ff,
    );
    this.experienceFill.setOrigin(0, 0).setScrollFactor(0).setDepth(11);

    this.experienceText = this.add.text(20, 24, '', {
      color: '#ffffff',
      fontFamily: 'sans-serif',
      fontSize: '14px',
    });
    this.experienceText.setScrollFactor(0).setDepth(11);

    const healthBackground = this.add.rectangle(
      20,
      48,
      PLAYER_HEALTH_BAR_WIDTH,
      PLAYER_HEALTH_BAR_HEIGHT,
      0x3b1820,
    );
    healthBackground.setOrigin(0, 0).setScrollFactor(0).setDepth(10);

    this.playerHealthFill = this.add.rectangle(
      20,
      48,
      PLAYER_HEALTH_BAR_WIDTH,
      PLAYER_HEALTH_BAR_HEIGHT,
      0x4ade80,
    );
    this.playerHealthFill.setOrigin(0, 0).setScrollFactor(0).setDepth(11);

    this.playerHealthText = this.add.text(20, 68, '', {
      color: '#ffffff',
      fontFamily: 'sans-serif',
      fontSize: '16px',
    });
    this.playerHealthText.setScrollFactor(0).setDepth(11);

    this.weaponStorageText = this.add.text(20, 94, '', {
      color: '#ffffff',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      lineSpacing: 4,
    });
    this.weaponStorageText.setScrollFactor(0).setDepth(11);
    this.updateWeaponStorageHud();

    this.updateExperienceHud();
    this.updatePlayerHealthHud();

    const darkness = this.add.rectangle(
      0,
      0,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.85,
    );
    darkness.setOrigin(0, 0);
    const title = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 28,
      'GAME OVER',
      {
        color: '#ff5555',
        fontFamily: 'sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
      },
    ).setOrigin(0.5);
    const prompt = this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 38,
      'Press SPACE to restart',
      {
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontSize: '20px',
      },
    ).setOrigin(0.5);

    this.gameOverOverlay = [darkness, title, prompt];
    for (const item of this.gameOverOverlay) {
      item.setScrollFactor(0).setDepth(20).setVisible(false);
    }
  }

  private updatePlayerHealthHud() {
    this.playerHealthFill.setSize(
      PLAYER_HEALTH_BAR_WIDTH * (this.playerHealth / PLAYER_MAX_HEALTH),
      PLAYER_HEALTH_BAR_HEIGHT,
    );
    this.playerHealthText.setText(`HP ${this.playerHealth} / ${PLAYER_MAX_HEALTH}`);
  }

  private updateExperienceHud() {
    const isMaxLevel = this.playerLevel >= PLAYER_MAX_LEVEL;
    this.experienceFill.setSize(
      PLAYER_HEALTH_BAR_WIDTH
        * (isMaxLevel ? 1 : this.experience / this.experienceToNextLevel),
      12,
    );
    this.experienceText.setText(
      isMaxLevel
        ? `LV ${this.playerLevel}  MAX`
        : `LV ${this.playerLevel}  EXP ${this.experience} / ${this.experienceToNextLevel}`,
    );
  }

  private updateWeaponStorageHud() {
    const contents = this.storedWeapons.length > 0
      ? this.storedWeapons.map(() => '임시 무기 A').join('\n')
      : '비어 있음';
    this.weaponStorageText.setText(
      `무기 창고 ${this.storedWeapons.length}/${WEAPON_STORAGE_CAPACITY}\n${contents}`,
    );
  }

  private onWeaponPickup(
    _playerObject: Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
    pickupObject: Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
  ) {
    if (
      !(pickupObject instanceof Phaser.GameObjects.Rectangle)
      || !pickupObject.active
      || this.storedWeapons.length >= WEAPON_STORAGE_CAPACITY
    ) {
      return;
    }

    const weaponId: unknown = pickupObject.getData('weaponId');
    if (weaponId !== TEMPORARY_WEAPON_ID) {
      return;
    }

    this.storedWeapons.push(weaponId);
    this.updateWeaponStorageHud();
    pickupObject.destroy();
    this.weaponPickupLabel.destroy();
  }

  private gainExperience(amount: number) {
    if (this.playerLevel >= PLAYER_MAX_LEVEL) {
      return;
    }

    this.experience += amount;
    let leveledUp = false;
    while (
      this.experience >= this.experienceToNextLevel
      && this.playerLevel < PLAYER_MAX_LEVEL
    ) {
      this.experience -= this.experienceToNextLevel;
      this.playerLevel += 1;
      this.experienceToNextLevel += PLAYER_XP_REQUIREMENT_STEP;
      leveledUp = true;
      this.refreshLevelScaledTimers();
    }

    if (this.playerLevel >= PLAYER_MAX_LEVEL) {
      this.experience = 0;
    }
    this.updateExperienceHud();
    if (leveledUp) {
      this.openUpgradeSelection();
    }
  }

  private getProjectileInterval() {
    return PROJECTILE_INTERVAL / this.attackSpeedMultiplier;
  }

  private getMonsterSpawnInterval() {
    const spawnRateMultiplier = (1 + MONSTER_LEVEL_SPAWN_BONUS)
      ** (this.playerLevel - PLAYER_START_LEVEL);
    return MONSTER_SPAWN_INTERVAL / spawnRateMultiplier;
  }

  private refreshLevelScaledTimers() {
    this.monsterSpawnTimer.reset({
      delay: this.getMonsterSpawnInterval(),
      loop: true,
      callback: () => this.spawnMonsterOnTimer(),
    });
  }

  private openUpgradeSelection() {
    const kinds: UpgradeKind[] = ['attackSpeed', 'movementSpeed', 'heal', 'radar'];
    const choices = Phaser.Utils.Array.Shuffle(kinds)
      .slice(0, 3)
      .map((kind): UpgradeChoice => ({
        kind,
        rarity: Phaser.Math.Between(1, 100) <= 20 ? 'advanced' : 'common',
      }));
    this.scene.launch('upgrade', choices);
    this.scene.pause();
  }

  applyUpgrade(choice: UpgradeChoice) {
    const advanced = choice.rarity === 'advanced';
    switch (choice.kind) {
      case 'attackSpeed':
        this.attackSpeedMultiplier *= 1 + (advanced ? 0.1 : 0.05);
        this.projectileTimer.reset({
          delay: this.getProjectileInterval(),
          loop: true,
          callback: () => this.fireProjectile(),
        });
        break;
      case 'movementSpeed':
        this.movementSpeedMultiplier *= 1 + (advanced ? 0.08 : 0.03);
        break;
      case 'heal':
        this.playerHealth = advanced
          ? PLAYER_MAX_HEALTH
          : Math.min(PLAYER_MAX_HEALTH, this.playerHealth + 20);
        this.updatePlayerHealthHud();
        break;
      case 'radar':
        this.radarRadius *= 1 + (advanced ? 0.1 : 0.05);
        break;
    }
  }

  private spawnMonsterOnTimer() {
    if (
      this.isGameOver
      || this.monsters.countActive(true) >= MONSTER_MAX_COUNT
    ) {
      return;
    }

    if (!this.spawnMonster()) {
      throw new Error('Unable to place a monster while respecting spawn rules.');
    }
  }

  private restartAfterGameOver() {
    if (this.isGameOver) {
      this.scene.restart();
    }
  }

  private showGameOver() {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.playerBody.setVelocity(0, 0);
    this.playerBody.enable = false;

    for (const monster of this.monsters.getChildren()) {
      if (monster.body instanceof Phaser.Physics.Arcade.Body) {
        monster.body.setVelocity(0, 0);
        monster.body.enable = false;
      }
    }
    for (const projectile of this.projectiles.getChildren()) {
      projectile.destroy();
    }
    for (const item of this.gameOverOverlay) {
      item.setVisible(true);
    }
  }

  private createMonsterTexture() {
    if (this.textures.exists(MONSTER_TEXTURE)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xb44762, 1);
    graphics.fillTriangle(16, 3, 1, 14, 8, 27);
    graphics.fillTriangle(16, 3, 31, 14, 24, 27);
    graphics.fillTriangle(16, 7, 10, 30, 22, 30);
    graphics.generateTexture(MONSTER_TEXTURE, MONSTER_SIZE, MONSTER_SIZE);
    graphics.destroy();
  }

  private spawnMonster() {
    if (this.monsters.countActive(true) >= MONSTER_MAX_COUNT) {
      return false;
    }

    const halfSize = MONSTER_SIZE / 2;
    const minimumPosition = BLOCK_SIZE + halfSize;
    const maximumX = WORLD_WIDTH - minimumPosition;
    const maximumY = WORLD_HEIGHT - minimumPosition;

    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const x = Phaser.Math.FloatBetween(minimumPosition, maximumX);
      const y = Phaser.Math.FloatBetween(minimumPosition, maximumY);
      if (
        Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y)
          < Math.max(MONSTER_PLAYER_CLEARANCE, (MONSTER_SIZE + PLAYER_SIZE) / 2)
      ) {
        continue;
      }

      const overlapsObstacle = this.obstaclePlacements.some(
        (obstacle) =>
          Math.abs(x - obstacle.x) < halfSize + obstacle.width / 2
          && Math.abs(y - obstacle.y) < halfSize + obstacle.height / 2,
      );
      if (overlapsObstacle) {
        continue;
      }

      const overlapsMonster = this.monsters.getChildren().some((child) => {
        if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) {
          return false;
        }

        return Math.abs(x - child.x) < MONSTER_SIZE
          && Math.abs(y - child.y) < MONSTER_SIZE;
      });
      if (overlapsMonster) {
        continue;
      }

      const monster = this.physics.add.sprite(x, y, MONSTER_TEXTURE);
      monster.setDisplaySize(MONSTER_SIZE, MONSTER_SIZE);
      monster.setDepth(2);
      monster.setData('canAttack', !this.monsterAttackCooldownActive);
      monster.setCollideWorldBounds(true);
      this.monsters.add(monster);
      this.updateMonsterWaypoint(monster);
      return true;
    }

    return false;
  }

  private createNavigationGraph() {
    const clearance = MONSTER_SIZE / 2 + 1;
    this.navigationRects = this.obstaclePlacements.map(
      ({ x, y, width, height }) =>
        new Phaser.Geom.Rectangle(
          x - width / 2 - clearance,
          y - height / 2 - clearance,
          width + clearance * 2,
          height + clearance * 2,
        ),
    );

    const worldInset = BLOCK_SIZE + MONSTER_SIZE / 2;
    for (const rect of this.navigationRects) {
      const candidates = [
        { x: rect.left - 1, y: rect.top - 1 },
        { x: rect.right + 1, y: rect.top - 1 },
        { x: rect.left - 1, y: rect.bottom + 1 },
        { x: rect.right + 1, y: rect.bottom + 1 },
      ];

      for (const point of candidates) {
        if (
          point.x < worldInset
          || point.x > WORLD_WIDTH - worldInset
          || point.y < worldInset
          || point.y > WORLD_HEIGHT - worldInset
          || this.navigationRects.some((other) => this.pointInsideRect(point.x, point.y, other))
        ) {
          continue;
        }

        if (
          this.navigationNodes.some(
            (node) =>
              Phaser.Math.Distance.Between(point.x, point.y, node.x, node.y) < 1,
          )
        ) {
          continue;
        }

        this.navigationNodes.push({ ...point, edges: [] });
      }
    }

    for (let first = 0; first < this.navigationNodes.length; first += 1) {
      for (let second = first + 1; second < this.navigationNodes.length; second += 1) {
        const from = this.navigationNodes[first];
        const to = this.navigationNodes[second];
        if (this.pathIsClear(from.x, from.y, to.x, to.y)) {
          const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
          from.edges.push({ index: second, distance });
          to.edges.push({ index: first, distance });
        }
      }
    }
  }

  private pointInsideRect(x: number, y: number, rect: Phaser.Geom.Rectangle) {
    return x > rect.left && x < rect.right && y > rect.top && y < rect.bottom;
  }

  private pathIsClear(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) {
    return this.navigationRects.every(
      (rect) => !this.segmentIntersectsRect(startX, startY, endX, endY, rect),
    );
  }

  private segmentIntersectsRect(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    rect: Phaser.Geom.Rectangle,
  ) {
    let minimum = 0;
    let maximum = 1;
    const axes = [
      { start: startX, delta: endX - startX, min: rect.left, max: rect.right },
      { start: startY, delta: endY - startY, min: rect.top, max: rect.bottom },
    ];

    for (const axis of axes) {
      if (axis.delta === 0) {
        if (axis.start < axis.min || axis.start > axis.max) {
          return false;
        }
        continue;
      }

      const first = (axis.min - axis.start) / axis.delta;
      const second = (axis.max - axis.start) / axis.delta;
      minimum = Math.max(minimum, Math.min(first, second));
      maximum = Math.min(maximum, Math.max(first, second));
      if (minimum > maximum) {
        return false;
      }
    }

    return maximum >= 0 && minimum <= 1;
  }

  private getPathPoint(x: number, y: number) {
    const worldInset = BLOCK_SIZE + MONSTER_SIZE / 2;
    const point = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(x, worldInset, WORLD_WIDTH - worldInset),
      Phaser.Math.Clamp(y, worldInset, WORLD_HEIGHT - worldInset),
    );

    for (let pass = 0; pass < this.navigationRects.length; pass += 1) {
      let adjusted = false;
      for (const rect of this.navigationRects) {
        if (!this.pointInsideRect(point.x, point.y, rect)) {
          continue;
        }

        const candidates = [
          { x: rect.left - 1, y: point.y, distance: point.x - rect.left },
          { x: rect.right + 1, y: point.y, distance: rect.right - point.x },
          { x: point.x, y: rect.top - 1, distance: point.y - rect.top },
          { x: point.x, y: rect.bottom + 1, distance: rect.bottom - point.y },
        ]
          .map((candidate) => ({
            ...candidate,
            x: Phaser.Math.Clamp(candidate.x, worldInset, WORLD_WIDTH - worldInset),
            y: Phaser.Math.Clamp(candidate.y, worldInset, WORLD_HEIGHT - worldInset),
          }))
          .filter(
            (candidate) =>
              !this.navigationRects.some((other) =>
                this.pointInsideRect(candidate.x, candidate.y, other),
              ),
          )
          .sort((first, second) => first.distance - second.distance);

        if (candidates.length === 0) {
          continue;
        }
        point.set(candidates[0].x, candidates[0].y);
        adjusted = true;
      }

      if (!adjusted) {
        break;
      }
    }

    return point;
  }

  private updateNavigationPaths() {
    this.navigationGoal.copy(this.getPathPoint(this.monsterTarget.x, this.monsterTarget.y));
    const nodeCount = this.navigationNodes.length;
    this.navigationDistances = Array(nodeCount).fill(Number.POSITIVE_INFINITY);
    const visited = Array(nodeCount).fill(false);

    for (let index = 0; index < nodeCount; index += 1) {
      const node = this.navigationNodes[index];
      if (this.pathIsClear(node.x, node.y, this.navigationGoal.x, this.navigationGoal.y)) {
        this.navigationDistances[index] = Phaser.Math.Distance.Between(
          node.x,
          node.y,
          this.navigationGoal.x,
          this.navigationGoal.y,
        );
      }
    }

    for (let step = 0; step < nodeCount; step += 1) {
      let closest = -1;
      for (let index = 0; index < nodeCount; index += 1) {
        if (
          !visited[index]
          && (closest === -1 || this.navigationDistances[index] < this.navigationDistances[closest])
        ) {
          closest = index;
        }
      }

      if (closest === -1 || !Number.isFinite(this.navigationDistances[closest])) {
        break;
      }
      visited[closest] = true;

      for (const edge of this.navigationNodes[closest].edges) {
        const distance = this.navigationDistances[closest] + edge.distance;
        if (distance < this.navigationDistances[edge.index]) {
          this.navigationDistances[edge.index] = distance;
        }
      }
    }

    for (const child of this.monsters.getChildren()) {
      if (child instanceof Phaser.Physics.Arcade.Sprite && child.active) {
        this.updateMonsterWaypoint(child);
      }
    }
  }

  private updateMonsterWaypoint(monster: Phaser.Physics.Arcade.Sprite) {
    const waypoint = this.getMonsterWaypoint(monster);
    monster.setData('waypointX', waypoint.x);
    monster.setData('waypointY', waypoint.y);
  }

  private getMonsterWaypoint(monster: Phaser.Physics.Arcade.Sprite) {
    const start = this.getPathPoint(monster.x, monster.y);
    if (this.pathIsClear(start.x, start.y, this.navigationGoal.x, this.navigationGoal.y)) {
      return this.navigationGoal;
    }

    let shortestDistance = Number.POSITIVE_INFINITY;
    let waypoint: Phaser.Math.Vector2 | undefined;
    for (let index = 0; index < this.navigationNodes.length; index += 1) {
      const node = this.navigationNodes[index];
      if (
        !Number.isFinite(this.navigationDistances[index])
        || !this.pathIsClear(start.x, start.y, node.x, node.y)
      ) {
        continue;
      }

      const distance =
        Phaser.Math.Distance.Between(start.x, start.y, node.x, node.y)
        + this.navigationDistances[index];
      if (distance < shortestDistance) {
        shortestDistance = distance;
        waypoint = new Phaser.Math.Vector2(node.x, node.y);
      }
    }

    return waypoint ?? this.navigationGoal;
  }

  private onPlayerContact(
    _playerObject: Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
    monsterObject: Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
  ) {
    if (
      !(monsterObject instanceof Phaser.Physics.Arcade.Sprite)
      || !monsterObject.active
      || monsterObject.getData('dead')
      || !monsterObject.getData('canAttack')
      || this.monsterAttackCooldownActive
      || this.isGameOver
    ) {
      return;
    }

    this.monsterAttackCooldownActive = true;
    this.playerHealth = Math.max(0, this.playerHealth - MONSTER_ATTACK_DAMAGE);
    this.updatePlayerHealthHud();
    this.player.setFillStyle(PLAYER_HIT_COLOR);
    this.time.delayedCall(PLAYER_HIT_FLASH_DURATION, () => {
      this.player.setFillStyle(PLAYER_COLOR);
    });

    for (const child of this.monsters.getChildren()) {
      if (child instanceof Phaser.Physics.Arcade.Sprite) {
        child.setData('canAttack', false);
      }
    }

    this.time.delayedCall(MONSTER_ATTACK_COOLDOWN, () => {
      this.monsterAttackCooldownActive = false;
      for (const child of this.monsters.getChildren()) {
        if (child instanceof Phaser.Physics.Arcade.Sprite) {
          child.setData('canAttack', true);
        }
      }
    });

    if (this.playerHealth === 0) {
      this.showGameOver();
    }
  }

  private fireProjectile() {
    if (this.isGameOver) {
      return;
    }

    const target = this.getNearestRadarMonster();
    if (!target) {
      return;
    }

    const projectile = this.add.circle(
      this.player.x,
      this.player.y,
      PROJECTILE_RADIUS,
      0xffed70,
    );
    projectile.setDepth(4);
    this.physics.add.existing(projectile);
    const body = projectile.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PROJECTILE_RADIUS);
    const direction = new Phaser.Math.Vector2(
      target.x - this.player.x,
      target.y - this.player.y,
    ).normalize();
    body.setVelocity(direction.x * PROJECTILE_SPEED, direction.y * PROJECTILE_SPEED);
    projectile.setData('damage', PROJECTILE_DAMAGE);
    projectile.setData('target', target);
    this.projectiles.add(projectile);

    this.time.delayedCall(PROJECTILE_LIFETIME, () => {
      if (projectile.active) {
        projectile.destroy();
      }
    });
  }

  private onProjectileHit(
    projectileObject: Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
    monsterObject: Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
  ) {
    if (
      !(projectileObject instanceof Phaser.GameObjects.Arc)
      || !(monsterObject instanceof Phaser.Physics.Arcade.Sprite)
      || !projectileObject.active
      || !monsterObject.active
      || monsterObject.getData('dead')
    ) {
      return;
    }

    projectileObject.destroy();
    monsterObject.setData('dead', true);
    this.gainExperience(1);
    monsterObject.setData('canAttack', false);
    const body = monsterObject.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
    this.tweens.add({
      targets: monsterObject,
      alpha: 0,
      duration: MONSTER_DEATH_FADE_DURATION,
      onComplete: () => monsterObject.destroy(),
    });
  }

  private getNearestRadarMonster() {
    let closestMonster: Phaser.Physics.Arcade.Sprite | undefined;
    let closestDistance = this.radarRadius * this.radarRadius;
    for (const child of this.monsters.getChildren()) {
      if (
        !(child instanceof Phaser.Physics.Arcade.Sprite)
        || !child.active
        || child.getData('dead')
      ) {
        continue;
      }

      const distance = Phaser.Math.Distance.Squared(
        this.player.x,
        this.player.y,
        child.x,
        child.y,
      );
      if (distance <= closestDistance) {
        closestMonster = child;
        closestDistance = distance;
      }
    }
    return closestMonster;
  }

  update() {
    if (this.isGameOver) {
      return;
    }

    const horizontal = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const direction = new Phaser.Math.Vector2(horizontal, vertical);

    if (direction.lengthSq() === 0) {
      this.playerBody.setVelocity(0, 0);
    } else {
      direction.normalize();
      this.playerBody.setVelocity(
        direction.x * PLAYER_SPEED * this.movementSpeedMultiplier,
        direction.y * PLAYER_SPEED * this.movementSpeedMultiplier,
      );
    }

    this.updateMonsterMovement();
    this.updateProjectileHoming();
    this.updateRadar();
  }

  private updateProjectileHoming() {
    for (const child of this.projectiles.getChildren()) {
      if (!(child instanceof Phaser.GameObjects.Arc) || !child.active) {
        continue;
      }

      const target: unknown = child.getData('target');
      if (
        !(target instanceof Phaser.Physics.Arcade.Sprite)
        || !target.active
        || target.getData('dead')
      ) {
        child.destroy();
        continue;
      }

      const direction = new Phaser.Math.Vector2(target.x - child.x, target.y - child.y);
      if (direction.lengthSq() > 0) {
        direction.normalize();
        const body = child.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(direction.x * PROJECTILE_SPEED, direction.y * PROJECTILE_SPEED);
      }
    }
  }

  private updateMonsterMovement() {
    for (const child of this.monsters.getChildren()) {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) {
        continue;
      }

      const waypointX: unknown = child.getData('waypointX');
      const waypointY: unknown = child.getData('waypointY');
      const targetX = typeof waypointX === 'number' ? waypointX : this.navigationGoal.x;
      const targetY = typeof waypointY === 'number' ? waypointY : this.navigationGoal.y;
      const direction = new Phaser.Math.Vector2(targetX - child.x, targetY - child.y);
      if (direction.lengthSq() < 1) {
        child.setVelocity(0, 0);
        continue;
      }

      direction.normalize();
      child.setVelocity(
        direction.x * MONSTER_SPEED,
        direction.y * MONSTER_SPEED,
      );
    }
  }

  private updateRadar() {
    this.radarGraphics.clear();
    this.radarGraphics.lineStyle(1, 0xffff00, 0.25);
    this.radarGraphics.strokeCircle(this.player.x, this.player.y, this.radarRadius);

    const closestMonster = this.getNearestRadarMonster();
    if (closestMonster) {
      this.radarGraphics.lineStyle(2, 0xff2222, 1);
      this.radarGraphics.strokeCircle(closestMonster.x, closestMonster.y, 12);
      this.radarGraphics.strokeCircle(closestMonster.x, closestMonster.y, 18);
    }
  }
}

class UpgradeScene extends Phaser.Scene {
  private choosing = false;

  constructor() {
    super('upgrade');
  }

  create(choices: UpgradeChoice[]) {
    this.choosing = false;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setOrigin(0)
      .setScrollFactor(0);
    this.add.text(GAME_WIDTH / 2, 128, 'LEVEL UP', {
      color: '#ffffff',
      fontFamily: 'sans-serif',
      fontSize: '42px',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(GAME_WIDTH / 2, 176, 'Choose an upgrade', {
      color: '#cbd5e1',
      fontFamily: 'sans-serif',
      fontSize: '20px',
    }).setOrigin(0.5).setScrollFactor(0);

    const cardWidth = 340;
    const cardHeight = 300;
    const cardY = GAME_HEIGHT / 2 + 25;
    const cardCenters = [210, GAME_WIDTH / 2, GAME_WIDTH - 210];
    for (const [index, choice] of choices.entries()) {
      const advanced = choice.rarity === 'advanced';
      const titleColor = advanced ? '#ffd166' : '#8bd3ff';
      const descriptions: Record<UpgradeKind, [string, string]> = {
        attackSpeed: [
          'Attack Speed',
          `Projectile firing rate +${advanced ? 10 : 5}%`,
        ],
        movementSpeed: [
          'Movement Speed',
          `Movement speed +${advanced ? 8 : 3}%`,
        ],
        heal: [
          'Recover Health',
          advanced ? 'Restore all health' : 'Restore 20 health',
        ],
        radar: [
          'Radar Range',
          `Radar range +${advanced ? 10 : 5}%`,
        ],
      };
      const [title, description] = descriptions[choice.kind];
      const card = this.add.rectangle(
        cardCenters[index],
        cardY,
        cardWidth,
        cardHeight,
        0x1e293b,
        0.98,
      );
      card.setStrokeStyle(3, advanced ? 0xf4b942 : 0x38a9ff);
      card.setScrollFactor(0);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x293b52, 1));
      card.on('pointerout', () => card.setFillStyle(0x1e293b, 0.98));
      card.on('pointerdown', () => this.chooseUpgrade(choice));

      this.add.text(cardCenters[index], cardY - 86, advanced ? 'ADVANCED' : 'COMMON', {
        color: titleColor,
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0);
      this.add.text(cardCenters[index], cardY - 28, title, {
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardWidth - 40 },
      }).setOrigin(0.5).setScrollFactor(0);
      this.add.text(cardCenters[index], cardY + 48, description, {
        color: '#cbd5e1',
        fontFamily: 'sans-serif',
        fontSize: '18px',
        align: 'center',
        wordWrap: { width: cardWidth - 48 },
      }).setOrigin(0.5).setScrollFactor(0);
    }
  }

  private chooseUpgrade(choice: UpgradeChoice) {
    if (this.choosing) {
      return;
    }
    this.choosing = true;

    const gameScene = this.scene.get('game');
    if (!(gameScene instanceof GameScene)) {
      throw new Error('Unable to find the active game scene for the upgrade.');
    }
    gameScene.applyUpgrade(choice);
    this.scene.stop();
    this.scene.resume('game');
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#111827',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [GameScene, UpgradeScene],
};

new Phaser.Game(config);
