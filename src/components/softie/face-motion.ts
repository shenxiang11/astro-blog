/* Ported from yuanyang749/softie-webgpu (MIT)
 * https://github.com/yuanyang749/softie-webgpu
 */

export type FaceState = {
  surprised: number;
  squish: number;
  happy: number;
  wink: number;
  dizzy: number;
  blink: number;
  gazeX: number;
  gazeY: number;
};

export type ReactionKind = "surprised" | "happy" | "wink" | "dizzy";

const clamp = (value: number) => Math.max(-1, Math.min(1, value));
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const durations: Record<ReactionKind, number> = {
  surprised: 0.9,
  happy: 1.25,
  wink: 0.85,
  dizzy: 2.8,
};

// One controller owns expression priority and gaze; no competing timers or tweens.
export class FaceMotion {
  time = 0;
  reducedMotion = false;
  state: FaceState = {
    surprised: 0,
    squish: 0,
    happy: 0,
    wink: 0,
    dizzy: 0,
    blink: 0,
    gazeX: 0,
    gazeY: 0,
  };
  grabbing = false;
  reaction: { kind: ReactionKind; started: number } | null = null;
  targetX = 0;
  targetY = 0;
  blinkAt = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.grabbing = false;
    this.reaction = null;
    this.targetX = this.targetY = 0;
    this.blinkAt = this.time + 4.2;
    for (const key of Object.keys(this.state) as (keyof FaceState)[]) {
      this.state[key] = 0;
    }
  }

  lookAt(x: number, y: number) {
    this.targetX = Number.isFinite(x) ? clamp(x) : 0;
    this.targetY = Number.isFinite(y) ? clamp(y) : 0;
  }

  react(kind: ReactionKind) {
    if (!durations[kind]) return;
    if (this.grabbing && kind !== "dizzy") return;
    this.reaction = { kind, started: this.time };
    this.blinkAt = this.time + 4.2;
  }

  grab(active: boolean, celebrate = true) {
    this.grabbing = active;
    if (active) {
      if (this.reaction?.kind !== 'dizzy') this.reaction = null;
    } else {
      if (celebrate && this.reaction?.kind !== 'dizzy') this.react('happy');
    }
  }

  update(time: number) {
    const dt = Math.max(0, Math.min(time - this.time, 0.1));
    this.time = time;
    const follow = 1 - Math.exp(-dt * 14);
    let kind: ReactionKind | "squish" | "idle" = this.grabbing ? "squish" : "idle";
    let weight = this.grabbing ? 1 : 0;
    if (this.reaction) {
      const age = time - this.reaction.started;
      const duration = durations[this.reaction.kind];
      if (age < duration) {
        if (!this.grabbing || this.reaction.kind === "dizzy") {
          kind = this.reaction.kind;
          weight =
            smooth(age / 0.1) *
            (1 - smooth((age - duration * 0.55) / (duration * 0.45)));
        }
      } else {
        this.reaction = null;
      }
    }
    for (const key of ["surprised", "squish", "happy", "wink", "dizzy"] as const) {
      this.state[key] += ((kind === key ? weight : 0) - this.state[key]) * follow;
      if (this.state[key] < 1e-5) this.state[key] = 0;
    }
    if (time > this.blinkAt + 0.22) this.blinkAt = time + 4.2 + Math.sin(time) * 0.6;
    const blinkTime = (time - this.blinkAt) / 0.22;
    this.state.blink = !this.reducedMotion && kind === 'idle' && blinkTime > 0 && blinkTime < 1
      ? Math.sin(blinkTime * Math.PI) ** 2 : 0;
    this.state.gazeX += ((this.reducedMotion ? 0 : this.targetX) - this.state.gazeX) * (1 - Math.exp(-dt * 10));
    this.state.gazeY += ((this.reducedMotion ? 0 : this.targetY) - this.state.gazeY) * (1 - Math.exp(-dt * 10));
    return this.state;
  }

  get expression() {
    if (this.reaction?.kind === 'dizzy') return 'dizzy';
    return this.grabbing ? 'squish' : this.reaction?.kind ?? 'idle';
  }
}
