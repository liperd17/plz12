import Phaser from 'phaser';
import { CHARACTERS, getCharacterEffectiveRange, type CharacterId } from './characters.ts';
import {
  getMonsterIdForSpawnRoll,
  getSelfDestructWarningState,
  isMonsterId,
  isWithinSelfDestructRadius,
  MONSTER_IDS,
  MONSTERS,
  resolveSelfDestruct,
  SELF_DESTRUCT_RADIUS,
} from './monsters.ts';
import { PLAYER_INVULNERABILITY_DURATION, PlayerDamageState } from './playerDamage.ts';
import {
  applyMaxHealthUpgrade,
  createStatUpgradeLevels,
  getAttackIntervalSeconds,
  getStatMultiplier,
  rollUpgradeChoiceKinds,
  STAT_UPGRADE_IDS,
  STAT_UPGRADES,
  type StatUpgradeId,
} from './upgrades.ts';
import {
  applyDamageToHealth,
  advanceProjectile,
  createProjectileBurst,
  createProjectileShot,
  consumeProjectileOnHit,
  findFirstProjectileHit,
  getWeaponBonusDescription,
  getWeaponDamage,
  getWeaponEffectiveRange,
  getWeaponProjectileCount,
  isWithinAttackLine,
  willUnlockWeaponBonusAtNextLevel,
  WEAPON_IDS,
  WEAPONS,
  type WeaponId,
} from './weapons.ts';
import './style.css';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const GRID_SPACING = 100;
const PLAYER_SIZE = 48;
const BLOCK_SIZE = PLAYER_SIZE * 4;
const MAX_MONSTER_SIZE = Math.max(...Object.values(MONSTERS).map(({ size }) => size));
const MONSTER_START_COUNT = 3;
const MONSTER_MAX_COUNT = 30;
const MONSTER_SPAWN_INTERVAL = 5000;
const MONSTER_TARGET_INTERVAL = 250;
const MONSTER_PATH_UPDATE_INTERVAL = 500;
const MONSTER_PLAYER_CLEARANCE = 500;
const MONSTER_ATTACK_DAMAGE = 5;
const MONSTER_DEATH_FADE_DURATION = 300;
const PLAYER_HIT_COLOR = 0xff0000;
const RED_PLAYER_HIT_COLOR = 0xff9aaa;
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
const PROJECTILE_RADIUS = 5;
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

type WeaponUpgradeChoice = {
  kind: 'weapon';
  weaponId: WeaponId;
  currentLevel: number;
  currentDamage: number;
  upgradedDamage: number;
  currentRange: number;
  upgradedRange: number;
  currentProjectileCount: number;
  upgradedProjectileCount: number;
  attackIntervalSeconds: number;
  unlocksBonus: boolean;
};

type StatUpgradeChoice = {
  kind: 'stat';
  statId: StatUpgradeId;
  currentLevel: number;
  currentMultiplier: number;
  upgradedMultiplier: number;
};

type UpgradeChoice = WeaponUpgradeChoice | StatUpgradeChoice;

type StoredWeaponId = WeaponId | typeof TEMPORARY_WEAPON_ID;

function addMenuButton(
  scene: Phaser.Scene,
  label: string,
  x: number,
  y: number,
  onClick: () => void,
) {
  const background = scene.add.rectangle(x, y, 260, 56, 0x2563eb)
    .setStrokeStyle(2, 0x93c5fd)
    .setInteractive({ useHandCursor: true });
  const text = scene.add.text(x, y, label, {
    color: '#ffffff',
    fontFamily: 'sans-serif',
    fontSize: '22px',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  background.on('pointerover', () => background.setFillStyle(0x3b82f6));
  background.on('pointerout', () => background.setFillStyle(0x2563eb));
  background.on('pointerdown', onClick);
  text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
}

class TitleScene extends Phaser.Scene {
  private startKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('title');
  }

  create() {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x111827).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 240, 'SURVIVOR', {
      color: '#4ade80',
      fontFamily: 'sans-serif',
      fontSize: '64px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 310, '끝없이 몰려오는 적을 물리치세요', {
      color: '#cbd5e1',
      fontFamily: 'sans-serif',
      fontSize: '22px',
    }).setOrigin(0.5);
    addMenuButton(this, '게임 시작', GAME_WIDTH / 2, 420, () => {
      this.scene.start('character-select');
    });
    this.add.text(GAME_WIDTH / 2, 500, 'WASD 이동 · 자동 공격', {
      color: '#94a3b8',
      fontFamily: 'sans-serif',
      fontSize: '18px',
    }).setOrigin(0.5);

    this.startKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
      this.scene.start('character-select');
    }
  }
}

