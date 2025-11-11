import { ISpawnPoint } from '../interfaces/ISpawnPoint';
import { VehicleSpawnPoint } from './VehicleSpawnPoint';
import { CharacterSpawnPoint } from './CharacterSpawnPoint';
import { World } from '../world/World';
import { LoadingManager } from '../core/LoadingManager';
import { Path } from './Path';
import * as THREE from 'three';

// Hardcoded race finish-line trigger zones, ported from
// Inthenew/Sketchbook. Each car race uses two zones: tunnel1 must be
// crossed first, tunnel2 closes the loop and increments the lap count.
// Coordinates were authored against world.glb's level layout, so they
// only make sense with that map.
type RaceZone = { minX: number; maxX: number; minZ: number; maxZ: number };
type RaceLayout = { tunnel1: RaceZone; tunnel2: RaceZone };

const RACE_LAYOUTS: Record<string, RaceLayout> = {
	oval: {
		tunnel1: { minX: 30, maxX: 55, minZ: -3, maxZ: 3 },
		tunnel2: { minX: -55, maxX: -30, minZ: -3, maxZ: 3 },
	},
	tunnel: {
		tunnel1: { minX: 130, maxX: 140, minZ: -15, maxZ: 15 },
		tunnel2: { minX: -163, maxX: -148, minZ: -15, maxZ: 15 },
	},
	fig: {
		tunnel1: { minX: -120, maxX: -80, minZ: -95, maxZ: -80 },
		tunnel2: { minX: -150, maxX: -110, minZ: -30, maxZ: -18 },
	},
};

const RACE_BY_TITLE: Record<string, keyof typeof RACE_LAYOUTS> = {
	'Oval race': 'oval',
	'Tunnel race': 'tunnel',
	'Figure 8 race': 'fig',
};

// Names of scenarios whose lap counter runs off path-node passes
// rather than RACE_LAYOUTS' hardcoded trigger zones. Currently just
// the Boat Race because Inthenew shipped that scenario without lap
// tracking; the same approach generalises to any future map-authored
// race by adding an entry here.
const BOAT_RACE_TITLE = 'Boat Race';

// How close (world-space units) the player needs to come to a path
// node for it to count as 'passed' for lap-tracking purposes.
const BOAT_RACE_NODE_THRESHOLD = 15;

type BoatRaceState = {
	orderedNodeNames: string[];
	nextIndex: number;
};

export class Scenario
{
	public id: string;
	public name: string;
	public spawnAlways: boolean = false;
	public default: boolean = false;
	public world: World;
	public descriptionTitle: string;
	public descriptionContent: string;

	public isRace: boolean = false;
	public race: keyof typeof RACE_LAYOUTS | undefined;

	public rootNode: THREE.Object3D;
	public spawnPoints: ISpawnPoint[] = [];
	private invisible: boolean = false;
	private initialCameraAngle: number;

	private lap: number = 0;
	private justLappedTunnel1: boolean = false;
	private justLappedTunnel2: boolean = false;
	private lapCheckTimer: ReturnType<typeof setInterval> | undefined;
	private playerPosition: THREE.Vector3 = new THREE.Vector3();

	private boatRaceState: BoatRaceState | undefined;

	constructor(root: THREE.Object3D, world: World)
	{
		this.rootNode = root;
		this.world = world;
		this.id = root.name;

		// Scenario
		if (root.userData.hasOwnProperty('name'))
		{
			this.name = root.userData.name;
		}
		if (root.userData.hasOwnProperty('default') && root.userData.default === 'true')
		{
			this.default = true;
		}
		if (root.userData.hasOwnProperty('spawn_always') && root.userData.spawn_always === 'true')
		{
			this.spawnAlways = true;
		}
		if (root.userData.hasOwnProperty('invisible') && root.userData.invisible === 'true')
		{
			this.invisible = true;
		}
		if (root.userData.hasOwnProperty('desc_title'))
		{
			this.descriptionTitle = root.userData.desc_title;
		}
		if (root.userData.hasOwnProperty('desc_content'))
		{
			this.descriptionContent = root.userData.desc_content;
		}
		if (root.userData.hasOwnProperty('camera_angle'))
		{
			this.initialCameraAngle = root.userData.camera_angle;
		}

		if (!this.invisible) this.createLaunchLink();

		// Find all scenario spawns and enitites
		root.traverse((child) => {
			if (child.hasOwnProperty('userData') && child.userData.hasOwnProperty('data'))
			{
				if (child.userData.data === 'spawn')
				{
					if (child.userData.type === 'car' || child.userData.type === 'airplane' || child.userData.type === 'heli' || child.userData.type === 'boat' || child.userData.type === 'rocketship')
					{
						let sp = new VehicleSpawnPoint(child);

						if (child.userData.hasOwnProperty('type'))
						{
							sp.type = child.userData.type;
						}

						if (child.userData.hasOwnProperty('driver'))
						{
							sp.driver = child.userData.driver;

							if (child.userData.driver === 'ai' && child.userData.hasOwnProperty('first_node'))
							{
								sp.firstAINode = child.userData.first_node;
							}
						}

						this.spawnPoints.push(sp);
					}
					else if (child.userData.type === 'player')
					{
						let sp = new CharacterSpawnPoint(child);
						this.spawnPoints.push(sp);
					}
				}
			}
		});
	}

	public createLaunchLink(): void
	{
		this.world.params[this.name] = () =>
		{
			this.world.launchScenario(this.id);
		};
		this.world.scenarioGUIFolder.add(this.world.params, this.name);
	}

	public cancelRaceTimer(): void
	{
		if (this.lapCheckTimer !== undefined)
		{
			clearInterval(this.lapCheckTimer);
			this.lapCheckTimer = undefined;
		}
		this.isRace = false;
		this.race = undefined;
		this.boatRaceState = undefined;
	}

