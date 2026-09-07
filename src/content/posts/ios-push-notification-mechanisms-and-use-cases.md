---
title: iOS 推送不是一种通知：从普通提醒到通信通知、图片附件和 Live Activity
description: 从 APNs 接受请求、Notification Service Extension 改写内容，到 iOS 最终决定展示形式，梳理普通提醒、静默推送、图片附件、通信通知、通知内回复、时效性和 Live Activity 的原理与使用场景。
lang: zh
pubDatetime: 2026-09-07T02:45:00Z
featured: true
draft: false
tags:
  - iOS
  - APNs
  - UserNotifications
  - ActivityKit
  - Push Tester
timezone: Asia/Shanghai
---

同样是从 APNs 发到 iPhone，有的通知只有标题和正文，有的右边带一张图，有的把左侧 App 图标换成了联系人头像，有的能直接回复，还有的根本不进通知中心，而是持续更新锁屏和灵动岛。

这些不是一套 payload 换几个字段就能随意拼出来的皮肤。它们背后至少有三层机制：

1. **Provider 负责把请求交给 APNs。**
2. **App 或 Notification Service Extension 有机会处理内容。**
3. **iOS 根据权限、通知类型、设备状态和用户设置决定最终展示。**

理解这三层，比记住十几个 JSON 字段更重要。

## 目录

## APNs 返回 200，只代表它接受了请求

远程推送的最短链路是：

```text
业务服务 / Push Tester
        ↓ HTTP/2
       APNs
        ↓
      iPhone
        ↓
通知扩展 → 系统通知中心 → App
```

Provider 发给 APNs 的不只有 JSON。几个 HTTP Header 决定了这次请求属于谁、是什么类型：

```http
apns-topic: app.example.demo
apns-push-type: alert
apns-priority: 10
```

`apns-topic` 通常是 App 的 Bundle ID；`apns-push-type` 告诉 APNs 这是普通提醒、后台更新还是 Live Activity；设备令牌还区分 App、设备和 Sandbox / Production 环境。

APNs 返回 `200` 的准确含义是：**请求格式、鉴权、topic 和 token 的组合被 APNs 接受。** 它不承诺：

- 手机当前在线；
- 用户开启了通知；
- Focus 没有拦截；
- App 的 Notification Service Extension 成功运行；
- 图片下载完成；
- 系统一定弹横幅。

所以排查推送时，第一步是看 APNs 响应，第二步才是看设备发生了什么。把“服务端成功”和“用户看见”当成一件事，会让后面的判断全部跑偏。

## 普通提醒：把信息交给系统展示

最常见的提醒只需要 `alert`：

```json
{
  "aps": {
    "alert": {
      "title": "订单已发货",
      "body": "包裹正在前往分拨中心"
    },
    "sound": "default",
    "badge": 1
  }
}
```

它适合订单状态、内容更新、日程提醒等“用户现在可以看，也可以稍后看”的事件。App 不需要在收到前运行，系统直接负责通知中心、锁屏、横幅、声音和角标。

`sound` 也可以指定 App Bundle 内的音频文件：

```json
{
  "aps": {
    "alert": {
      "title": "到账",
      "body": "到账 1 个小目标"
    },
    "sound": "custom.caf"
  }
}
```

APNs 只携带文件名，不会传输音频。`custom.caf` 必须随 App 安装到设备；文件不存在或格式不被支持时，系统不会替你从网络下载。

## 静默推送：请求一次后台运行机会

静默推送不面向用户，而是请求系统唤醒 App 做一次短后台更新：

```json
{
  "aps": {
    "content-available": 1
  },
  "sync_cursor": "page-42"
}
```

对应 Header 通常是：

```http
apns-push-type: background
apns-priority: 5
```

适合预取少量数据、刷新缓存、同步状态。它不适合实时聊天、持续定位或必须按时执行的任务，因为 iOS 会根据电量、网络、使用频率和历史行为决定是否以及何时唤醒 App。用户强制退出 App 后，后台推送也不能被当成可靠唤醒通道。

真正的静默推送不要带 `alert`、`sound` 或 `badge`。如果一个通知既有可见提醒又希望触发后台处理，可以使用 `alert` 加 `content-available`，但它属于 **alert push**，不是纯后台推送。

## `mutable-content`：先把通知交给扩展改写

