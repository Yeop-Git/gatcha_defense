import * as THREE from 'three';
import type { Element } from '../core/types';
import { ELEMENT_COLOR } from '../data/constants';

export type ZoneKind = 'slow' | 'fire' | 'thorn' | 'overgrowth';

/** 장판(장지형): 바닥 데칼 + 흔들리는 스프라이트. 지상 적에게만 작용(비행 무시). */
export class GroundZone {
  kind: ZoneKind;
  element: Element;
  center: THREE.Vector3;
  radius: number;
  remaining: number;
  slow: number;
  dps: number;
  root: number; // >0이면 속박 시간 부여
  view: THREE.Group;
  dead = false;

  constructor(kind: ZoneKind, element: Element, x: number, z: number, radius: number, duration: number, opts: { slow?: number; dps?: number; root?: number } = {}) {
    this.kind = kind;
    this.element = element;
    this.center = new THREE.Vector3(x, 0, z);
    this.radius = radius;
    this.remaining = duration;
    this.slow = opts.slow ?? 0;
    this.dps = opts.dps ?? 0;
    this.root = opts.root ?? 0;

    const color = kind === 'fire' ? 0xe8632c : kind === 'slow' ? 0x3fa9bf : ELEMENT_COLOR[element];
    this.view = new THREE.Group();
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'fire' ? 0.5 : 0.38, side: THREE.DoubleSide, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }),
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.08;
    this.view.add(disk);
    // 테두리 링
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.15, radius, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    this.view.add(ring);
    this.view.position.set(x, 0, z);
    this.view.userData.disk = disk;
  }

  contains(x: number, z: number): boolean {
    return Math.hypot(x - this.center.x, z - this.center.z) <= this.radius;
  }

  /** 무성한 성장: 장판 확대/강화 (지속시간은 리셋 안 함) */
  amplify(addRadius: number, addSlow: number): void {
    this.radius += addRadius;
    this.slow = Math.min(0.85, this.slow + addSlow);
    const disk = this.view.userData.disk as THREE.Mesh;
    disk.geometry.dispose();
    disk.geometry = new THREE.CircleGeometry(this.radius, 32);
  }

  /** 들불: 풀 장판 → 화염 장판 변환 */
  igniteToFire(dps: number): void {
    this.kind = 'fire';
    this.dps = dps;
    this.root = 0;
    const disk = this.view.userData.disk as THREE.Mesh;
    const mat = disk.material as THREE.MeshBasicMaterial;
    mat.color.setHex(0xe8632c);
    mat.opacity = 0.5;
    mat.blending = THREE.AdditiveBlending;
    mat.needsUpdate = true;
  }

  update(dt: number, t: number): void {
    this.remaining -= dt;
    if (this.remaining <= 0) this.dead = true;
    const disk = this.view.userData.disk as THREE.Mesh;
    (disk.material as THREE.MeshBasicMaterial).opacity = (this.kind === 'fire' ? 0.5 : 0.38) * Math.min(1, this.remaining) * (0.85 + Math.sin(t * 5) * 0.15);
  }

  dispose(parent: THREE.Object3D): void {
    parent.remove(this.view);
    this.view.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
