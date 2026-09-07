---
title: "iOS push is not one kind of notification: from alerts to communication notifications, image attachments, and Live Activities"
description: From APNs accepting a request, through a Notification Service Extension rewriting content, to iOS deciding how it appears. Alert, silent push, image attachment, communication notification, in-notification reply, time-sensitive, and Live Activity — the mechanisms and when to use them.
lang: en
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

The same APNs delivery to an iPhone can land as a title and body, a thumbnail on the right, a contact photo in place of the App icon, a reply field, or nothing in Notification Center at all — just a lock screen and Dynamic Island that keep updating.

These are not skins you mix by swapping a few payload fields. There are at least three layers underneath:

1. **The provider is responsible for handing the request to APNs.**
2. **The App or a Notification Service Extension gets a chance to process the content.**
3. **iOS decides the final presentation from permission, notification type, device state, and user settings.**

Those three layers matter more than memorizing a dozen JSON keys.

## Table of contents

## APNs returning 200 only means it accepted the request

The shortest remote-push path is:

```text
Your service / Push Tester
        ↓ HTTP/2
       APNs
        ↓
      iPhone
        ↓
Notification extension → system Notification Center → App
```

What the provider sends APNs is more than JSON. A few HTTP headers decide who this request belongs to and what kind it is:

```http
apns-topic: app.example.demo
apns-push-type: alert
apns-priority: 10
```

`apns-topic` is usually the App's Bundle ID. `apns-push-type` tells APNs whether this is an alert, a background update, or a Live Activity. Device tokens also distinguish App, device, and Sandbox / Production.

A `200` from APNs means exactly this: **the combination of request format, auth, topic, and token was accepted.** It does not promise:

- the phone is online right now;
- the user has notifications on;
- Focus did not intercept it;
- the App's Notification Service Extension ran successfully;
- the image finished downloading;
- the system will show a banner.

So when a push fails, first look at the APNs response, then look at what happened on the device. Treating “the server succeeded” and “the user saw it” as one event sends every later judgment off the rails.

## Alert: hand the information to the system to display

The most common alert only needs `alert`:

```json
{
  "aps": {
    "alert": {
      "title": "Order shipped",
      "body": "The parcel is on its way to the hub"
    },
    "sound": "default",
    "badge": 1
  }
}
```

It fits order status, content updates, calendar reminders — events the user can look at now or later. The App does not have to be running beforehand. The system owns Notification Center, the lock screen, banners, sound, and the badge.

`sound` can also name an audio file inside the App bundle:

```json
{
  "aps": {
    "alert": {
      "title": "Payment received",
      "body": "A modest fortune just landed"
    },
    "sound": "custom.caf"
  }
}
```

APNs only carries the filename. It does not transmit audio. `custom.caf` must be installed with the App. If the file is missing or the format is unsupported, the system will not fetch it from the network for you.

## Silent push: ask for one background run

A silent push is not for the user. It asks the system to wake the App for a short background update:

```json
{
  "aps": {
    "content-available": 1
  },
  "sync_cursor": "page-42"
}
```

The matching headers are usually:

```http
apns-push-type: background
apns-priority: 5
```

It fits prefetching a little data, refreshing a cache, or syncing state. It does not fit realtime chat, continuous location, or work that must run on a schedule. iOS decides whether and when to wake the App from battery, network, usage, and history. After the user force-quits the App, background push is not a reliable wake channel either.

A true silent push should not carry `alert`, `sound`, or `badge`. If a notification is both visible and meant to trigger background work, you can combine `alert` with `content-available`. That is still an **alert push**, not a pure background push.

## `mutable-content`: hand the notification to an extension first

`mutable-content` is not a visual style. It only tells the system: start the Notification Service Extension before display.

```json
{
  "aps": {
    "alert": {
      "title": "New content",
      "body": "The extension will process this before display"
    },
    "mutable-content": 1
  },
  "image_url": "https://example.com/photo.png"
}
```

The system launches `UNNotificationServiceExtension` and calls:

```swift
override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
) {
    let content = request.content.mutableCopy() as! UNMutableNotificationContent

    Task {
        // Decrypt the body, download media, or build a communication notification
        contentHandler(content)
    }
}
```

The extension has no UI of its own, and it does not get more than about 30 seconds. On timeout, crash, or a missing `contentHandler` call, the system falls back to the original notification. What the user sees is usually not “the push failed,” but **a rich notification quietly becoming a plain one**.

The extension target's `Info.plist` must use the correct extension point:

```xml
<key>NSExtensionPointIdentifier</key>
<string>com.apple.usernotifications.service</string>
```

That value is easy to mix up with the lookalike `com.apple.notification-service-extension`. The latter is not a valid Notification Service Extension point. The project may still compile, APNs may still return 200, and the system will never call `didReceive`.