`mutable-content` 不是一种视觉样式。它只是告诉系统：展示前先启动 Notification Service Extension。

```json
{
  "aps": {
    "alert": {
      "title": "新内容",
      "body": "扩展会在展示前处理它"
    },
    "mutable-content": 1
  },
  "image_url": "https://example.com/photo.png"
}
```

系统会启动 `UNNotificationServiceExtension`，调用：

```swift
override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
) {
    let content = request.content.mutableCopy() as! UNMutableNotificationContent

    Task {
        // 解密正文、下载媒体或构造通信通知
        contentHandler(content)
    }
}
```

扩展没有自己的界面，运行时间也不超过约 30 秒。超时、崩溃或没有调用 `contentHandler` 时，系统会退回原始通知。用户看到的现象通常不是“推送失败”，而是**富通知悄悄变回普通通知**。

扩展 target 的 `Info.plist` 必须使用正确的扩展点：

```xml
<key>NSExtensionPointIdentifier</key>
<string>com.apple.usernotifications.service</string>
```

这个值很容易被看起来相近的 `com.apple.notification-service-extension` 误导。后者不是有效的 Notification Service Extension 扩展点；写错后工程可能照样编译、APNs 也照样返回 200，但系统永远不会调用 `didReceive`。

`mutable-content` 适合三类工作：

- 解密通知正文；
- 下载并挂载图片、音频或视频；
- 把普通 alert 更新成 Communication Notification。

它不应该承担长任务，也不能代替 App 的常规后台执行能力。

## 图片附件：右侧缩略图，不是发送者头像

远程 payload 不能直接把 HTTP 图片 URL 塞进系统附件。Notification Service Extension 必须先把文件下载到本地，再创建 `UNNotificationAttachment`：

```swift
let (temporaryURL, _) = try await URLSession.shared.download(from: imageURL)
let localURL = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString)
    .appendingPathExtension("png")

try FileManager.default.moveItem(at: temporaryURL, to: localURL)

let attachment = try UNNotificationAttachment(
    identifier: "rich-image",
    url: localURL,
    options: nil
)

content.attachments = [attachment]
contentHandler(content)
```

系统支持 JPEG、PNG、GIF 等通知附件格式，图片上限为 10 MB。文件扩展名和真实编码必须一致；把 WebP 数据改名成 `.png` 不会变成 PNG。

图片附件的系统形态是：

- 收起时通常在通知右侧显示缩略图；
- 展开后显示更大的媒体内容；
- 左侧仍然是 App 图标。

适合新闻封面、商品图、物流照片和社交动态预览。如果需求是“像微信一样把左侧 App 图标换成发送者头像”，图片附件不是正确机制。

## 通信通知：由 `INSendMessageIntent` 提供消息语义

Communication Notification 从 iOS 15 开始提供。它不是手动布局一个圆形图片，而是把“谁给谁发了什么消息”交给系统。系统拿到消息语义后，才可能把左侧 App 图标替换成发送者头像，并把同一会话正确分组。

工程需要：

- 宿主 App 开启 **Communication Notifications** capability；
- App 的 `Info.plist` 在 `NSUserActivityTypes` 中声明 `INSendMessageIntent`；
- Notification Service Extension 接收带 `mutable-content: 1` 的远程通知；
- 扩展构造发送者、消息 Intent，捐赠 interaction，再更新通知内容。

一对一收到消息时，`recipients` 应该为 `nil`。当前用户是隐含收件人，不要再创建一个 `isMe` participant 塞进去：

```swift
let avatarImage = INImage(imageData: avatarData)
let sender = INPerson(
    personHandle: INPersonHandle(value: senderID, type: .unknown),
    nameComponents: nil,
    displayName: senderName,
    image: avatarImage,
    contactIdentifier: nil,
    customIdentifier: senderID,
    isMe: false,
    suggestionType: .none
)

let intent = INSendMessageIntent(
    recipients: nil,
    outgoingMessageType: .outgoingMessageText,
    content: message,
    speakableGroupName: nil,
    conversationIdentifier: conversationID,
    serviceName: nil,
    sender: sender,
    attachments: nil
)

intent.setImage(avatarImage, forParameterNamed: \.sender)

let interaction = INInteraction(intent: intent, response: nil)
interaction.direction = .incoming
try await interaction.donate()

let updated = try request.content.updating(from: intent)
contentHandler(updated)
```

