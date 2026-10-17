import Phaser from 'phaser';
import './style.css';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 3000;
const GRID_SPACING = 100;
const PLAYER_SIZE = 48;
const BLOCK_SIZE = PLAYER_SIZE * 4;
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

class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  create() {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }

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

    this.player = this.add.rectangle(
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      0x4ade80,
    );
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.add.collider(this.player, blocks);
    this.physics.add.collider(this.player, obstacleGroup);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player);
  }

  update() {
    const horizontal = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const direction = new Phaser.Math.Vector2(horizontal, vertical);

    if (direction.lengthSq() === 0) {
      this.playerBody.setVelocity(0, 0);
      return;
    }

    direction.normalize();
    this.playerBody.setVelocity(
      direction.x * PLAYER_SPEED,
      direction.y * PLAYER_SPEED,
    );
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
  scene: GameScene,
};

new Phaser.Game(config);