	public launch(loadingManager: LoadingManager, world: World): void
	{
		this.spawnPoints.forEach((sp) => {
			sp.spawn(loadingManager, world);
		});

		// Cancel any race timer left over from a previous scenario before
		// starting (or skipping) a new one.
		for (const s of world.scenarios) s.cancelRaceTimer();

		this.lap = 0;
		this.justLappedTunnel1 = false;
		this.justLappedTunnel2 = false;
		this.boatRaceState = undefined;
		world.lapCounter.innerHTML = 'Lap: 0';
		world.lapCounter.style.visibility = 'hidden';

		const raceKey = RACE_BY_TITLE[this.descriptionTitle];
		if (raceKey !== undefined)
		{
			this.isRace = true;
			this.race = raceKey;
			world.lapCounter.style.visibility = 'visible';
			this.lapCheckTimer = setInterval(() =>
			{
				this.checkLap(world.camera.position);
			}, 16);
		}
		else if (this.descriptionTitle === BOAT_RACE_TITLE)
		{
			const state = this.buildBoatRaceState(world);
			if (state !== undefined)
			{
				this.isRace = true;
				this.boatRaceState = state;
				world.lapCounter.style.visibility = 'visible';
				this.lapCheckTimer = setInterval(() =>
				{
					this.checkBoatLap(world.camera.position);
				}, 16);
			}
		}

		if (!this.spawnAlways)
		{
			loadingManager.createWelcomeScreenCallback(this);

			world.cameraOperator.theta = this.initialCameraAngle;
			world.cameraOperator.phi = 15;
		}
	}

	private displayLap(): void
	{
		this.world.lapCounter.innerHTML = `Lap: ${this.lap}`;
	}

	// Player must enter tunnel1 before tunnel2 to count a lap. Leaving
	// both zones resets tunnel2 so the next pass through tunnel1 is
	// required again.
	private checkLap(playerPosition: THREE.Vector3): void
	{
		if (this.race === undefined) return;
		this.playerPosition.copy(playerPosition);

		const layout = RACE_LAYOUTS[this.race];
		const inZone = (z: RaceZone) =>
			this.playerPosition.x >= z.minX && this.playerPosition.x <= z.maxX
			&& this.playerPosition.z >= z.minZ && this.playerPosition.z <= z.maxZ;

		if (inZone(layout.tunnel1))
		{
			if (!this.justLappedTunnel1)
			{
				this.justLappedTunnel1 = true;
				this.justLappedTunnel2 = false;
			}
		}
		else if (inZone(layout.tunnel2))
		{
			if (!this.justLappedTunnel2 && this.justLappedTunnel1)
			{
				this.justLappedTunnel2 = true;
				this.justLappedTunnel1 = false;
				this.lap++;
				this.displayLap();
			}
		}
		else
		{
			this.justLappedTunnel2 = false;
		}
	}

	// Find the path used by the boat race scenario by walking the
	// firstAINode of any AI-driven boat spawn through the path graph.
	// Returns the ordered list of node names so checkBoatLap can step
	// through them sequentially. If no AI spawn / no matching node is
	// found we silently skip lap-tracking — the player can still race,
	// just without a counter.
	private buildBoatRaceState(world: World): BoatRaceState | undefined
	{
		let firstNodeName: string | undefined;
		for (const sp of this.spawnPoints)
		{
			if (sp instanceof VehicleSpawnPoint && sp.type === 'boat' && sp.firstAINode)
			{
				firstNodeName = sp.firstAINode;
				break;
			}
		}
		if (!firstNodeName) return undefined;

		// world.paths is an array of Path. Find the one that contains
		// the named node.
		let path: Path | undefined;
		for (const p of world.paths)
		{
			if (p.nodes[firstNodeName] !== undefined)
			{
				path = p;
				break;
			}
		}
		if (!path) return undefined;

		// Walk the linked list starting at firstNode and collect names
		// in order until we loop back to the start (or hit a dead end).
		const orderedNodeNames: string[] = [];
		const seen = new Set<string>();
		let cursor = path.nodes[firstNodeName];
		while (cursor !== undefined && !seen.has(cursor.object.name))
		{
			seen.add(cursor.object.name);
			orderedNodeNames.push(cursor.object.name);
			cursor = cursor.nextNode;
		}
		if (orderedNodeNames.length === 0) return undefined;

		return { orderedNodeNames, nextIndex: 0 };
	}

	// Sequential path-node-pass tracker. The player needs to come within
	// BOAT_RACE_NODE_THRESHOLD of the next-expected node; once they
	// reach the last node, lap++ and reset to node 0.
	private checkBoatLap(playerPosition: THREE.Vector3): void
	{
		const state = this.boatRaceState;
		if (!state) return;

		const targetName = state.orderedNodeNames[state.nextIndex];
		const path = this.findPathContaining(targetName);
		if (!path) return;
		const node = path.nodes[targetName];
		if (!node) return;

		const nodeWorldPos = new THREE.Vector3();
		node.object.getWorldPosition(nodeWorldPos);
		const distance = nodeWorldPos.distanceTo(playerPosition);
		if (distance < BOAT_RACE_NODE_THRESHOLD)
		{
			state.nextIndex++;
			if (state.nextIndex >= state.orderedNodeNames.length)
			{
				state.nextIndex = 0;
				this.lap++;
				this.displayLap();
			}
		}
	}

	private findPathContaining(nodeName: string): Path | undefined
	{
		for (const p of this.world.paths)
		{
			if (p.nodes[nodeName] !== undefined) return p;
		}
		return undefined;
	}
}
