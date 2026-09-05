---
title: Dual Range Slider：交叉换边，本质是每帧重算角色
description: 拆站点上的双端 Slider。手指只拖一个标量，另一端冻成锚点；lower / upper 不是手柄身份，是每一帧排出来的角色。
lang: zh
pubDatetime: 2026-09-05T14:10:00Z
featured: true
draft: false
tags:
  - React
  - Slider
  - 交互
timezone: Asia/Shanghai
---

两个气泡夹一段范围。往右拖下限，拖过上限之后，范围没有卡住，对面接着走。看起来像手柄换了人，其实手势里谁也没换。

站点上的 [Dual Range Slider](/demos/dual-range-slider/) 把这件事收成一条规则：**手指只拖一个数，另一端当锚点；`lower` / `upper` 每帧重算。**

## 目录

## 一次拖拽里只有一个标量

按下某个气泡，会话就冻住了：

```ts
dragRef.current = {
  handle,
  startX: event.clientX,
  startValue: handle === "lower" ? current.lower : current.upper,
  otherValue: handle === "lower" ? current.upper : current.lower,
  pointerId,
};
```

`startValue` 是你抓的那个值。`otherValue` 是对面按下那一瞬的值，后面只当锚点。`handle` 只记得你从哪边出发，不决定现在谁是最小、谁是最大。

之后每一跳，位移先收成一个数：

```ts
const draggedValue = startValue + round((clientX - startX) / width * span);
```

键盘微调也把新值丢进同一个函数。拖和按方向键是同一套规则。

## 交叉时重新发牌

默认 `minGap = 1`。抓下限往右走，只有三支：

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

| 手指在哪 | 结果 |
| --- | --- |
| 还在锚点左侧，且留得开 `gap` | 你仍是下限，锚点不动 |
| 越过锚点，右侧还塞得下 `gap` | 锚点变成新下限，手指变成上限 |
| 已经顶到 `max`，对面腾不出 `gap` | 卡死，不许过 |

上限往左拖是镜像。`gap === 0` 更干脆：每次都 `min(手指, 锚点)` / `max(手指, 锚点)`。

所以「接力」不是换了一个手柄继续拖。指针捕获还在原来那个气泡上，`session.handle` 也不变。变的是这两个数的角色：谁小谁是 lower，谁大谁是 upper，中间至少隔着 `gap`。

## 锚点必须冻在按下那一瞬

如果每帧去读「现在的另一端」，手指刚把角色写回去，下一帧锚点就跟着自己跑。交叉会抖，或者自己跟自己顶牛。

冻住之后，整段手势是对一条数轴做投影：锚点钉死，手指在轴上滑动，范围是投影结果。两个独立 slider 做不到这件事——它们各自夹紧自己的半边，碰到对面会顶死，不会换边。

## 结语

这套 Slider 值得看的不是气泡和轨道，而是它把交叉换边收成一条不变量：

1. 手指只拖一个标量，另一端是按下时冻住的锚点。
2. `lower` / `upper` 每帧重算，不要在手势里交换手柄。
3. `gap` 把「交换」变成「推开」；顶到边界就停。

演示在 [Dual Range Slider](/demos/dual-range-slider/)。
