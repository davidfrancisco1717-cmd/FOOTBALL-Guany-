export interface JoystickVector {
  x: number;
  y: number;
  magnitude: number;
}

export class VirtualJoystick {
  public x = 0;
  public y = 0;
  public magnitude = 0;

  private activePointerId: number | null = null;
  private centerX = 0;
  private centerY = 0;
  private maxRadius = 48;
  private zoneEl: HTMLElement | null = null;
  private knobEl: HTMLElement | null = null;

  public attach(zoneEl: HTMLElement, knobEl: HTMLElement): () => void {
    this.zoneEl = zoneEl;
    this.knobEl = knobEl;

    const onPointerDown = (e: PointerEvent) => {
      if (this.activePointerId !== null) return;
      e.preventDefault();
      this.activePointerId = e.pointerId;
      zoneEl.setPointerCapture(e.pointerId);
      const rect = zoneEl.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.maxRadius = Math.max(28, rect.width * 0.38);
      this.updateFromClient(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointerId) return;
      e.preventDefault();
      this.updateFromClient(e.clientX, e.clientY);
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      this.reset();
    };

    zoneEl.addEventListener('pointerdown', onPointerDown);
    zoneEl.addEventListener('pointermove', onPointerMove);
    zoneEl.addEventListener('pointerup', onPointerUpOrCancel);
    zoneEl.addEventListener('pointercancel', onPointerUpOrCancel);

    return () => {
      zoneEl.removeEventListener('pointerdown', onPointerDown);
      zoneEl.removeEventListener('pointermove', onPointerMove);
      zoneEl.removeEventListener('pointerup', onPointerUpOrCancel);
      zoneEl.removeEventListener('pointercancel', onPointerUpOrCancel);
      this.reset();
    };
  }

  private updateFromClient(clientX: number, clientY: number): void {
    const dx = clientX - this.centerX;
    const dy = clientY - this.centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, this.maxRadius);
    const angle = Math.atan2(dy, dx);

    const norm = clampedDist / this.maxRadius;
    if (norm < 0.12) {
      this.x = 0;
      this.y = 0;
      this.magnitude = 0;
    } else {
      this.x = Math.cos(angle) * norm;
      this.y = Math.sin(angle) * norm;
      this.magnitude = norm;
    }

    if (this.knobEl) {
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;
      this.knobEl.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;
    }
  }

  public reset(): void {
    this.x = 0;
    this.y = 0;
    this.magnitude = 0;
    if (this.knobEl) {
      this.knobEl.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }

  public getVector(): JoystickVector {
    return { x: this.x, y: this.y, magnitude: this.magnitude };
  }
}
