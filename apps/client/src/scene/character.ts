/**
 * Dresses the shared character model for one person: skin, hair and clothes in their own colours.
 * Each vertex of the skinned body takes the colour of the body part (bone) that moves it most,
 * so clothes follow the walk and idle animations without any extra assets.
 */
import {
  Bone,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import type { Looks } from '@agentville/core';

type Part = 'skin' | 'top' | 'sleeve' | 'bottom' | 'lowerLeg' | 'shoes';

function partOf(bone: string): Part {
  if (/Foot|Toe/.test(bone)) return 'shoes';
  if (/UpLeg|Hips/.test(bone)) return 'bottom';
  if (/Leg/.test(bone)) return 'lowerLeg';
  if (/Hand|Head|Neck|Eye/.test(bone)) return 'skin';
  if (/ForeArm/.test(bone)) return 'sleeve';
  return 'top'; // spine, shoulders, upper arms
}

function colorOf(part: Part, l: Looks): string {
  switch (part) {
    case 'skin':
      return l.skin;
    case 'top':
      return l.top;
    case 'sleeve':
      return l.sleeves === 'long' ? l.top : l.skin;
    case 'bottom':
      return l.legs === 'skirt' ? l.skin : l.bottom;
    case 'lowerLeg':
      return l.legs === 'trousers' ? l.bottom : l.skin;
    case 'shoes':
      return l.shoes;
  }
}

/** Colour every vertex of a skinned mesh by the body part it belongs to. */
function paint(mesh: SkinnedMesh, looks: Looks, shade: number) {
  const geo = mesh.geometry.clone();
  const idx = geo.getAttribute('skinIndex');
  const wgt = geo.getAttribute('skinWeight');
  const bones = mesh.skeleton.bones;
  const colors = new Float32Array(idx.count * 3);
  const cache = new Map<number, Color>();
  for (let i = 0; i < idx.count; i++) {
    let best = 0;
    let bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > bestW) {
        bestW = w;
        best = idx.getComponent(i, k);
      }
    }
    let c = cache.get(best);
    if (!c) {
      c = new Color(colorOf(partOf(bones[best]?.name ?? ''), looks)).multiplyScalar(shade);
      cache.set(best, c);
    }
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  mesh.geometry = geo;
  const fabric = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  fabric.name = 'person';
  mesh.material = fabric;
  mesh.castShadow = true;
}

/** Attach a mesh to a bone, sized in metres whatever the bone's own scale is. */
function attach(bone: Object3D, child: Object3D) {
  const s = bone.getWorldScale(new Vector3());
  const holder = new Group();
  holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
  holder.add(child);
  bone.add(holder);
}

function hairMeshes(looks: Looks, headLen: number): Group {
  const g = new Group();
  if (looks.hairStyle === 'bald') return g;
  const mat = new MeshStandardMaterial({ color: new Color(looks.hair).multiplyScalar(0.8), roughness: 1 });
  const r = headLen * 0.64;
  const add = (geo: SphereGeometry | CylinderGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
  };
  const cy = headLen * 0.56;
  // A cap over the top and back of the head; the face stays clear.
  const cap = new SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, looks.hairStyle === 'crop' ? Math.PI * 0.42 : Math.PI * 0.55);
  add(cap, 0, cy, -headLen * 0.1, 1.0, looks.hairStyle === 'curly' ? 1.1 : 0.95, 1.05);
  if (looks.hairStyle === 'curly') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      add(new SphereGeometry(r * 0.34, 10, 8), Math.cos(a) * r * 0.82, cy + r * 0.35, Math.sin(a) * r * 0.82 - headLen * 0.05);
    }
  }
  if (looks.hairStyle === 'long') {
    // Hair down the back of the neck.
    add(new CylinderGeometry(r * 0.92, r * 1.0, headLen * 0.95, 16, 1, false, Math.PI * 0.5, Math.PI), 0, cy - headLen * 0.42, -headLen * 0.12, 1, 1, 0.75);
  }
  if (looks.hairStyle === 'bun') add(new SphereGeometry(r * 0.42, 12, 10), 0, cy + r * 0.55, -r * 0.75);
  return g;
}

/** Find a bone by name in a model. */
function bone(root: Object3D, name: string): Bone | undefined {
  let found: Bone | undefined;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && o.name.endsWith(name)) found = o as Bone;
  });
  return found;
}

/** Dress a fresh clone of the character model. */
export function dress(model: Object3D, looks: Looks): void {
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    // The joint rings get a slightly darker shade of the same clothes, so they read as seams, not robot parts.
    paint(mesh, looks, mesh.name.includes('Joints') || String((mesh.material as MeshStandardMaterial).name).includes('Joints') ? 0.86 : 1);
  });

  const head = bone(model, 'Head');
  const top = bone(model, 'HeadTop_End');
  if (head && top) {
    const headLen = top.getWorldPosition(new Vector3()).distanceTo(head.getWorldPosition(new Vector3()));
    attach(head, hairMeshes(looks, headLen));
    const eyeMat = new MeshStandardMaterial({ color: '#1b1714', roughness: 0.3 });
    for (const side of ['LeftEye', 'RightEye']) {
      const eye = bone(model, side);
      if (!eye) continue;
      const m = new Mesh(new SphereGeometry(headLen * 0.07, 10, 8), eyeMat);
      m.position.set(0, -headLen * 0.02, headLen * 0.2);
      attach(eye, m);
    }
  }

  if (looks.legs === 'skirt') {
    const hips = bone(model, 'Hips');
    if (hips) {
      const skirt = new Mesh(new CylinderGeometry(0.15, 0.24, 0.42, 18, 1, true), new MeshStandardMaterial({ color: looks.bottom, roughness: 0.85, side: 2 }));
      skirt.position.set(0, -0.16, 0);
      skirt.castShadow = true;
      attach(hips, skirt);
    }
  }
}