`mutable-content` fits three jobs:

- decrypting the notification body;
- downloading and attaching an image, audio, or video;
- turning a plain alert into a Communication Notification.

It should not take on long work, and it cannot replace the App's ordinary background execution.

## Image attachment: a thumbnail on the right, not the sender's avatar

A remote payload cannot drop an HTTP image URL straight into a system attachment. The Notification Service Extension must download the file locally first, then create a `UNNotificationAttachment`:

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

The system supports JPEG, PNG, GIF, and other notification attachment formats. Images are capped at 10 MB. The file extension and the real encoding must match. Renaming WebP data to `.png` does not make it PNG.

The system shape of an image attachment is:

- collapsed, a thumbnail usually on the right of the notification;
- expanded, larger media;
- the App icon still on the left.

It fits news covers, product photos, delivery pictures, and social previews. If the need is “replace the App icon on the left with the sender's avatar, like WeChat,” an image attachment is the wrong mechanism.

## Communication notifications: `INSendMessageIntent` supplies the message semantics

Communication Notifications have been available since iOS 15. You do not lay out a circular image by hand. You hand “who sent what to whom” to the system. Only after it has those message semantics can it replace the App icon on the left with the sender's avatar and group the same conversation correctly.

The project needs:

- the **Communication Notifications** capability on the host App;
- `INSendMessageIntent` declared in the App's `Info.plist` under `NSUserActivityTypes`;
- the Notification Service Extension receiving a remote notification with `mutable-content: 1`;
- the extension building the sender and message intent, donating the interaction, then updating the notification content.

For a one-to-one incoming message, `recipients` should be `nil`. The current user is the implied recipient. Do not invent an `isMe` participant and stuff it in:

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

Hand the value from `updating(from:)` straight to `contentHandler`. Do not copy it and mutate it again. Group chats are different: `recipients` holds everyone except the sender and the current user; the group avatar is set through the `speakableGroupName` parameter.

It fits chat, DMs, and collaboration comments — real person-to-person communication. Do not abuse it so a marketing notice can have an avatar. That pollutes notification semantics, Focus, and the system's intelligent ranking.

## In-notification reply: the category decides which actions exist

A communication notification does not magically grow a text field. The App has to register a `UNTextInputNotificationAction` beforehand:

```swift
let reply = UNTextInputNotificationAction(
    identifier: "MESSAGE_REPLY_ACTION",
    title: "Reply",
    options: [],
    textInputButtonTitle: "Send",
    textInputPlaceholder: "Type a message"
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

The payload uses `category` to bind the notification to that set of actions:

```json
{
  "aps": {
    "alert": {
      "title": "Alex Chen",
      "body": "Free for lunch?"
    },
    "mutable-content": 1,
    "category": "MESSAGE_REPLY"
  },
  "conversation_id": "conversation-alex"
}
```

After the user expands the notification and types, the App receives a `UNTextInputNotificationResponse` in the notification center delegate:

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

The system only collects the input safely. WeChat still relies on its own messaging service to actually send the text. In a demo you can stash `userText` in `UserDefaults` and show it the next time the App opens.

## Time-sensitive and critical alerts: interrupting the user is a permission, not copy

iOS interruption levels roughly describe four degrees of interruption:

- `passive`: enters the notification list only; does not light the screen or play sound;
- `active`: a normal alert;
- `time-sensitive`: a time-sensitive alert; with user permission it can break through some Focus limits;
- `critical`: a critical alert; can bypass mute and Do Not Disturb.

A time-sensitive payload:

```json
{
  "aps": {
    "alert": {
      "title": "Your driver is almost here",
      "body": "About 2 minutes from the pickup point"
    },
    "interruption-level": "time-sensitive",
    "relevance-score": 1,
    "sound": "default"
  }
}
```

It fits a ride arriving, a delivery at the door, account security — reminders that lose value after a short window. It is not a generic accelerator for “important notifications.” Users can turn time-sensitive notifications off per App.

`critical` is for medical, safety, and public-warning cases, a very small set. It needs an Apple-approved entitlement, and the App still has to request Critical Alerts permission. Ordinary products cannot promote themselves to critical alerts with a payload alone.

## Live Activity: ongoing state is not a stack of banners

Delivery progress, a live score, a rideshare location keep changing. Send a plain notification for every change and the user only gets a pile of expired banners. A Live Activity pins “the current state of the same thing” to the lock screen and Dynamic Island, and updates that interface instead of minting new notifications.

It still goes through APNs, but with a different token and headers:

```http
apns-push-type: liveactivity
apns-topic: app.example.demo.push-type.liveactivity
apns-priority: 10
```

Remote start uses a Push-to-Start token. Updates and ends of an existing activity use that Activity's own push token. Do not mix them with the ordinary APNs device token.

The core of an update payload is `event` and `content-state`:

```json
{
  "aps": {
    "timestamp": 1788739200,
    "event": "update",
    "content-state": {
      "status": "Driver has arrived",
      "progress": 1
    },
    "alert": {
      "title": "Your car is here",
      "body": "Please go to the pickup point"
    }
  }
}
```

`alert` is an optional update reminder. It is not the same as creating a plain notification banner. ActivityKit UI comes from a Widget Extension. A Live Activity cannot network on its own; dynamic state is updated by the App or by ActivityKit push.

## Notification Content Extension: only when you need a custom expanded UI

A Notification Service Extension **changes content**. It does not draw UI. `UNNotificationContentExtension` is what owns the custom interface after the notification expands.

It fits notifications that need their own layout, media controls, or interactive components. Ordinary image attachments and communication avatars already have system styles. You do not need a Content Extension just to make a “rich notification.” System UI is usually more consistent, and easier to keep working on future iOS.

## Why it used not to banner in the foreground, and now it does

When a remote notification arrives at a foreground App, the system asks `UNUserNotificationCenterDelegate`:

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound, .badge]
}
```

