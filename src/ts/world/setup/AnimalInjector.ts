import { World } from '../World';
import { WanderingAnimals } from '../animals/WanderingAnimals';

// Spawns the wandering dogs + cats around the Inthenew default
// spawn. Sandboxes use their own minimal layouts where the animals
// would just walk off the edge or into geometry, so they're gated on
// the same map switcher key as the default-scene NPC injection.
export function injectWanderingAnimals(world: World): void
{
	const stored = localStorage.getItem('sketchbook.map');
	if (stored !== null && stored !== 'inthenew') return;

	const animals = new WanderingAnimals();
	world.add(animals);
}
