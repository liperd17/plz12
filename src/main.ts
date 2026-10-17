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
const PLAYER_HIT_FLASH_DURATION = 1000;
const PLAYER_COLOR = 0x4ade80;
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

class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private monsters!: Phaser.Physics.Arcade.Group;
  private radarGraphics!: Phaser.GameObjects.Graphics;
  private obstaclePlacements: ObstaclePlacement[] = [];
  private navigationRects: Phaser.Geom.Rectangle[] = [];
  private navigationNodes: NavigationNode[] = [];
  private monsterTarget = new Phaser.Math.Vector2();
  private navigationGoal = new Phaser.Math.Vector2();
  private navigationDistances: number[] = [];
  private monsterAttackCooldownActive = false;
  private keys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  create() {
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
    this.time.addEvent({
      delay: MONSTER_SPAWN_INTERVAL,
      loop: true,
      callback: () => {
        if (this.monsters.countActive(true) >= MONSTER_MAX_COUNT) {
          return;
        }

        if (!this.spawnMonster()) {
          throw new Error('Unable to place a monster while respecting spawn rules.');
        }
      },
    });

    this.radarGraphics = this.add.graphics().setDepth(3);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player);
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
      || !monsterObject.getData('canAttack')
      || this.monsterAttackCooldownActive
    ) {
      return;
    }

    this.monsterAttackCooldownActive = true;
    this.player.setFillStyle(0xff0000);
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
  }

  update() {
    const horizontal = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    const direction = new Phaser.Math.Vector2(horizontal, vertical);

    if (direction.lengthSq() === 0) {
      this.playerBody.setVelocity(0, 0);
    } else {
      direction.normalize();
      this.playerBody.setVelocity(
        direction.x * PLAYER_SPEED,
        direction.y * PLAYER_SPEED,
      );
    }

    this.updateMonsterMovement();
    this.updateRadar();
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
    this.radarGraphics.strokeCircle(this.player.x, this.player.y, RADAR_RADIUS);

    let closestMonster: Phaser.Physics.Arcade.Sprite | undefined;
    let closestDistance = RADAR_RADIUS * RADAR_RADIUS;
    for (const child of this.monsters.getChildren()) {
      if (!(child instanceof Phaser.Physics.Arcade.Sprite) || !child.active) {
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

    if (closestMonster) {
      this.radarGraphics.lineStyle(2, 0xff2222, 1);
      this.radarGraphics.strokeCircle(closestMonster.x, closestMonster.y, 12);
      this.radarGraphics.strokeCircle(closestMonster.x, closestMonster.y, 18);
    }
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
