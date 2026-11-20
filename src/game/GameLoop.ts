import * as THREE from 'three';

export class GameLoop {
  private clock = new THREE.Clock();
  private frameId = 0;
  private timeoutId = 0;
  private running = false;
  private fpsLimit: 30 | 60 | 0 = 60;
  private accumulator = 0;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly onTick: (dt: number, elapsed: number) => void;

  constructor(
    renderer: THREE.WebGLRenderer,
    isSoftwareGl: boolean,
    onTick: (dt: number, elapsed: number) => void,
  ) {
    this.renderer = renderer;
    this.isSoftwareGl = isSoftwareGl;
    this.onTick = onTick;
  }

  public setFpsLimit(fps: 30 | 60 | 0): void {
    this.fpsLimit = fps;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.clock.getDelta();
    this.scheduleNext();
  }

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.timeoutId);
  }

  private scheduleNext(): void {
    if (!this.running) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        if (this.running) this.step();
      });
    } else {
      this.frameId = requestAnimationFrame(() => {
        if (this.running) this.step();
      });
    }
  }

  private step(): void {
    const rawDt = this.clock.getDelta();
    const clampedDt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    if (!this.isSoftwareGl && this.fpsLimit > 0) {
      this.accumulator += clampedDt;
      const targetStep = 1 / this.fpsLimit;
      if (this.accumulator + 0.001 < targetStep) {
        this.scheduleNext();
        return;
      }
      const stepDt = Math.min(this.accumulator, 0.05);
      this.accumulator = 0;
      this.onTick(stepDt, elapsed);
    } else {
      this.onTick(clampedDt, elapsed);
    }

    this.scheduleNext();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!this.running) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.timeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.timeoutId = window.setTimeout(cb, 80);
        }
      };
      this.timeoutId = window.setTimeout(poll, 5);
    } else {
      this.timeoutId = window.setTimeout(cb, 80);
    }
  }
}
