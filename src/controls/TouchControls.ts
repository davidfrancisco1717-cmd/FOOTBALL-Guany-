import { VirtualJoystick } from './VirtualJoystick';

export type PspButtonId = 'cross' | 'triangle' | 'circle' | 'square' | 'doublePress';

export interface InputSnapshot {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  crossHeld: boolean;
  triangleHeld: boolean;
  circleHeld: boolean;
  squareHeld: boolean;
  doublePressHeld: boolean;
  justPressedCross: boolean;
  justPressedTriangle: boolean;
  justPressedCircle: boolean;
  justPressedSquare: boolean;
  justReleasedCross: boolean;
  justReleasedTriangle: boolean;
  justReleasedCircle: boolean;
  justReleasedSquare: boolean;
}

export class TouchControls {
  public readonly joystick = new VirtualJoystick();

  private held: Record<PspButtonId, boolean> = {
    cross: false,
    triangle: false,
    circle: false,
    square: false,
    doublePress: false,
  };

  private justPressed: Record<PspButtonId, boolean> = {
    cross: false,
    triangle: false,
    circle: false,
    square: false,
    doublePress: false,
  };

  private justReleased: Record<PspButtonId, boolean> = {
    cross: false,
    triangle: false,
    circle: false,
    square: false,
    doublePress: false,
  };

  public pressButton(btn: PspButtonId): void {
    if (!this.held[btn]) {
      this.justPressed[btn] = true;
    }
    this.held[btn] = true;
  }

  public releaseButton(btn: PspButtonId): void {
    if (this.held[btn]) {
      this.justReleased[btn] = true;
    }
    this.held[btn] = false;
  }

  public clearAll(): void {
    (Object.keys(this.held) as PspButtonId[]).forEach((k) => {
      this.held[k] = false;
      this.justPressed[k] = false;
      this.justReleased[k] = false;
    });
    this.joystick.reset();
  }

  public consumeSnapshot(): InputSnapshot {
    const joy = this.joystick.getVector();
    const out: InputSnapshot = {
      moveX: joy.x,
      moveZ: joy.y,
      sprint: joy.magnitude >= 0.78,
      crossHeld: this.held.cross,
      triangleHeld: this.held.triangle,
      circleHeld: this.held.circle,
      squareHeld: this.held.square,
      doublePressHeld:
        this.held.doublePress || (this.held.cross && this.held.square),
      justPressedCross: this.justPressed.cross,
      justPressedTriangle: this.justPressed.triangle,
      justPressedCircle: this.justPressed.circle,
      justPressedSquare: this.justPressed.square,
      justReleasedCross: this.justReleased.cross,
      justReleasedTriangle: this.justReleased.triangle,
      justReleasedCircle: this.justReleased.circle,
      justReleasedSquare: this.justReleased.square,
    };

    this.justPressed.cross = false;
    this.justPressed.triangle = false;
    this.justPressed.circle = false;
    this.justPressed.square = false;
    this.justPressed.doublePress = false;
    this.justReleased.cross = false;
    this.justReleased.triangle = false;
    this.justReleased.circle = false;
    this.justReleased.square = false;
    this.justReleased.doublePress = false;

    return out;
  }
}
