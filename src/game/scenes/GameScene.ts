import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Powerup } from "../entities/Powerup";

export class GameScene extends Phaser.Scene {
  // Game objects
  private player!: Player;
  private otherPlayers: Map<string, Player> = new Map();
  private projectiles: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
  private powerups: Phaser.Physics.Arcade.Group | null = null;
  
  // Map elements
  private map!: Phaser.Tilemaps.Tilemap;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  
  // Game data
  private playerName: string = "";
  private roomId: string = "";
  private server: any = null;
  private lastPositionUpdate: number = 0;
  private positionUpdateInterval: number = 50; // ms
  private myAccount: string = "";
  private serverInitialized: boolean = false;
  
  constructor() {
    super({ key: "GameScene" });
  }

  setGameData(data: { playerName: string; roomId: string; server: any }) {
    this.playerName = data.playerName;
    this.roomId = data.roomId;
    this.server = data.server;
    
    if (this.server && this.server.account) {
      this.myAccount = this.server.account;
      this.serverInitialized = true;
      
      // 서버가 초기화된 후 구독 설정
      if (this.scene.isActive()) {
        this.setupServerSubscriptions();
        
        // 초기 플레이어 데이터 전송
        this.updatePlayerOnServer();
      }
    }
  }

  preload() {
    // Load game assets
    this.load.image("player", "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/mushroom2.png");
    this.load.image("enemy", "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/mushroom.png");
    this.load.image("projectile", "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/bullets/bullet7.png");
    this.load.image("powerup", "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/orb-red.png");
    this.load.image("obstacle", "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/block.png");
    this.load.image("background", "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/skies/space3.png");
  }