class CharacterSelectScene extends Phaser.Scene {
  private startKey!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;
  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private characterCards!: Record<CharacterId, Phaser.GameObjects.Rectangle>;
  private selectedCharacterId: CharacterId = 'green';

  constructor() {
    super('character-select');
  }

  create() {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.selectedCharacterId = 'green';
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x111827).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 115, '캐릭터 선택', {
      color: '#ffffff',
      fontFamily: 'sans-serif',
      fontSize: '42px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 170, '플레이할 캐릭터를 선택하세요', {
      color: '#cbd5e1',
      fontFamily: 'sans-serif',
      fontSize: '20px',
    }).setOrigin(0.5);

    const cardCenters: Record<CharacterId, number> = {
      green: 430,
      red: 850,
    };
    this.characterCards = {
      green: this.createCharacterCard('green', cardCenters.green),
      red: this.createCharacterCard('red', cardCenters.red),
    };
    addMenuButton(this, '선택하고 시작', GAME_WIDTH / 2, 555, () => {
      this.startGame();
    });
    addMenuButton(this, '뒤로', 110, 60, () => {
      this.scene.start('title');
    });

    this.startKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.leftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
      this.startGame();
    }
    if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
      this.scene.start('title');
    }
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.setSelected('green');
    }
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      this.setSelected('red');
    }
  }

  private createCharacterCard(characterId: CharacterId, x: number) {
    const definition = CHARACTERS[characterId];
    const card = this.add.rectangle(x, 360, 360, 280, 0x1e293b)
      .setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => this.setSelected(characterId));
    this.add.rectangle(x, 290, 56, 56, definition.color);
    this.add.text(x, 345, definition.name, {
      color: '#ffffff',
      fontFamily: 'sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const description = characterId === 'green'
      ? '균형 잡힌 기본 캐릭터\n이동 속도: 기본 · 공격 사거리: 기본'
      : '빠르게 움직이는 대신 사거리가 짧음\n이동 속도: +30% · 공격 사거리: 50%';
    this.add.text(x, 410, description, {
      color: '#cbd5e1',
      fontFamily: 'sans-serif',
      fontSize: '17px',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);
    this.add.text(x, 480, 'WASD 이동 · 기본 공격 자동', {
      color: '#94a3b8',
      fontFamily: 'sans-serif',
      fontSize: '15px',
    }).setOrigin(0.5);
    this.updateCharacterCardStroke(characterId, card);
    return card;
  }

  private setSelected(characterId: CharacterId) {
    this.selectedCharacterId = characterId;
    for (const [id, card] of Object.entries(this.characterCards) as [CharacterId, Phaser.GameObjects.Rectangle][]) {
      this.updateCharacterCardStroke(id, card);
    }
  }

  private updateCharacterCardStroke(characterId: CharacterId, card: Phaser.GameObjects.Rectangle) {
    card.setStrokeStyle(
      3,
      characterId === this.selectedCharacterId ? CHARACTERS[characterId].color : 0x475569,
    );
  }

  private startGame() {
    this.scene.start('game', { characterId: this.selectedCharacterId });
  }
}

class GameScene extends Phaser.Scene {
  private characterId: CharacterId = 'green';
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private weaponPickup!: Phaser.GameObjects.Rectangle;
  private weaponPickupLabel!: Phaser.GameObjects.Text;
  private monsters!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.GameObjects.Group;
  private radarGraphics!: Phaser.GameObjects.Graphics;
  private selfDestructWarningGraphics!: Phaser.GameObjects.Graphics;
  private playerHealth = PLAYER_MAX_HEALTH;
  private playerMaxHealth = PLAYER_MAX_HEALTH;
  private playerHealthFill!: Phaser.GameObjects.Rectangle;
  private playerHealthText!: Phaser.GameObjects.Text;
  private experience = 0;
  private experienceToNextLevel = PLAYER_START_XP_REQUIREMENT;
  private playerLevel = PLAYER_START_LEVEL;
  private experienceFill!: Phaser.GameObjects.Rectangle;
  private experienceText!: Phaser.GameObjects.Text;
  private storedWeapons: StoredWeaponId[] = [];
  private weaponStorageText!: Phaser.GameObjects.Text;
  private weaponTimers = new Map<WeaponId, Phaser.Time.TimerEvent>();
  private monsterSpawnTimer!: Phaser.Time.TimerEvent;
  private weaponLevels: Record<WeaponId, number> = {
    basicAttack: 1,
    rapidAttackA: 0,
    slashAttack: 0,
  };
  private statUpgradeLevels = createStatUpgradeLevels();
  private radarRadius = RADAR_RADIUS;
  private gameOverOverlay!: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text>;
  private obstaclePlacements: ObstaclePlacement[] = [];
  private navigationRects: Phaser.Geom.Rectangle[] = [];
  private navigationNodes: NavigationNode[] = [];
  private monsterTarget = new Phaser.Math.Vector2();
  private navigationGoal = new Phaser.Math.Vector2();
  private navigationDistances: number[] = [];
  private playerDamage = new PlayerDamageState();
  private isGameOver = false;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  create(data?: { characterId?: CharacterId }) {
    this.characterId = data?.characterId === 'red' ? 'red' : 'green';
    this.playerHealth = PLAYER_MAX_HEALTH;
    this.playerMaxHealth = PLAYER_MAX_HEALTH;
    this.experience = 0;
    this.experienceToNextLevel = PLAYER_START_XP_REQUIREMENT;
    this.playerLevel = PLAYER_START_LEVEL;
    this.storedWeapons = [];
    this.weaponTimers.clear();
    this.weaponLevels = {
      basicAttack: 1,
      rapidAttackA: 0,
      slashAttack: 0,
    };
    this.statUpgradeLevels = createStatUpgradeLevels();
    this.radarRadius = RADAR_RADIUS;
    this.playerDamage.reset();
    this.isGameOver = false;
    this.obstaclePlacements = [];
    this.navigationRects = [];
    this.navigationNodes = [];
    this.navigationDistances = [];

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

    this.createMonsterTextures();

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
      CHARACTERS[this.characterId].color,
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

    this.projectiles = this.add.group();
    this.startWeaponTimer('basicAttack');

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
    this.selfDestructWarningGraphics = this.add.graphics().setDepth(3);
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
      PLAYER_HEALTH_BAR_WIDTH * (this.playerHealth / this.playerMaxHealth),
      PLAYER_HEALTH_BAR_HEIGHT,
    );
    this.playerHealthText.setText(`HP ${this.playerHealth} / ${this.playerMaxHealth}`);
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
      ? this.storedWeapons.map((weaponId) =>
        weaponId === TEMPORARY_WEAPON_ID
          ? '임시 무기 A'
          : `${WEAPONS[weaponId].name} Lv.${this.weaponLevels[weaponId]}`,
      ).join('\n')
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
    const availableWeapons = WEAPON_IDS.filter(
      (weaponId) =>
        this.weaponLevels[weaponId] > 0
        || this.storedWeapons.length < WEAPON_STORAGE_CAPACITY,
    );
    const weaponPool = Phaser.Utils.Array.Shuffle([...availableWeapons]);
    const statPool = Phaser.Utils.Array.Shuffle([...STAT_UPGRADE_IDS]);
    const choiceKinds = rollUpgradeChoiceKinds(
      Array.from({ length: 3 }, () => Phaser.Math.RND.frac()),
    );
    const damageMultiplier = getStatMultiplier(this.statUpgradeLevels.damage);
    const choices = choiceKinds.map((kind): UpgradeChoice => {
      if (kind === 'weapon') {
        const weaponId = weaponPool.shift();
        if (weaponId === undefined) {
          throw new Error('Unable to create a weapon upgrade choice from the available pool.');
        }
        const currentLevel = this.weaponLevels[weaponId];
        return {
          kind: 'weapon',
          weaponId,
          currentLevel,
          currentDamage:
            getWeaponDamage(weaponId, Math.max(0, currentLevel - 1)) * damageMultiplier,
          upgradedDamage: getWeaponDamage(weaponId, currentLevel) * damageMultiplier,
          currentRange: this.getCharacterWeaponRange(weaponId, currentLevel),
          upgradedRange: this.getCharacterWeaponRange(weaponId, currentLevel + 1),
          currentProjectileCount: getWeaponProjectileCount(weaponId, currentLevel),
          upgradedProjectileCount: getWeaponProjectileCount(weaponId, currentLevel + 1),
          attackIntervalSeconds: this.getWeaponAttackIntervalMs(weaponId) / 1000,
          unlocksBonus: willUnlockWeaponBonusAtNextLevel(weaponId, currentLevel),
        };
      }

      const statId = statPool.shift();
      if (statId === undefined) {
        throw new Error('Unable to create a stat upgrade choice from the available pool.');
      }
      const currentLevel = this.statUpgradeLevels[statId];
      return {
        kind: 'stat',
        statId,
        currentLevel,
        currentMultiplier: getStatMultiplier(currentLevel),
        upgradedMultiplier: getStatMultiplier(currentLevel + 1),
      };
    });
    this.scene.launch('upgrade', choices);
    this.scene.pause();
  }

  applyUpgrade(choice: UpgradeChoice) {
    if (choice.kind === 'stat') {
      this.applyStatUpgrade(choice.statId);
      return;
    }

    const currentLevel = this.weaponLevels[choice.weaponId];
    if (
      currentLevel === 0
      && this.storedWeapons.length >= WEAPON_STORAGE_CAPACITY
    ) {
      throw new Error('Unable to acquire a weapon because the weapon storage is full.');
    }

    if (currentLevel === 0) {
      this.storedWeapons.push(choice.weaponId);
      this.startWeaponTimer(choice.weaponId);
    }
    this.weaponLevels[choice.weaponId] += 1;
    this.updateWeaponStorageHud();
  }

  private applyStatUpgrade(statId: StatUpgradeId) {
    const currentLevel = this.statUpgradeLevels[statId];
    this.statUpgradeLevels[statId] = currentLevel + 1;

    if (statId === 'maxHealth') {
      const upgradedHealth = applyMaxHealthUpgrade(
        this.playerHealth,
        PLAYER_MAX_HEALTH,
        currentLevel,
      );
      this.playerHealth = upgradedHealth.currentHealth;
      this.playerMaxHealth = upgradedHealth.maxHealth;
      this.updatePlayerHealthHud();
    }
    if (statId === 'attackSpeed') {
      this.refreshWeaponTimers();
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
      this.scene.restart({ characterId: this.characterId });
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

  private createMonsterTextures() {
    for (const monsterId of MONSTER_IDS) {
      const definition = MONSTERS[monsterId];
      if (this.textures.exists(definition.texture)) {
        continue;
      }

      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(definition.color, 1);
      graphics.fillTriangle(16, 3, 1, 14, 8, 27);
      graphics.fillTriangle(16, 3, 31, 14, 24, 27);
      graphics.fillTriangle(16, 7, 10, 30, 22, 30);
      graphics.generateTexture(definition.texture, 32, 32);
      graphics.destroy();
    }
  }

  private spawnMonster() {
    if (this.monsters.countActive(true) >= MONSTER_MAX_COUNT) {
      return false;
    }

    const monsterId = getMonsterIdForSpawnRoll(Phaser.Math.Between(1, 10));
    const definition = MONSTERS[monsterId];
    const halfSize = definition.size / 2;
    const minimumPosition = BLOCK_SIZE + halfSize;
    const maximumX = WORLD_WIDTH - minimumPosition;
    const maximumY = WORLD_HEIGHT - minimumPosition;

    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const x = Phaser.Math.FloatBetween(minimumPosition, maximumX);
      const y = Phaser.Math.FloatBetween(minimumPosition, maximumY);
      if (
        Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y)
          < Math.max(MONSTER_PLAYER_CLEARANCE, (definition.size + PLAYER_SIZE) / 2)
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

        const otherSize = this.getMonsterSize(child);
        return Math.abs(x - child.x) < (definition.size + otherSize) / 2
          && Math.abs(y - child.y) < (definition.size + otherSize) / 2;
      });
      if (overlapsMonster) {
        continue;
      }

      const monster = this.physics.add.sprite(x, y, definition.texture);
      monster.setDisplaySize(definition.size, definition.size);
      monster.setDepth(2);
      monster.setData('monsterId', monsterId);
      monster.setData('health', definition.health);
      monster.setCollideWorldBounds(true);
      this.monsters.add(monster);
      this.updateMonsterWaypoint(monster);
      return true;
    }

    return false;
  }

  private createNavigationGraph() {
    const clearance = MAX_MONSTER_SIZE / 2 + 1;
    this.navigationRects = this.obstaclePlacements.map(
      ({ x, y, width, height }) =>
        new Phaser.Geom.Rectangle(
          x - width / 2 - clearance,
          y - height / 2 - clearance,
          width + clearance * 2,
          height + clearance * 2,
        ),
    );

    const worldInset = BLOCK_SIZE + MAX_MONSTER_SIZE / 2;
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
    const worldInset = BLOCK_SIZE + MAX_MONSTER_SIZE / 2;
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
      || this.isGameOver
    ) {
      return;
    }

    this.damagePlayer(MONSTER_ATTACK_DAMAGE);
  }

  private damagePlayer(damage: number) {
    const updatedHealth = this.playerDamage.tryApplyDamage(
      this.playerHealth,
      damage,
      this.time.now,
    );
    if (updatedHealth === undefined) {
      return;
    }

    this.playerHealth = updatedHealth;
    this.updatePlayerHealthHud();
    this.player.setFillStyle(
      this.characterId === 'red' ? RED_PLAYER_HIT_COLOR : PLAYER_HIT_COLOR,
    );
    this.time.delayedCall(PLAYER_INVULNERABILITY_DURATION, () => {
      this.player.setFillStyle(CHARACTERS[this.characterId].color);
    });

    if (this.playerHealth === 0) {
      this.showGameOver();
    }
  }

  private startWeaponTimer(weaponId: WeaponId) {
    if (this.weaponTimers.has(weaponId)) {
      return;
    }

    this.weaponTimers.set(weaponId, this.time.addEvent({
      delay: this.getWeaponAttackIntervalMs(weaponId),
      loop: true,
      callback: () => this.fireWeapon(weaponId),
    }));
  }

  private refreshWeaponTimers() {
    for (const [weaponId, timer] of this.weaponTimers) {
      timer.reset({
        delay: this.getWeaponAttackIntervalMs(weaponId),
        loop: true,
        callback: () => this.fireWeapon(weaponId),
      });
    }
  }

  private getWeaponAttackIntervalMs(weaponId: WeaponId) {
    return getAttackIntervalSeconds(
      WEAPONS[weaponId].attackIntervalSeconds,
      this.statUpgradeLevels.attackSpeed,
    ) * 1000;
  }

  private fireWeapon(weaponId: WeaponId) {
    if (this.isGameOver) {
      return;
    }

    const weapon = WEAPONS[weaponId];
    const target = this.getNearestMonsterInRange(
      Math.min(
        this.getCharacterWeaponRange(weaponId, this.weaponLevels[weaponId]),
        this.radarRadius,
      ),
    );
    if (!target) {
      return;
    }

    if (weapon.attackMode === 'line') {
      this.fireLineAttack(weaponId, target);
      return;
    }

    const weaponLevel = this.weaponLevels[weaponId];
    const burst = createProjectileBurst(weaponId, weaponLevel);
    for (const shot of burst) {
      const launchProjectile = () => {
        if (this.isGameOver) {
          return;
        }

        const launchTarget = this.getNearestMonsterInRange(
          Math.min(this.getCharacterWeaponRange(weaponId, weaponLevel), this.radarRadius),
        );
        if (!launchTarget) {
          return;
        }
        const projectileShot = createProjectileShot(
          weaponId,
          this.player.x,
          this.player.y,
          launchTarget.x,
          launchTarget.y,
          weaponLevel,
          CHARACTERS[this.characterId].effectiveRangeMultiplier
            * getStatMultiplier(this.statUpgradeLevels.range),
          getStatMultiplier(this.statUpgradeLevels.damage),
        );
        if (!projectileShot) {
          return;
        }

        const projectile = this.add.circle(
          this.player.x,
          this.player.y,
          PROJECTILE_RADIUS,
          projectileShot.hasPiercingAttribute ? 0x8bd3ff : 0xffed70,
        );
        projectile.setDepth(4);
        projectile.setData('velocityX', projectileShot.velocityX);
        projectile.setData('velocityY', projectileShot.velocityY);
        projectile.setData('damage', projectileShot.damage);
        projectile.setData('remainingRange', projectileShot.range);
        this.projectiles.add(projectile);

      };

      if (shot.delayMs === 0) {
        launchProjectile();
      } else {
        this.time.delayedCall(shot.delayMs, launchProjectile);
      }
    }
  }

  private fireLineAttack(
    weaponId: WeaponId,
    target: Phaser.Physics.Arcade.Sprite,
  ) {
    const weapon = WEAPONS[weaponId];
    const direction = new Phaser.Math.Vector2(
      target.x - this.player.x,
      target.y - this.player.y,
    ).normalize();
    const range = this.getCharacterWeaponRange(weaponId, this.weaponLevels[weaponId]);
    const endX = this.player.x + direction.x * range;
    const endY = this.player.y + direction.y * range;
    const slashEffect = this.add.graphics().setDepth(4);
    slashEffect.lineStyle(4, 0xdbeafe, 0.9);
    slashEffect.lineBetween(this.player.x, this.player.y, endX, endY);
    this.time.delayedCall(120, () => slashEffect.destroy());

    const damage = getWeaponDamage(weaponId, this.weaponLevels[weaponId] - 1)
      * getStatMultiplier(this.statUpgradeLevels.damage);
    for (const child of this.monsters.getChildren()) {
      if (
        !(child instanceof Phaser.Physics.Arcade.Sprite)
        || !child.active
        || child.getData('dead')
        || !isWithinAttackLine(
          this.player.x,
          this.player.y,
          endX,
          endY,
          child.x,
          child.y,
          weapon.attackWidthPx,
        )
      ) {
        continue;
      }

      this.damageMonster(child, damage);
    }
  }

  private updateProjectileMovement(delta: number) {
    for (const child of this.projectiles.getChildren()) {
      if (!(child instanceof Phaser.GameObjects.Arc) || !child.active) {
        continue;
      }

      const velocityX: unknown = child.getData('velocityX');
      const velocityY: unknown = child.getData('velocityY');
      const remainingRange: unknown = child.getData('remainingRange');
      const damage: unknown = child.getData('damage');
      if (
        typeof velocityX !== 'number'
        || typeof velocityY !== 'number'
        || typeof remainingRange !== 'number'
        || !Number.isFinite(velocityX)
        || !Number.isFinite(velocityY)
        || !Number.isFinite(remainingRange)
        || remainingRange < 0
        || typeof damage !== 'number'
        || !Number.isFinite(damage)
        || damage <= 0
      ) {
        throw new Error('Projectile is missing valid movement or damage data.');
      }

      const step = advanceProjectile(
        child.x,
        child.y,
        velocityX,
        velocityY,
        delta,
        remainingRange,
      );
      const liveMonsters = this.monsters.getChildren().filter(
        (monster): monster is Phaser.Physics.Arcade.Sprite =>
          monster instanceof Phaser.Physics.Arcade.Sprite
          && monster.active
          && !monster.getData('dead'),
      );
      const targets = liveMonsters.map((monster) => ({
        x: monster.x,
        y: monster.y,
        width: this.getMonsterSize(monster),
        height: this.getMonsterSize(monster),
      }));
      const hitIndex = findFirstProjectileHit(
        step.startX,
        step.startY,
        step.endX,
        step.endY,
        targets,
        PROJECTILE_RADIUS,
      );
      if (hitIndex !== undefined) {
        if (!consumeProjectileOnHit(child)) {
          continue;
        }
        child.destroy();
        this.damageMonster(liveMonsters[hitIndex], damage);
        continue;
      }

      child.setPosition(step.endX, step.endY);
      child.setData('remainingRange', step.remainingRange);
      if (step.expired) {
        child.destroy();
      }
    }
  }

  private damageMonster(monster: Phaser.Physics.Arcade.Sprite, damage: number) {
    const health: unknown = monster.getData('health');
    if (typeof health !== 'number' || !Number.isFinite(health)) {
      throw new Error('Monster is missing a valid health value.');
    }

    const remainingHealth = applyDamageToHealth(health, damage);
    monster.setData('health', remainingHealth);
    if (remainingHealth > 0) {
      return;
    }

    monster.setData('dead', true);
    this.gainExperience(1);
    const body = monster.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;
    this.tweens.add({
      targets: monster,
      alpha: 0,
      duration: MONSTER_DEATH_FADE_DURATION,
      onComplete: () => monster.destroy(),
    });
  }

  private getMonsterSize(monster: Phaser.Physics.Arcade.Sprite) {
    const monsterId: unknown = monster.getData('monsterId');
    if (!isMonsterId(monsterId)) {
      throw new Error('Monster is missing a valid type.');
    }
    return MONSTERS[monsterId].size;
  }

  private getNearestRadarMonster() {
    return this.getNearestMonsterInRange(this.radarRadius);
  }

  private getNearestMonsterInRange(range: number) {
    let closestMonster: Phaser.Physics.Arcade.Sprite | undefined;
    let closestDistance = range * range;
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

  update(_time: number, delta: number) {
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
        direction.x
          * PLAYER_SPEED
          * CHARACTERS[this.characterId].movementSpeedMultiplier
          * getStatMultiplier(this.statUpgradeLevels.movementSpeed),
        direction.y
          * PLAYER_SPEED
          * CHARACTERS[this.characterId].movementSpeedMultiplier
          * getStatMultiplier(this.statUpgradeLevels.movementSpeed),
      );
    }

    this.updateSelfDestructMonsters();
    this.updateMonsterMovement();
    this.updateProjectileMovement(delta);
    this.updateRadar();
  }

  private updateMonsterMovement() {
    for (const child of this.monsters.getChildren()) {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) {
        continue;
      }
      if (child.getData('selfDestructStartedAt') !== undefined) {
        child.setVelocity(0, 0);
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
      const monsterId: unknown = child.getData('monsterId');
      if (!isMonsterId(monsterId)) {
        throw new Error('Monster is missing a valid type.');
      }
      const speed = MONSTERS[monsterId].speed;
      child.setVelocity(
        direction.x * speed,
        direction.y * speed,
      );
    }
  }

  private updateSelfDestructMonsters() {
    this.selfDestructWarningGraphics.clear();
    for (const child of [...this.monsters.getChildren()]) {
      if (
        !(child instanceof Phaser.Physics.Arcade.Sprite)
        || !child.active
        || child.getData('dead')
        || child.getData('monsterId') !== 'yellowBat'
      ) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(
        child.x,
        child.y,
        this.player.x,
        this.player.y,
      );
      let startedAt: unknown = child.getData('selfDestructStartedAt');
      if (startedAt === undefined && isWithinSelfDestructRadius(distance)) {
        startedAt = this.time.now;
        child.setData('selfDestructStartedAt', startedAt);
      }
      if (typeof startedAt !== 'number') {
        continue;
      }

      const warningState = getSelfDestructWarningState(this.time.now - startedAt);
      if (warningState === 'detonate') {
        this.detonateMonster(child);
        continue;
      }
      if (warningState === 'warning-on') {
        this.selfDestructWarningGraphics.fillStyle(0xff0000, 0.18);
        this.selfDestructWarningGraphics.fillCircle(child.x, child.y, SELF_DESTRUCT_RADIUS);
        this.selfDestructWarningGraphics.lineStyle(3, 0xff2222, 0.95);
        this.selfDestructWarningGraphics.strokeCircle(child.x, child.y, SELF_DESTRUCT_RADIUS);
      }
    }
  }

  private detonateMonster(monster: Phaser.Physics.Arcade.Sprite) {
    monster.setData('dead', true);
    const body = monster.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.enable = false;

    const distance = Phaser.Math.Distance.Between(
      monster.x,
      monster.y,
      this.player.x,
      this.player.y,
    );
    const result = resolveSelfDestruct(distance);
    if (result.playerDamage > 0) {
      this.damagePlayer(result.playerDamage);
    }
    if (result.experienceReward > 0) {
      this.gainExperience(result.experienceReward);
    }
    monster.destroy();
  }

  private getCharacterWeaponRange(weaponId: WeaponId, weaponLevel: number) {
    return getCharacterEffectiveRange(
      getWeaponEffectiveRange(weaponId, weaponLevel),
      this.characterId,
    ) * getStatMultiplier(this.statUpgradeLevels.range);
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
      let title: string;
      let titleColor: string;
      let status: string;
      let description: string;
      let cardColor: number;
      let cardHoverColor: number;
      let strokeWidth: number;
      let strokeColor: number;

      if (choice.kind === 'weapon') {
        const weapon = WEAPONS[choice.weaponId];
        const isNewWeapon = choice.currentLevel === 0;
        title = weapon.name;
        titleColor = choice.unlocksBonus
          ? '#ffe08a'
          : isNewWeapon
            ? '#8bd3ff'
            : '#ffd166';
        status = choice.unlocksBonus
          ? 'LEVEL 5 BONUS!'
          : isNewWeapon
            ? 'NEW WEAPON'
            : `WEAPON LV ${choice.currentLevel} → ${choice.currentLevel + 1}`;
        description = [
          isNewWeapon
            ? `Damage ${Number(choice.upgradedDamage.toFixed(2))}`
            : `Damage ${Number(choice.currentDamage.toFixed(2))} → ${Number(choice.upgradedDamage.toFixed(2))}`,
          `Interval ${Number(choice.attackIntervalSeconds.toFixed(3))}s`,
          choice.currentRange === choice.upgradedRange
            ? `Range ${Number(choice.upgradedRange.toFixed(2))}px`
            : `Range ${Number(choice.currentRange.toFixed(2))} → ${Number(choice.upgradedRange.toFixed(2))}px`,
          choice.currentProjectileCount === choice.upgradedProjectileCount
            ? `Projectiles ${choice.upgradedProjectileCount}`
            : `Projectiles ${choice.currentProjectileCount} → ${choice.upgradedProjectileCount}`,
          ...(choice.unlocksBonus
            ? [getWeaponBonusDescription(choice.weaponId) ?? 'Level 5 bonus unlocked']
            : []),
        ].join('\n');
        cardColor = choice.unlocksBonus ? 0x3a3320 : 0x1e293b;
        cardHoverColor = choice.unlocksBonus ? 0x514522 : 0x293b52;
        strokeWidth = choice.unlocksBonus ? 5 : 3;
        strokeColor = choice.unlocksBonus || !isNewWeapon ? 0xf4b942 : 0x38a9ff;
      } else {
        const stat = STAT_UPGRADES[choice.statId];
        title = stat.name;
        titleColor = '#86efac';
        status = `STAT LV ${choice.currentLevel} → ${choice.currentLevel + 1}`;
        description = [
          stat.description,
          `${Math.round(choice.currentMultiplier * 100)}% → ${Math.round(choice.upgradedMultiplier * 100)}%`,
          '기본값 기준 +5%',
        ].join('\n');
        cardColor = 0x18352b;
        cardHoverColor = 0x22513f;
        strokeWidth = 3;
        strokeColor = 0x4ade80;
      }
      const card = this.add.rectangle(
        cardCenters[index],
        cardY,
        cardWidth,
        cardHeight,
        cardColor,
        0.98,
      );
      card.setStrokeStyle(strokeWidth, strokeColor);
      card.setScrollFactor(0);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(cardHoverColor, 1));
      card.on('pointerout', () => card.setFillStyle(cardColor, 0.98));
      card.on('pointerdown', () => this.chooseUpgrade(choice));

      this.add.text(cardCenters[index], cardY - 86, status, {
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
  scene: [TitleScene, CharacterSelectScene, GameScene, UpgradeScene],
};

new Phaser.Game(config);
