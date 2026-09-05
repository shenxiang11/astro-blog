---
title: "Dual Range Slider: Crossing sides is really just recomputing roles each frame"
description: A walk through the dual-range slider on this site. The finger drags one scalar; the other end freezes as an anchor. lower / upper are not handle identities — they are roles assigned every frame.
lang: en
pubDatetime: 2026-09-05T14:10:00Z
featured: true
draft: false
tags:
  - React
  - Slider
  - 交互
timezone: Asia/Shanghai
---

Two bubbles clamp a range. Drag the lower one past the upper, and the range does not jam — the far side keeps going. It looks like the handles swapped. Nothing in the gesture did.

The [Dual Range Slider](/en/demos/dual-range-slider/) on this site collapses that into one rule: **the finger drags one number, the other end is an anchor, and `lower` / `upper` are recomputed every frame.**

## Table of contents

## One drag, one scalar

On pointer down, the session freezes:

```ts
dragRef.current = {
  handle,
  startX: event.clientX,
  startValue: handle === "lower" ? current.lower : current.upper,
  otherValue: handle === "lower" ? current.upper : current.lower,
  pointerId,
};
```

`startValue` is the value you grabbed. `otherValue` is the opposite end at that instant, and it stays an anchor. `handle` only remembers which side you started from. It does not decide who is min or max now.

Each move first collapses into one number:

```ts
const draggedValue = startValue + round((clientX - startX) / width * span);
```

Keyboard nudges send the new value through the same function. Dragging and arrow keys share one rule.

## Crossing deals the roles again

Default `minGap` is `1`. Drag the lower end right, and there are only three branches:

```ts
if (draggedValue <= fixedValue - gap) {
  return { lower: draggedValue, upper: fixedValue };
}
if (fixedValue + gap <= max) {
  return {
    lower: fixedValue,
    upper: Math.max(draggedValue, fixedValue + gap),
  };
}
return { lower: Math.max(min, fixedValue - gap), upper: fixedValue };
```

| Where the finger is | Result |
| --- | --- |
| Still left of the anchor, with room for `gap` | You stay lower; the anchor does not move |
| Past the anchor, and the right side still fits `gap` | The anchor becomes the new lower; the finger becomes upper |
| Already at `max`, no room for `gap` | Locked. No crossing |

Dragging the upper end left is the mirror. `gap === 0` is even shorter: every frame is `min(finger, anchor)` / `max(finger, anchor)`.

So the handoff is not “grab the other handle and keep going.” Pointer capture stays on the original bubble. `session.handle` does not change. What changes is the role of the two numbers: the smaller is lower, the larger is upper, with at least `gap` between them.

## The anchor has to freeze on pointer down

If you reread “the other end now” every frame, the finger writes a new role, then the next frame the anchor chases it. Crossing jitters, or the value fights itself.

Once it is frozen, the whole gesture is a projection onto a number line: the anchor is pinned, the finger slides, the range is the result. Two independent sliders cannot do this. Each clamps its own half, meets the other, and dies. They never swap sides.

## Closing

This slider is worth reading not for the bubbles and the track, but because crossing sides collapses into one invariant:

1. The finger drags one scalar. The other end is the anchor frozen on pointer down.
2. `lower` / `upper` are recomputed every frame. Do not swap handles inside the gesture.
3. `gap` turns a swap into a push. Hit the edge, stop.

The demo is [Dual Range Slider](/en/demos/dual-range-slider/).
