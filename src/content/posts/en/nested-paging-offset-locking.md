---
title: "NestedPaging: Nested scrolling on a profile page is really just locking contentOffset"
description: A walk through the NestedPaging source. The outer table and child lists both recognize the same vertical gesture; who actually scrolls is decided by offset locking. Header visibility is the only source of truth.
lang: en
pubDatetime: 2026-08-19T10:21:00Z
featured: true
draft: false
tags:
  - iOS
  - UIKit
  - NestedPaging
  - 嵌套滚动
timezone: Asia/Shanghai
---

Douyin, Xiaohongshu, X, and Instagram profile pages almost share one feel: the cover or profile slides up, the category bar pins, and the lists underneath can scroll vertically or page sideways. It gets dirty fast — the header is still visible and a child list is already moving; switch to another tab, pull the cover back, switch back, and the page suddenly pins to the top.

[NestedPaging](https://github.com/shenxiang11/NestedPaging) is a UIKit container with no third-party dependencies, built for this. The source is short. The core files are about four hundred lines. It does not invent new scroll physics. It pulls “who is scrolling” out of gesture races and lets `contentOffset` decide.

## Table of contents

## Why this page is hard

Nested scrolling is not a layout problem. It is one finger hitting two vertical `UIScrollView`s at once.

The usual setup: an outer table, a header on top, a category bar in the middle, and one screen-tall cell below. Inside that cell sit horizontal paging and the real lists. Then several demands start fighting:

- While the header is still showing, child lists must not move. Otherwise the cover and the cells both travel, and the user cannot tell which layer they are scrolling.
- After the category bar pins, the outer table must stop and hand vertical scrolling to the current list.
- While a child list has not returned to the top, you cannot pull the header back.
- List A scrolled some amount, you switch to B, pull the header back into view in B, then switch back to A — A’s leftover offset must not pin the outer table again.
- Swiping right on the first page should yield to the system back gesture, not get eaten by horizontal paging.

The system will not make these calls for you. `UIScrollView` defaults to whoever recognized first. Nested, that is a race. NestedPaging’s choice: **both layers recognize the same vertical pan, then offset locking decides who actually moves.**

## Structure: one plain UITableView

The outer view is not a custom scroll container. It is a `.plain` `UITableView`. Plain style already pins section headers, so the category bar can be `viewForHeaderInSection`. No second sticky implementation.

```
┌─────────────────────────────┐
│ tableHeaderView             │  Header
├─────────────────────────────┤
│ section header              │  Category bar (plain pins it)
├─────────────────────────────┤
│ The only cell               │  height = viewport − bar − pin inset
│   └─ horizontal paging      │
│        ├─ list 0            │
│        └─ list 1            │
└─────────────────────────────┘
```

The outer table turns off automatic insets and manages the safe area itself:

```swift
mainTableView.contentInsetAdjustmentBehavior = .never
mainTableView.sectionHeaderTopPadding = 0
mainTableView.scrollsToTop = false
```

Cell height is not content-driven. It is “after the category bar pins, the rest of the viewport is exactly filled”:

```swift
private var listContainerSize: CGSize {
    let pinHeight = delegate?.heightForPinSectionHeader(in: self) ?? 0
    let height = max(bounds.height - pinHeight - pinSectionHeaderVerticalOffset, 0)
    return CGSize(width: bounds.width, height: height)
}
```

`pinSectionHeaderVerticalOffset` follows `safeAreaInsets.top` by default. When the container is flush with the top of the screen, the category bar stops under the navigation bar. If you pin `NestedPagingView` under `safeAreaLayoutGuide.topAnchor` the way the Instagram demo does, the computed offset is `0`. Same pin behavior, two navigation-bar shapes.

Horizontal paging is another `UIScrollView` with `isPagingEnabled = true`. Child lists are created on demand. When scroll progress nears a page, the neighbors are loaded so you do not slide into empty space.

## Recognize together, then lock offset

The outer table overrides the gesture delegate. Vertically it is willing to begin with a child list’s pan, but it refuses to begin with horizontal paging:

```swift
private func shouldRecognizeSimultaneously(with other: UIGestureRecognizer) -> Bool {
    guard other is UIPanGestureRecognizer else { return false }
    if other.view === listContainerView.scrollView {
        return false
    }
    return other.view is UIScrollView
}
```

Simultaneous recognition only solves “both layers receive the finger.” It does not solve “who moves.” The real model is a threshold:

```
maxOffsetY = tableHeaderViewHeight − pinSectionHeaderVerticalOffset
```

The moment the header just leaves and the category bar kisses the top, the outer offset equals `maxOffsetY`. After that the rules fit on one table:

| Condition | Outer | Child lists |
| --- | --- | --- |
| Outer offset `< maxOffsetY` | Scrolls | All locked at the top |
| Outer reaches `maxOffsetY` | Locked | Current list scrolls |
| Child list has not returned to top | Locked at `maxOffsetY` | Keeps scrolling |
| Child list is back at top, then pull down | Header re-enters | All reset to top |

While the outer table scrolls:

```swift
private func processMainTableViewDidScroll(_ scrollView: UIScrollView) {
    let maxOffsetY = mainTableViewMaxContentOffsetY

    if let list = currentScrollingListView, list.contentOffset.y > -list.adjustedContentInset.top {
        scrollView.contentOffset.y = maxOffsetY
    } else if scrollView.contentOffset.y < maxOffsetY {
        resetAllListsToTop()
    }

    if scrollView.contentOffset.y > maxOffsetY {
        scrollView.contentOffset.y = maxOffsetY
    }
}
```

While a child list scrolls, the inverse:

```swift
private func processListViewDidScroll(_ scrollView: UIScrollView) {
    if mainTableView.contentOffset.y < maxOffsetY {
        resetAllListsToTop()
    } else {
        mainTableView.contentOffset.y = maxOffsetY
    }
}
```

Read the two together and they are keeping one invariant: **when the header is visible, child list offsets must be at the top; after the header pins, the outer offset must sit on `maxOffsetY`.** Gestures can be alive at the same time. Positions cannot both be free.

A child list must forward `scrollViewDidScroll`. Miss that step and the inner lock loop breaks. It looks like “the outer table still follows the finger after pin.”

## Header visibility is the only source of truth

Locking the current list is not enough. Suppose list A has scrolled to row 20, you switch to B, and in B you pull the cover back. The outer offset is now `< maxOffsetY` and the header is showing. If A is still on row 20, the next switch back to A makes `processMainTableViewDidScroll` see “the child list is not at the top” and immediately pin the outer table to `maxOffsetY`. To the user: I just pulled the cover down, I changed tabs, and it snapped away.

So reset targets **every list that has already been created**, not only the current page:

```swift
/// Header visible ⇒ every list is at the top. A leftover offset on another
/// tab would later force the outer table back to `maxOffsetY`.
private func resetAllListsToTop() {
    isReconcilingListOffsets = true
    defer { isReconcilingListOffsets = false }

    for list in listContainerView.validLists.values {
        let scrollView = list.listScrollView()
        let minOffsetY = -scrollView.adjustedContentInset.top
        guard scrollView.contentOffset.y - minOffsetY > 0.5 else { continue }
        scrollView.contentOffset = CGPoint(x: scrollView.contentOffset.x, y: minOffsetY)
    }
}
```

`isReconcilingListOffsets` cuts the feedback. Resetting offset fires `scrollViewDidScroll`. Without a guard, the inner callback writes the outer table again, and the outer writes the inner again.

While the header is showing, child list `bounces` is also off. Otherwise the list rubber-bands at the top while the outer table is walking the header — two rebounds stacked. Only after the category bar pins does the current list get bounce back. Status-bar tap-to-top only enables `scrollsToTop` on the current page. The outer table turns its own off, so one tap does not scroll the wrong layer.

## Horizontal paging stays out of the vertical gesture

Vertical nesting is already loud. If horizontal paging also recognizes with them, a diagonal swipe will change pages and scroll a list. So the outer table explicitly refuses to begin with the paging scroll. The horizontal container also gates direction and edges:

```swift
private func shouldBeginHorizontalPan(_ pan: UIPanGestureRecognizer) -> Bool {
    let velocity = pan.velocity(in: pagingScrollView)
    guard abs(velocity.x) > abs(velocity.y) else { return false }

    if currentIndex == 0, velocity.x > 0 {
        return false
    }
    if currentIndex == listCount - 1, velocity.x < 0 {
        return false
    }
    return true
}
```

A right swipe on the first page never begins, so the system interactive pop can take over. A left swipe on the last page is abandoned the same way, so rubber-banding at the end does not fight content scrolling. When vertical velocity is larger, it also does not begin. Diagonal swipes prefer the vertical layers.

The category bar and paging are loosely coupled. `NestedPagingPinBar` is just equal-width titles plus an indicator. Progress comes from `contentOffset.x / pageWidth`. The Instagram demo swaps in icon tabs. The protocol is the same: tapping a title calls `setCurrentListIndex`, and paging writes back `setProgress`.

## No tabs, no nesting

Nested scrolling assumes several child lists share one header and each remembers its vertical position. With no category bar and only one article, wrapping another `UIScrollView` is extra — one more handoff, and one more chance to forget a callback.

NestedPaging admits this with optional `listPreferredContentHeight(forWidth:)`. Once a height is returned, the cell sizes to content. The outer table scrolls the header and the body together, no longer locks `maxOffsetY`, and no longer attaches scroll callbacks to the inner view.

```swift
func heightForPinSectionHeader(in pagingView: NestedPagingView) -> CGFloat { 0 }
func numberOfLists(in pagingView: NestedPagingView) -> Int { 1 }

func listPreferredContentHeight(forWidth width: CGFloat) -> CGFloat? {
    articleHeight
}
```

The “no category bar” demo uses this fully: a cyan cover as `tableHeaderView`, a white rounded card as an ordinary `UIView`, height measured with `systemLayoutSizeFitting`. The card can tuck under the cover, or scroll all the way under a transparent navigation bar. The bottom safe area is added on `mainTableView`, so bounce reveals white, not the cover color.

> [!NOTE]
> The library’s own comment is blunt: strictly speaking, this scene is no longer nested scrolling. The API still goes through `NestedPagingView`. It just removes the second vertical scroll.

## One model, four profile pages

In the demo, Douyin, Xiaohongshu, X, and the personal homepage all hang off the same `CoverPagingController`. The differences are only the header, the pin bar, and the child lists:

- **Douyin**: dark cover, Works / Liked / Favorites, a three-column vertical video grid.
- **Xiaohongshu**: light pink cover, Notes / Favorites / Liked, two-column cards.
- **X**: banner plus a straddling avatar, Posts / Replies as a timeline, Media as a nine-grid.
- **Instagram**: no large cover, container starts at the safe-area top, icon tabs, three-column squares.

A child list can be a `UITableView` or a `UICollectionView`. The protocol only asks for the root view, the scroll view, and a forwarded `scrollViewDidScroll`. The container does not care whether you use Compositional Layout or a plain table.

The cover page also fades the navigation bar on the outer `mainTableViewDidScroll`: progress is `offsetY / fadeDistance`, the background goes from clear to `systemBackground`, and the title appears late. That is product work. The library only guarantees that the vertical offset stays continuous and predictable in `0...maxOffsetY`.

## What this model will not do

A fast flick from the header region stops the outer table at `maxOffsetY`. Leftover inertia does not enter the current child list.

That is not a forgotten bug. It is a consequence of offset locking. The outer table is written as “must not pass `maxOffsetY`.” The system deceleration animation ends at the boundary. There is no channel that hands velocity to the inner list. Cross-layer inertia means reading `panGestureRecognizer.velocity` at the end yourself, then calling `setContentOffset` on the child list or faking a deceleration. NestedPaging chooses not to. The trade is a simple model and state you can reason about.

Two other edges are worth keeping:

- Child lists must forward `scrollViewDidScroll`. The protocol will not hook it for you. Miss it and there is no vertical handoff.
- When header height changes, call `reloadData()`. The demo remeasures in `viewDidLayoutSubviews` and skips drag / deceleration, so a mid-scroll reset does not fire.

## Closing

NestedPaging is worth reading not because it is “yet another profile-page framework,” but because it collapses that social-app feel into three hard invariants:

1. Both vertical layers recognize the gesture. Position is locked by `maxOffsetY`.
2. When the header is visible, every child list is at the top, not just the current page.
3. If several lists do not need to share a header, do not add a second vertical `UIScrollView`.

Gesture races stay with the system. Scroll meaning stays yours. Inside four hundred lines, a Douyin or Xiaohongshu page can grow out of the same container. The repo is [github.com/shenxiang11/NestedPaging](https://github.com/shenxiang11/NestedPaging). The sample project is `Demo/NestedPagingDemo.xcodeproj`.
