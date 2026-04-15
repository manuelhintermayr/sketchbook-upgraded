import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import * as Utils from '../../core/FunctionLibrary';
import { ICollider } from '../../interfaces/ICollider';
import {Mesh, Vector3} from 'three';
import {Object3D} from 'three';

export class ConvexCollider implements ICollider
{
	public mesh: any;
	public options: any;
	public body: CANNON.Body;
	public debugModel: any;

	constructor(mesh: Object3D, options: any)
	{
		this.mesh = mesh.clone();

		let defaults = {
			mass: 0,
			position: mesh.position,
			friction: 0.3
		};
		options = Utils.setDefaults(options, defaults);
		this.options = options;

		let mat = new CANNON.Material('convMat');
		mat.friction = options.friction;
		// mat.restitution = 0.7;

		let vertices: THREE.Vector3[];
		let faces: {a:number, b:number, c:number}[];

		if (this.mesh.geometry.isBufferGeometry)
		{
			vertices = Utils.getVertices(this.mesh);
			faces = Utils.getFaces(this.mesh);
		} else {
			vertices = this.mesh.geometry.vertices;
			faces = this.mesh.geometry.faces;
		}

		let cannonPoints: CANNON.Vec3[] = vertices.map((v: Vector3) => {
			return new CANNON.Vec3( v.x, v.y, v.z );
		});
		
		let cannonFaces: number[][] = faces.map((f: {'a':number, 'b':number, 'c':number}) => {
			return new Array[f.a, f.b, f.c];
		});

		let shape = new CANNON.ConvexPolyhedron({vertices: cannonPoints, faces: cannonFaces});
		// shape.material = mat;

		// Add phys sphere
		let physBox = new CANNON.Body({
			mass: options.mass,
			position: options.position,
			shape
		});

		physBox.material = mat;

		this.body = physBox;
	}
}