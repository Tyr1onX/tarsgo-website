// A joystick produces the same directional movement vector as the keyboard.
export const JOYSTICK_RADIUS = 48;
export function joystickIntent(dx: number, dy: number, running: boolean) {
  const length = Math.hypot(dx, dy);
  const ratio = Math.min(length / JOYSTICK_RADIUS, 1);
  if (ratio <= .15) return { x: 0, y: 0, running: false };
  const strength = (ratio - .15) / .85;
  return { x: dx / length * strength, y: dy / length * strength,
    running: ratio >= (running ? .65 : .8) };
}
