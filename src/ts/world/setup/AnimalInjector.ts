import { World } from '../World';
import { WanderingAnimals } from '../animals/WanderingAnimals';
import { Birds } from '../animals/Birds';

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

// Spawns the flying birds + their per-bird positional chirps. Not map-
// gated: birds orbit at altitude (5-14 m) so the cat-game-style layout
// works on top of any scenario. Sandboxes that don't want them can be
// extended later; today the bird audio is what makes any map sound
// alive at all (since AmbientSound only carries wind + water now).
export function injectFlyingBirds(world: World): void
{
	const birds = new Birds();
	world.add(birds);
}
