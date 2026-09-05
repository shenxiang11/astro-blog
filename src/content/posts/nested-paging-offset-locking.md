---
title: NestedPaging：社交个人页的嵌套滚动，本质是在锁 contentOffset
description: 拆 NestedPaging 源码。外层 table 和子列表同时识别同一条垂直手势，真正谁在滚由 offset 锁定决定；Header 可见性是唯一真相。
lang: zh
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

抖音、小红书、X、Instagram 的个人页，手感几乎是同一套：封面或资料往上走，中间分类栏吸住，底下多个列表既能自己垂直滚，也能左右换页。做起来却很容易脏——Header 还在，子列表已经在动；切到另一个 tab 把封面拉回来，再切回去，页面突然吸顶。

[NestedPaging](https://github.com/shenxiang11/NestedPaging) 是一套无第三方依赖的 UIKit 容器，专门处理这件事。源码不长，核心文件大约四百行。它没有发明新的滚动物理，而是把「谁在滚」从手势竞争里抽出来，交给 `contentOffset` 裁决。

## 目录

## 这个页面到底难在哪

嵌套滚动的困难不在布局，在同一根手指同时碰到两层垂直 `UIScrollView`。

常见做法是：外层一张表，上面是 Header，中间是分类栏，下面一个跟屏幕等高的 cell，cell 里再塞水平分页和真正的列表。这时会出现几组互相打架的需求：

- Header 还露着时，子列表不能动。否则封面在走、格子也在走，用户不知道自己在滚哪一层。
- 分类栏吸顶之后，外层必须停住，把垂直滚动交给当前列表。
- 子列表还没回到顶部时，不能把 Header 拉回来。
- 列表 A 滚过一段，切到 B，在 B 里把 Header 拉回视口，再切回 A——A 残留的 offset 不能把外层重新钉死。
- 第一页继续右滑，要让给系统返回手势，而不是被水平 paging 吃掉。

系统不会替你做这些裁决。`UIScrollView` 默认谁先识别谁滚，嵌套时就是抢。NestedPaging 的选择是：**两层都识别同一条垂直 pan，然后用 offset 锁定决定谁真的移动。**

## 结构：一张 plain UITableView

外层不是自定义滚动容器，就是一张 `.plain` 的 `UITableView`。plain style 自带 section header 吸顶，分类栏直接当 `viewForHeaderInSection` 用，不必再写一套 sticky。

```
┌─────────────────────────────┐
│ tableHeaderView             │  Header
├─────────────────────────────┤
│ section header              │  分类栏（plain 吸顶）
├─────────────────────────────┤
│ 唯一 cell                   │  高度 = 视口 − 分类栏 − 吸顶偏移
│   └─ 横向 paging scroll     │
│        ├─ 列表 0            │
│        └─ 列表 1            │
└─────────────────────────────┘
```

外层关掉系统自动 inset，自己管安全区：

```swift
mainTableView.contentInsetAdjustmentBehavior = .never
mainTableView.sectionHeaderTopPadding = 0
mainTableView.scrollsToTop = false
```

cell 高度不是内容撑开的，是「分类栏吸顶之后，底下刚好铺满剩余视口」：

```swift
private var listContainerSize: CGSize {
    let pinHeight = delegate?.heightForPinSectionHeader(in: self) ?? 0
    let height = max(bounds.height - pinHeight - pinSectionHeaderVerticalOffset, 0)
    return CGSize(width: bounds.width, height: height)
}
```

`pinSectionHeaderVerticalOffset` 默认跟着 `safeAreaInsets.top` 走。容器贴屏幕顶边时，分类栏停在导航栏下方；如果像 Instagram Demo 那样把 `NestedPagingView` 约束在 `safeAreaLayoutGuide.topAnchor` 之下，自动算出来的偏移就是 `0`。同一种吸顶，两种导航栏形态。

水平分页是另一个 `UIScrollView`，`isPagingEnabled = true`，子列表按需创建。滚动进度接近某一页时，会把左右邻页也加载进来，避免滑到空白。

## 同时识别，然后锁 offset

外层 table 覆写了手势代理。垂直方向上，它愿意和子列表的 pan 同时开始，但拒绝和水平 paging 一起开始：

```swift
private func shouldRecognizeSimultaneously(with other: UIGestureRecognizer) -> Bool {
    guard other is UIPanGestureRecognizer else { return false }
    if other.view === listContainerView.scrollView {
        return false
    }
    return other.view is UIScrollView
}
```

同时识别只解决「两层都收到手指」，不解决「谁在动」。真正的模型是一个阈值：

```
maxOffsetY = tableHeaderViewHeight − pinSectionHeaderVerticalOffset
```

Header 刚好离开、分类栏贴顶的那一刻，外层 offset 等于 `maxOffsetY`。之后的规则可以写成一张表：

| 条件 | 外层 | 子列表 |
| --- | --- | --- |
| 外层 offset `< maxOffsetY` | 滚动 | 全部锁在顶部 |
| 外层到达 `maxOffsetY` | 锁定 | 当前列表滚动 |
| 子列表还没回到顶部 | 锁在 `maxOffsetY` | 继续滚 |
| 子列表回到顶部后再下拉 | Header 回入 | 全部重置到顶部 |

外层滚动时：

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

子列表滚动时反过来：

```swift
private func processListViewDidScroll(_ scrollView: UIScrollView) {
    if mainTableView.contentOffset.y < maxOffsetY {
        resetAllListsToTop()
    } else {
        mainTableView.contentOffset.y = maxOffsetY
    }
}
```

两段代码对着看，会发现它们在维护同一个不变量：**Header 可见时，子列表 offset 必须在顶部；Header 吸顶后，外层 offset 必须停在 `maxOffsetY`。** 手势可以同时活着，位置却不能同时自由。

子列表接入时必须把 `scrollViewDidScroll` 转发出去。漏转这一步，内层的锁定循环就断了，看起来像「吸顶之后外层还在跟着手指走」。

## Header 可见性是唯一真相

只锁当前列表不够。假设列表 A 已经滚到第 20 行，切到 B，在 B 里把封面拉回来。此时外层 offset `< maxOffsetY`，Header 露着。如果 A 还停在第 20 行，下一次再切回 A，`processMainTableViewDidScroll` 会看到「子列表不在顶部」，立刻把外层钉回 `maxOffsetY`。用户感知就是：我刚把封面拉下来，换个 tab 它又弹走了。

所以重置针对的是**所有已经创建的列表**，不只是当前页：

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

`isReconcilingListOffsets` 用来切断反馈。重置 offset 会触发 `scrollViewDidScroll`，如果不挡一下，内层回调会再次改外层，外层再改内层。

Header 露着时，子列表 `bounces` 也是关的。否则列表在顶部橡皮筋，外层又在走 Header，两次回弹叠在一起。只有分类栏吸顶之后，当前列表才恢复 bounce。状态栏点击回顶只打开当前页的 `scrollsToTop`，外层自己关掉，避免点一下滚错层。

## 水平分页不掺和垂直手势

垂直嵌套已经够吵，水平 paging 如果再和它们同时识别，斜着滑就会又切页又滚列表。所以外层明确拒绝和 paging scroll 同时开始。水平容器自己还卡了方向和边界：

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

第一页往右滑直接不 begin，系统 interactive pop 才能接着认。最后一页往左滑同样放弃，避免在尽头橡皮筋和内容滚动抢手感。垂直速度更大时也不 begin，斜滑优先交给上下层。

分类栏和分页是松耦合。`NestedPagingPinBar` 只是一个等分标题加指示条，进度来自 `contentOffset.x / pageWidth`。Demo 里 Instagram 换成了图标 tab，协议一样：点标题调用 `setCurrentListIndex`，滑分页回写 `setProgress`。

## 没有 Tab，就不要嵌套

嵌套滚动的前提是：多个子列表要共享同一个 Header，各自记住垂直位置。没有分类栏、只有一篇文章时，再套一层 `UIScrollView` 是多余的——多一层就要多一次接力，也多一个漏转回调的坑。

NestedPaging 用可选的 `listPreferredContentHeight(forWidth:)` 承认这件事。返回高度后，cell 按内容撑开，外层 table 带着 Header 和正文一起滚，不再锁 `maxOffsetY`，也不再给内层挂 scroll 回调。

```swift
func heightForPinSectionHeader(in pagingView: NestedPagingView) -> CGFloat { 0 }
func numberOfLists(in pagingView: NestedPagingView) -> Int { 1 }

func listPreferredContentHeight(forWidth width: CGFloat) -> CGFloat? {
    articleHeight
}
```

Demo 里的「无分类栏」把这个模式用满了：青色封面当 `tableHeaderView`，白色圆角卡片是普通 `UIView`，用 `systemLayoutSizeFitting` 量高。卡片可以压进封面下沿，也可以一路滚进透明导航栏下面。底部安全区加在 `mainTableView` 上，回弹露出的是白底，不是封面色。

> [!NOTE]
> 库自己的注释写得很干脆：严格来说，这个场景已经不是嵌套滚动。API 仍然走 `NestedPagingView`，只是把第二层垂直 scroll 拿掉。

## 同一套模型，四种个人页

Demo 里抖音、小红书、X、个人主页都挂在同一个 `CoverPagingController` 上。差异只在 Header、吸顶栏和子列表：

- **抖音**：深色封面、作品 / 喜欢 / 收藏，三列竖视频宫格。
- **小红书**：浅粉封面、笔记 / 收藏 / 赞过，双列卡片。
- **X**：Banner + 头像骑缝，帖子 / 回复是时间线，媒体是九宫格。
- **Instagram**：没有大封面，容器从安全区顶边开始，图标 tab，三列方图。

子列表可以是 `UITableView` 或 `UICollectionView`，协议只要求交出根视图、滚动视图，以及把 `scrollViewDidScroll` 转发出去。容器不关心你用 Compositional Layout 还是普通 table。

封面页还在外层的 `mainTableViewDidScroll` 上做导航栏渐变：按 `offsetY / fadeDistance` 算进度，背景从透明过渡到 `systemBackground`，标题在后段才出现。这是业务层的事，库只保证垂直 offset 在 `0...maxOffsetY` 之间连续、可预测。

## 这套模型过不了的坎

从 Header 区域快速甩动时，外层到达 `maxOffsetY` 就停。剩余惯性不会传入当前子列表。

这不是漏修的 bug，是 offset 锁定的后果。外层被写成「不许超过 `maxOffsetY`」，系统减速动画到了边界就结束，没有一条通道把 velocity 交给内层。要做跨层惯性，得自己在结束时读 `panGestureRecognizer.velocity`，再对子列表调用 `setContentOffset` 或伪造一段 deceleration。NestedPaging 选择不做，换来的是模型简单、状态可推理。

另外两个边界也值得记住：

- 子列表必须转发 `scrollViewDidScroll`。协议帮不了你自动挂钩，漏了就没有垂直接力。
- Header 高度变化时要 `reloadData()`。Demo 在 `viewDidLayoutSubviews` 里重新测量，并避开拖拽和减速过程，避免滚到一半被重置。

## 结语

NestedPaging 值得看的不是「又一个个人页框架」，而是它把社交 App 里那套手感收成三条很硬的不变量：

1. 垂直两层同时识别手势，位置由 `maxOffsetY` 锁定。
2. Header 可见时，所有子列表都在顶部，不只是当前页。
3. 没有多列表共享 Header 的必要，就不要第二层垂直 `UIScrollView`。

手势竞争交给系统，滚动语义留给自己。四百行之内，抖音和小红书那种页面就能从同一套容器里长出来。仓库在 [github.com/shenxiang11/NestedPaging](https://github.com/shenxiang11/NestedPaging)，示例工程是 `Demo/NestedPagingDemo.xcodeproj`。