  create() {
    // Create background
    this.add.tileSprite(0, 0, 2000, 2000, "background").setOrigin(0, 0);
    
    // Create game world bounds
    this.physics.world.setBounds(0, 0, 2000, 2000);
    
    // Create obstacles
    this.createObstacles();
    
    // Create player
    this.player = new Player(
      this,
      Phaser.Math.Between(100, 1900),
      Phaser.Math.Between(100, 1900),
      "player",
      this.playerName,
      this.myAccount
    );
    
    // Setup camera to follow player
    this.cameras.main.setBounds(0, 0, 2000, 2000);
    this.cameras.main.startFollow(this.player.sprite, true, 0.09, 0.09);
    this.cameras.main.setZoom(1);
    
    // Create powerups group
    this.powerups = this.physics.add.group();
    
    // Setup collisions
    this.physics.add.collider(this.player.sprite, this.obstacles);
    this.physics.add.overlap(
      this.player.sprite,
      this.powerups as Phaser.Physics.Arcade.Group,
      this.collectPowerup,
      undefined,
      this
    );
    
    // Setup input
    this.setupInput();
    
    // 서버가 이미 초기화되어 있으면 구독 설정
    if (this.serverInitialized) {
      this.setupServerSubscriptions();
      
      // 초기 플레이어 데이터 전송
      this.updatePlayerOnServer();
    }
    
    // Add help text
    this.add.text(16, 16, "방향키 또는 WASD로 이동, 마우스 클릭으로 발사", {
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 }
    }).setScrollFactor(0).setDepth(100);
  }

  private setupServerSubscriptions() {
    if (!this.server || !this.roomId) return;
    
    // Subscribe to projectile creation events
    this.server.onRoomMessage(this.roomId, "projectileFired", this.handleProjectileFired.bind(this));
    
    // Subscribe to powerup creation events
    this.server.onRoomMessage(this.roomId, "powerupSpawned", this.handlePowerupSpawned.bind(this));
  }

  update(time: number, delta: number) {
    // Update player
    if (this.player) {
      this.player.update();
      
      // Send position updates at fixed intervals
      if (this.serverInitialized && time - this.lastPositionUpdate > this.positionUpdateInterval) {
        this.updatePlayerOnServer();
        this.lastPositionUpdate = time;
      }
    }
    
    // Update other players
    this.otherPlayers.forEach(player => player.update());
    
    // Update projectiles
    this.projectiles.forEach((projectile, id) => {
      // Check for projectile collisions with players
      if (this.player && projectile.getData("ownerId") !== this.myAccount) {
        if (this.physics.overlap(projectile, this.player.sprite)) {
          this.handlePlayerHit(this.myAccount, projectile.getData("ownerId"), id);
          projectile.destroy();
          this.projectiles.delete(id);
        }
      }
      
      // Check for projectile collisions with obstacles
      if (this.physics.overlap(projectile, this.obstacles)) {
        projectile.destroy();
        this.projectiles.delete(id);
      }
      
      // Remove projectiles that have exceeded their lifetime
      const creationTime = projectile.getData("creationTime");
      if (Date.now() - creationTime > 2000) { // 2 seconds lifetime
        projectile.destroy();
        this.projectiles.delete(id);
      }
    });
  }

  private createObstacles() {
    this.obstacles = this.physics.add.staticGroup();
    
    // Create border walls
    for (let i = 0; i < 2000; i += 50) {
      this.obstacles.create(i, 0, "obstacle").refreshBody();
      this.obstacles.create(i, 2000, "obstacle").refreshBody();
      this.obstacles.create(0, i, "obstacle").refreshBody();
      this.obstacles.create(2000, i, "obstacle").refreshBody();
    }
    
    // Create some random obstacles
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(100, 1900);
      const y = Phaser.Math.Between(100, 1900);
      this.obstacles.create(x, y, "obstacle").refreshBody();
    }
  }

  private setupInput() {
    // Mouse input for shooting
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.fireProjectile(worldPoint.x, worldPoint.y);
      }
    });
  }

  private fireProjectile(targetX: number, targetY: number) {
    if (!this.player || !this.serverInitialized) return;
    
    const projectileId = `projectile_${this.myAccount}_${Date.now()}`;
    const projectileData = {
      id: projectileId,
      x: this.player.sprite.x,
      y: this.player.sprite.y,
      targetX,
      targetY,
      ownerId: this.myAccount,
      ownerName: this.playerName
    };
    
    // Create projectile locally
    this.createProjectile(projectileData);
    
    // Send projectile data to server
    this.server.remoteFunction("fireProjectile", [projectileData]);
  }

  private createProjectile(data: any) {
    const { x, y, targetX, targetY, id, ownerId } = data;
    
    // Create sprite
    const projectile = this.physics.add.sprite(x, y, "projectile");
    projectile.setScale(0.5);
    projectile.setData("id", id);
    projectile.setData("ownerId", ownerId);
    projectile.setData("creationTime", Date.now());
    
    // Calculate angle and velocity
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    projectile.setRotation(angle);
    
    // Set velocity based on angle
    const speed = 500;
    this.physics.velocityFromRotation(angle, speed, projectile.body.velocity);
    
    // Add visual trail effect using simple graphics instead of particles
    const trail = this.add.graphics();
    trail.fillStyle(0xffff00, 0.5);
    trail.fillCircle(x, y, 5);
    
    // Fade out and remove the trail after a short time
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        trail.destroy();
      }
    });
    
    // Set depth to ensure projectile is above background
    projectile.setDepth(5);
    
    this.projectiles.set(id, projectile);
    
    // Add collisions with obstacles
    this.physics.add.collider(
      projectile,
      this.obstacles,
      () => {
        projectile.destroy();
        this.projectiles.delete(id);
      },
      undefined,
      this
    );
    
    return projectile;
  }

  private handleProjectileFired(data: any) {
    // Don't create projectiles fired by this player (already created locally)
    if (data.ownerId === this.myAccount) return;
    
    this.createProjectile(data);
  }

  private handlePowerupSpawned(data: any) {
    if (!this.powerups) return;
    
    const powerup = new Powerup(
      this,
      data.x,
      data.y,
      "powerup",
      data.id,
      data.type
    );
    
    this.powerups.add(powerup.sprite);
  }

  private collectPowerup(playerSprite: Phaser.Physics.Arcade.Sprite, powerupSprite: Phaser.Physics.Arcade.Sprite) {
    const powerupId = powerupSprite.getData("id");
    const powerupType = powerupSprite.getData("type");
    
    // Apply powerup effect
    if (powerupType === "health") {
      this.player.heal(25);
    } else if (powerupType === "speed") {
      this.player.applySpeedBoost(5000); // 5 seconds
    }
    
    // Remove powerup
    powerupSprite.destroy();
    
    // Notify server if initialized
    if (this.serverInitialized) {
      this.server.remoteFunction("collectPowerup", [powerupId]);
    }
  }

  private handlePlayerHit(targetId: string, attackerId: string, projectileId: string) {
    // Apply damage locally
    if (targetId === this.myAccount) {
      this.player.damage(10);
      
      // Check if player died
      if (this.player.health <= 0) {
        this.handlePlayerDeath(targetId, attackerId);
      }
    }
    
    // Notify server if initialized
    if (this.serverInitialized) {
      this.server.remoteFunction("playerHit", [
        {
          targetId,
          attackerId,
          projectileId,
          damage: 10
        }
      ]);
    }
  }

  private handlePlayerDeath(playerId: string, killerId: string) {
    if (playerId === this.myAccount) {
      // Respawn player
      this.player.sprite.setPosition(
        Phaser.Math.Between(100, 1900),
        Phaser.Math.Between(100, 1900)
      );
      this.player.reset();
      
      // Notify server if initialized
      if (this.serverInitialized) {
        this.server.remoteFunction("playerDied", [
          {
            playerId,
            killerId
          }
        ]);
      }
    }
  }

  private updatePlayerOnServer() {
    if (!this.player || !this.serverInitialized || !this.server) return;
    
    const playerData = {
      x: this.player.sprite.x,
      y: this.player.sprite.y,
      angle: this.player.sprite.angle,
      health: this.player.health,
      name: this.playerName
    };
    
    this.server.remoteFunction(
      "updatePlayerPosition",
      [playerData],
      { throttle: 50 }
    );
  }

  updateRoomState(roomState: any) {
    // Handle room state updates
    if (roomState.powerups) {
      // Sync powerups with server state
      this.syncPowerups(roomState.powerups);
    }
  }

  updatePlayerStates(playerStates: any[]) {
    if (!playerStates) return;
    
    playerStates.forEach(playerState => {
      const playerId = playerState.account;
      
      // Skip our own player (we handle our own state)
      if (playerId === this.myAccount) return;
      
      if (playerState.x !== undefined && playerState.y !== undefined) {
        // Update existing player or create new one
        if (this.otherPlayers.has(playerId)) {
          const player = this.otherPlayers.get(playerId)!;
          player.moveTo(playerState.x, playerState.y);
          player.setHealth(playerState.health || 100);
        } else {
          // Create new player
          const newPlayer = new Player(
            this,
            playerState.x,
            playerState.y,
            "enemy",
            playerState.name || "Unknown",
            playerId
          );
          
          this.otherPlayers.set(playerId, newPlayer);
          
          // Add collision with obstacles
          this.physics.add.collider(newPlayer.sprite, this.obstacles);
        }
      }
    });
    
    // Remove players that are no longer in the room
    const currentPlayerIds = new Set(playerStates.map(p => p.account));
    this.otherPlayers.forEach((player, id) => {
      if (!currentPlayerIds.has(id)) {
        player.destroy();
        this.otherPlayers.delete(id);
      }
    });
  }

  private syncPowerups(powerupData: any[]) {
    if (!this.powerups) return;
    
    // Clear existing powerups
    this.powerups.clear(true, true);
    
    // Create powerups from server data
    powerupData.forEach(data => {
      const powerup = new Powerup(
        this,
        data.x,
        data.y,
        "powerup",
        data.id,
        data.type
      );
      
      this.powerups?.add(powerup.sprite);
    });
  }
}
