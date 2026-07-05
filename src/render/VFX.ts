import * as THREE from 'three';

/** 저렴한 이펙트: 가산합성 스프라이트 파티클 + 링 스케일. 포스트프로세싱 없음. */

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Particle {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxR: number;
}

export class VFX {
  private group = new THREE.Group();
  private glow = makeGlowTexture();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: { sprite: THREE.Sprite; life: number; maxLife: number }[] = [];
  /** 임팩트 코어 팝(타격 순간 번쩍) — 제자리에서 커지며 빠르게 사라지는 밝은 스프라이트. */
  private pops: { sprite: THREE.Sprite; life: number; maxLife: number; from: number; to: number }[] = [];

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
  }

  /** 파티클 폭발 (타격/화상/포획 등) */
  burst(x: number, z: number, color: number, count = 12, spread = 4, y = 0.8): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.glow, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      const ang = Math.random() * Math.PI * 2;
      const sp2 = 0.5 + Math.random() * spread;
      this.group.add(sp);
      this.particles.push({
        sprite: sp,
        vx: Math.cos(ang) * sp2,
        vy: 1 + Math.random() * 2,
        vz: Math.sin(ang) * sp2,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.4,
        size: 0.4 + Math.random() * 0.5,
      });
    }
  }

  /**
   * 타격 임팩트: 흰빛 코어 팝 + 색 스파크 + 얇은 밝은 링을 한 번에. 평타/스킬 명중의 "타격감"용.
   * scale로 세기 조절(평타 0.8, 스킬 1.4, 궁극 2+). crit=true면 흰 스파크를 덧뿌린다.
   */
  impact(x: number, z: number, color: number, scale = 1, crit = false): void {
    // 흰빛 코어 팝
    const mat = new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, 0.9, z);
    this.group.add(sp);
    this.pops.push({ sprite: sp, life: 0, maxLife: 0.18 + scale * 0.05, from: 0.6 * scale, to: 2.4 * scale });
    // 색 스파크 + 밝은 링
    this.burst(x, z, color, Math.round(6 + scale * 6), 3 + scale * 2, 0.9);
    if (crit) this.burst(x, z, 0xffe8b0, 8, 5, 1.0);
    this.ring(x, z, color, 1.4 * scale, 0.22);
  }

  /** 확장 링 (넉백 파도/폭발/협동기) */
  ring(x: number, z: number, color: number, maxR = 4, duration = 0.5): void {
    const geo = new THREE.RingGeometry(0.9, 1, 32);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.1, z);
    this.group.add(mesh);
    this.rings.push({ mesh, life: 0, maxLife: duration, maxR });
  }

  /** 떠오르는 숫자/텍스트 (피해량/포획 성공 등) */
  floatText(x: number, z: number, text: string, color = '#fff'): void {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 64px "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(text, 128, 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(2, 1, 1);
    sp.position.set(x, 1.6, z);
    this.group.add(sp);
    this.texts.push({ sprite: sp, life: 0, maxLife: 1.0 });
  }

  update(dt: number): void {
    // 파티클
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      p.vy -= 4 * dt;
      const s = p.size * (1 - t * 0.6);
      p.sprite.scale.set(s, s, s);
      p.sprite.material.opacity = 1 - t;
    }
    // 링
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const s = 1 + t * r.maxR;
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
    }
    // 임팩트 코어 팝 (커지며 페이드)
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life += dt;
      const t = p.life / p.maxLife;
      if (t >= 1) {
        this.group.remove(p.sprite);
        p.sprite.material.dispose();
        this.pops.splice(i, 1);
        continue;
      }
      const s = p.from + (p.to - p.from) * t;
      p.sprite.scale.set(s, s, s);
      p.sprite.material.opacity = 1 - t;
    }
    // 텍스트
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      const k = t.life / t.maxLife;
      if (k >= 1) {
        this.group.remove(t.sprite);
        (t.sprite.material as THREE.SpriteMaterial).map?.dispose(); // per-hit CanvasTexture 누수 방지
        t.sprite.material.dispose();
        this.texts.splice(i, 1);
        continue;
      }
      t.sprite.position.y += dt * 1.2;
      t.sprite.material.opacity = 1 - k;
    }
  }
}