`updating(from:)` 返回的内容要直接交给 `contentHandler`，不要再复制和修改。群聊则不同：`recipients` 放除发送者和当前用户之外的其他参与者；群头像通过 `speakableGroupName` 参数设置。

适合聊天、私信、协作评论等真正的人际通信。不应该为了“让运营通知有头像”而滥用，否则通知语义、Focus 和系统智能排序都会被污染。

## 通知内回复：Category 决定有哪些操作

通信通知不会凭空获得输入框。App 需要提前注册 `UNTextInputNotificationAction`：

```swift
let reply = UNTextInputNotificationAction(
    identifier: "MESSAGE_REPLY_ACTION",
    title: "回复",
    options: [],
    textInputButtonTitle: "发送",
    textInputPlaceholder: "输入消息"
)

let category = UNNotificationCategory(
    identifier: "MESSAGE_REPLY",
    actions: [reply],
    intentIdentifiers: ["INSendMessageIntent"],
    options: []
)

UNUserNotificationCenter.current()
    .setNotificationCategories([category])
```

payload 用 `category` 把通知和操作集合关联起来：

```json
{
  "aps": {
    "alert": {
      "title": "Alex Chen",
      "body": "中午有空吗？"
    },
    "mutable-content": 1,
    "category": "MESSAGE_REPLY"
  },
  "conversation_id": "conversation-alex"
}
```

用户展开通知、输入文字后，App 在通知中心代理中收到 `UNTextInputNotificationResponse`：

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
) async {
    guard
        response.actionIdentifier == "MESSAGE_REPLY_ACTION",
        let reply = response as? UNTextInputNotificationResponse
    else { return }

    await messageAPI.send(
        text: reply.userText,
        conversationID: response.notification.request.content
            .userInfo["conversation_id"] as? String
    )
}
```

系统只负责安全地收集输入。微信把文字真正发出去，仍然依赖自己的消息服务。做 Demo 时可以把 `userText` 存进 `UserDefaults`，下次打开 App 再显示。

## 时效性和关键通知：能否打断用户是权限，不是文案

iOS 的 interruption level 大致表达四种打扰强度：

- `passive`：只进入通知列表，不主动亮屏或发声；
- `active`：普通提醒；
- `time-sensitive`：时效性提醒，在用户允许时可突破部分 Focus 限制；
- `critical`：关键提醒，可绕过静音和勿扰。

时效性 payload：

```json
{
  "aps": {
    "alert": {
      "title": "司机即将到达",
      "body": "预计 2 分钟后到达上车点"
    },
    "interruption-level": "time-sensitive",
    "relevance-score": 1,
    "sound": "default"
  }
}
```

适合打车到达、外卖送达、账户安全等短时间后就失去价值的提醒。它不是“重要通知”的通用加速器，用户可以针对单个 App 关闭时效性通知。

`critical` 面向医疗、安全、公共预警等极少数场景，需要 Apple 单独批准 entitlement，并且 App 还要请求 Critical Alerts 权限。普通业务不能仅靠 payload 把自己升级成关键通知。

## Live Activity：持续状态不是一串横幅

外卖进度、比赛比分、网约车位置会持续变化。每次变化都发一条普通通知，用户只会得到一叠过期横幅。Live Activity 把“同一件事的当前状态”固定在锁屏和灵动岛，更新原有界面，而不是不断新增通知。

它走 APNs，但使用另一套 token 和 Header：

```http
apns-push-type: liveactivity
apns-topic: app.example.demo.push-type.liveactivity
apns-priority: 10
```

远程开始活动使用 Push-to-Start Token；更新和结束已经存在的活动，要使用该 Activity 自己的 push token。普通 APNs 设备令牌不能混用。

更新 payload 的核心是 `event` 和 `content-state`：

```json
{
  "aps": {
    "timestamp": 1788739200,
    "event": "update",
    "content-state": {
      "status": "司机已到达",
      "progress": 1
    },
    "alert": {
      "title": "车辆已到达",
      "body": "请前往上车点"
    }
  }
}
```

`alert` 是可选的更新提醒，不等于创建普通通知横幅。ActivityKit 的界面由 Widget Extension 提供；Live Activity 自己不能联网，动态状态由 App 或 ActivityKit push 更新。

## Notification Content Extension：只有需要自定义展开界面时再用

Notification Service Extension 负责**改内容**，不画 UI。`UNNotificationContentExtension` 才负责通知展开后的自定义界面。

它适合需要专门排版、媒体控件或交互组件的通知。普通图片附件和通信头像都有系统样式，不需要为了“富通知”再加一个 Content Extension。系统 UI 通常更一致，也更容易适配未来 iOS。

## App 在前台，为什么以前不弹、现在又弹了

远程通知到达前台 App 时，系统会询问 `UNUserNotificationCenterDelegate`：

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound, .badge]
}
```

