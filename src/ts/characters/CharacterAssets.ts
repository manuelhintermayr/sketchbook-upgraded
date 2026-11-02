import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { LoadingManager } from '../core/LoadingManager';

// Default player / NPC visual. Swap this path (and drop the file under
// build/assets/) to change the look without touching spawn points.
export const CHARACTER_MODEL_PATH = 'build/assets/boxman.glb';

// Skinned meshes are converted to non-indexed once on the shared
// template so every SkeletonUtils.clone shares one VBO instead of
// each Character ballooning its own copy in readCharacterData.
function prepareCharacterTemplate(gltf: any): void
{
	if (gltf.userData?.__characterPrepared) return;

	gltf.scene.traverse((child: any) =>
	{
		if (child.isSkinnedMesh && child.geometry && child.geometry.index)
		{
			child.geometry = child.geometry.toNonIndexed();
		}
	});

	if (gltf.userData === undefined) gltf.userData = {};
	gltf.userData.__characterPrepared = true;
}

// Load the character GLB once (LoadingManager dedupes by URL), prepare
// the shared template, then hand each caller a skinned-safe clone.
export function loadCharacterModel(loadingManager: LoadingManager, onReady: (gltf: any) => void): void
{
	loadingManager.loadGLTF(CHARACTER_MODEL_PATH, (template) =>
	{
		prepareCharacterTemplate(template);
		onReady({
			scene: SkeletonUtils.clone(template.scene),
			animations: template.animations,
		});
	});
}