Return `.banner` and a banner appears in the foreground too. Return `[]` and only the App handles it. This does not create a second push. It only decides whether the same notification uses the system UI.

Foreground presentation and the Notification Service Extension are two different things. A remote notification should still go through the extension first, then hand the final content to the foreground delegate.

## How to choose

Judge the need in this order:

1. **Does the user need to see it?**  
   If not, and you only want to refresh a little data, use a silent push. If yes, continue.

2. **Is the content complete at send time?**  
   If it is, use a plain alert. If you need to decrypt, download, or rewrite, add `mutable-content` and a Notification Service Extension.

3. **Do you need media, or “who sent this message”?**  
   Media uses `UNNotificationAttachment`. A contact avatar and conversation semantics use a Communication Notification.

4. **Does the user need to act on it directly?**  
   Register ordinary actions or a text-input action with a category.

5. **Does it expire soon?**  
   Use `time-sensitive` when that is honest. Use `critical` only for approved special cases.

6. **Is it one thing that keeps changing?**  
   Update that state with a Live Activity. Do not manufacture a stack of banners.

## When a rich notification falls back to a plain one, walk this path

If APNs succeeded but neither the image nor the avatar showed up, do not start by rewriting the Intent. Check in execution order:

1. In Push Tester / provider history, was it really an APNs `200`;
2. Does the token belong to this install, this environment, and this topic;
3. Is the header `apns-push-type: alert`;
4. Is `aps.alert` a dictionary with title / body;
5. Is `mutable-content` inside `aps` and equal to `1`;
6. Is a `.appex` actually embedded in the App bundle;
7. Is the extension point exactly `com.apple.usernotifications.service`;
8. Does `didReceive` leave a log;
9. Is the downloaded file a local URL, a supported format, and under the size limit;
10. Is `contentHandler` called once, before timeout;
11. Did the communication notification's interaction donate succeed;
12. Was the return value of `updating(from:)` handed to the system without further mutation.

If image attachment and communication avatar both fall back, suspect the extension never ran. If only the image fails, check the download and file format. If only the avatar fails, then check the capability, `INPerson`, Intent participants, and `updating(from:)`.

Dragging an `.apns` file into the Simulator or running `simctl push` is not the real APNs path. It is fine for looking at a plain payload. It is not the final proof for a Notification Service Extension. Rich notifications need a real push to a real device, or a genuine remote notification to a Simulator that supports APNs Sandbox.

## Closing

The easiest place to get lost with iOS push is folding “how it is delivered” and “how it is shown” into one idea:

- APNs is responsible for getting the request to the device;
- the payload declares system behavior and business data;
- the Notification Service Extension rewrites content before display;
- an Intent adds communication semantics to the notification;
- an attachment supplies media on the right;
- a category supplies actions such as reply;
- interruption level describes how hard to interrupt;
- ActivityKit maintains ongoing state;
- what actually appears is still decided by the system and the user's permissions.

I built these paths into [Push Tester](/en/pushtester/) — bundled templates and a sample app. Edit the payload on a Mac, inspect the real APNs headers, then compare alert, image attachment, communication notification, in-notification reply, time-sensitive, and Live Activity on a real device. Source is at [github.com/shenxiang11/PushTester](https://github.com/shenxiang11/PushTester).

Further reading:

- [Generating a remote notification](https://developer.apple.com/documentation/usernotifications/generating-a-remote-notification)
- [UNNotificationServiceExtension](https://developer.apple.com/documentation/usernotifications/unnotificationserviceextension)
- [Implementing communication notifications](https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications)
- [UNNotificationAttachment](https://developer.apple.com/documentation/usernotifications/unnotificationattachment)
- [Starting and updating Live Activities with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)