返回 `.banner` 后，前台也会出现横幅；返回 `[]` 则只由 App 自己处理。这里不会产生第二条推送，决定的只是同一条通知是否使用系统界面展示。

前台展示与 Notification Service Extension 是两件事：远程通知仍然应先经过扩展，再把最终内容交给前台代理。

## 怎么选

可以把需求按下面的顺序判断：

1. **用户需要看到吗？**  
   不需要，只想刷新少量数据，用静默推送；需要则继续。

2. **内容在发送时已经完整吗？**  
   完整就用普通 alert；需要解密、下载或改写，增加 `mutable-content` 和 Notification Service Extension。

3. **要显示媒体，还是要表达“谁发来的消息”？**  
   媒体用 `UNNotificationAttachment`；联系人头像和会话语义用 Communication Notification。

4. **用户要直接操作吗？**  
   用 category 注册普通 Action 或文本输入 Action。

5. **它是否很快过期？**  
   合理使用 `time-sensitive`；只有获批的特殊场景才使用 `critical`。

6. **它是一件持续变化的事情吗？**  
   用 Live Activity 更新同一状态，不要制造一串横幅。

## 富通知退化成普通通知，按这条链路查

遇到“APNs 成功，但图片和头像都没显示”，不要先改 Intent。按执行顺序查：

1. PushTester / Provider 历史里是否真的是 APNs `200`；
2. token 是否属于当前安装、当前环境和当前 topic；
3. Header 是否为 `apns-push-type: alert`；
4. `aps.alert` 是否是带 title / body 的字典；
5. `mutable-content` 是否在 `aps` 内且数值为 `1`；
6. App Bundle 是否真的嵌入 `.appex`；
7. 扩展点是否严格等于 `com.apple.usernotifications.service`；
8. `didReceive` 是否留下日志；
9. 下载文件是否为本地 URL、受支持格式并小于限制；
10. `contentHandler` 是否在超时前且只调用一次；
11. 通信通知的 interaction 是否成功 donate；
12. `updating(from:)` 返回值是否未经再次修改就交给系统。

如果图片附件和通信头像同时退化，优先怀疑扩展没运行；如果只有图片失败，查下载和文件格式；如果只有头像失败，再查 capability、`INPerson`、Intent participants 和 `updating(from:)`。

模拟器拖入 `.apns` 文件或执行 `simctl push` 不等于真实 APNs 链路。它适合看普通 payload，但不能作为 Notification Service Extension 的最终验证。富通知至少要用真机真实推送，或者向支持 APNs Sandbox 的模拟器发送真正的远程通知。

## 结语

iOS 推送最容易混淆的地方，是把“传输方式”和“展示样式”揉成一个概念：

- APNs 负责把请求送到设备；
- payload 声明系统行为和业务数据；
- Notification Service Extension 在展示前改内容；
- Intent 给通知补上通信语义；
- Attachment 提供右侧媒体；
- Category 提供回复等操作；
- interruption level 表达打扰强度；
- ActivityKit 维护持续状态；
- 最终怎么显示，仍由系统和用户权限决定。

我把这些路径做进了 [Push Tester](/pushtester/) 的内置模板和 Sample App：可以在 Mac 上编辑 payload、检查实际 APNs Header，再到真机对照普通提醒、图片附件、通信通知、通知内回复、时效性和 Live Activity。源码在 [github.com/shenxiang11/PushTester](https://github.com/shenxiang11/PushTester)。

进一步阅读：

- [Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification)
- [UNNotificationServiceExtension](https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension)
- [Implementing communication notifications](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications)
- [UNNotificationAttachment](https://developer.apple.com/documentation/usernotifications/unnotificationattachment)
- [Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)
