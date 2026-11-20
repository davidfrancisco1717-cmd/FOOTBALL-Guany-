import { VirtualJoystick } from './VirtualJoystick';

export type PspButtonId = 'cross' | 'triangle' | 'circle' | 'square' | 'doublePress';

export interface InputSnapshot {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  crossHeld: boolean;
  squareHeld: boolean;
  doublePressHeld: boolean;
  justPressedCross: boolean;
  justPressedTriangle: boolean;
  justPressedCircle: boolean;
  justPressedSquare: boolean;
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

  private justReleasedSquare = false;

  public pressButton(btn: PspButtonId): void {
    if (!this.held[btn]) {
      this.justPressed[btn] = true;
    }
    this.held[btn] = true;
  }

  public releaseButton(btn: PspButtonId): void {
    if (btn === 'square' && this.held.square) {
      this.justReleasedSquare = true;
    }
    this.held[btn] = false;
  }

  public clearAll(): void {
    (Object.keys(this.held) as PspButtonId[]).forEach((k) => {
      this.held[k] = false;
      this.justPressed[k] = false;
    });
    this.justReleasedSquare = false;
    this.joystick.reset();
  }

  public consumeSnapshot(): {
    moveX: number;
    moveZ: number;
    sprint: boolean;
    crossHeld: boolean;
    squareHeld: boolean;
    doublePressHeld: boolean;
    justPressedCross: boolean;
    justPressedTriangle: boolean;
    justPressedCircle: boolean;
    justPressedSquare: boolean;
    justReleasedSquare: boolean;
  } {
    const joy = this.joystick.getVector();
    const out = {
      moveX: joy.x,
      moveZ: joy.y,
      sprint: joy.magnitude >= 0.78,
      crossHeld: this.held.cross,
      squareHeld: this.held.square,
      doublePressHeld:
        this.held.doublePress || (this.held.cross && this.held.square),
      justPressedCross: this.justPressed.cross,
      justPressedTriangle: this.justPressed.triangle,
      justPressedCircle: this.justPressed.circle,
      justPressedSquare: this.justPressed.square,
      justReleasedSquare: this.justReleasedSquare,
    };

    this.justPressed.cross = false;
    this.justPressed.triangle = false;
    this.justPressed.circle = false;
    this.justPressed.square = false;
    this.justPressed.doublePress = false;
    this.justReleasedSquare = false;

    return out;
  }
}
