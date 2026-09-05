---
title: "VAPKit: Transparent gift animations are two samples from the same frame"
description: A walk through the VAPKit source. H.264 cannot carry Alpha, so VAP paints grayscale transparency into the same image. The player reads vapc, decodes with AVAssetReader, and composites rgbFrame / aFrame in Metal.
lang: en
pubDatetime: 2026-09-03T10:49:00Z
featured: true
draft: false
tags:
  - iOS
  - Metal
  - VAPKit
  - 动画
timezone: Asia/Shanghai
---

Tap a gift in a live room and a translucent rabbit flies across the screen. It looks like a video with Alpha. It isn't. H.264 / H.265 have no transparent channel. Tencent [VAP](https://github.com/Tencent/vap) paints the color picture and a grayscale alpha map into **the same frame**, then stuffs a JSON config into a top-level `vapc` box in the MP4. A normal player treats it as an opaque video. To overlay it on a live feed, you have to unpack the geometry and composite it yourself.

[VAPKit](https://github.com/shenxiang11/vapkit) is a standalone iOS player, not a wrapper around the official SDK. At runtime it depends on neither FFmpeg nor `AVPlayer`. It reads `rgbFrame` / `aFrame`, decodes with `AVAssetReader`, then samples twice and composites once in Metal.

## Table of contents

## What VAP actually is

There is no special `.vap` container. A VAP file is an ordinary MP4. Each frame looks like this:

```
One encoded frame (videoW × videoH)
├── rgbFrame   [x, y, w, h]   color, composited on black
└── aFrame     [x, y, w, h]   grayscale, R = G = B = source Alpha
```

The config is JSON. Native players pull it from the top-level `vapc` box. The web side usually ships a sidecar, because browsers are bad at custom boxes. ISO BMFF ignores boxes it does not know, so the same file still plays as a normal video in QuickTime.

`info` has two sizes. Mixing them up is the most common player bug:

| | Logical size `w` × `h` | Encoded size `videoW` × `videoH` |
| --- | --- | --- |
| What it is | The animation size shown to the user, equal to `rgbFrame` | The size of the packed image |
| Who uses it | View layout | UV denominator, decode checks |

Authoring tools also leave a 4 or 8 pixel gutter between the two regions, then pad width and height to multiples of 16. `1136 − 750 − 375 = 11` is not a protocol constant. It is gutter plus padding. Players should **not invent the layout**. Trust the rectangles in the JSON.

The protocol version must be `v == 2`. An MP4 with no `vapc` and no sidecar is treated as invalid by VAPKit. It will not guess a left/right split.

## Walk the top-level boxes first

`vapc` is not always right after `ftyp`. The official demo is `ftyp → vapc → moov`. Assets in the wild can be `ftyp → moov → vapc → mdat`. The parser does one job: walk top-level boxes, and when it hits `vapc`, hand out the UTF-8 JSON that follows.

```swift
public static func extractVAPCPayload(from mp4: Data) throws -> Data? {
    var offset = 0
    while offset + 8 <= mp4.count {
        let size = readUInt32BE(mp4, offset: offset)
        guard size >= 8 else { throw VAPError.invalidVideo }
        let end = offset + Int(size)
        guard end <= mp4.count else { throw VAPError.invalidVideo }
        let type = mp4.subdata(in: (offset + 4)..<(offset + 8))
        if type == vapcType {
            return mp4.subdata(in: (offset + 8)..<end)
        }
        offset = end
    }
    return nil
}
```

After the JSON enters `parseInfo`, the hard constraints are tighter than they look:

- `v` must be `2`, otherwise `unsupportedVersion`
- `f`, `fps`, `w`, `h`, `videoW`, `videoH` must all be positive
- `aFrame` / `rgbFrame` must sit inside the encoded frame
- `rgbFrame` width and height must equal `w` / `h`

Unknown fields are dropped. Assets in the wild sometimes carry `"codeTag": ["17ae.com"]`. Official tools never write it, and official players never read it. VAPKit stores it as an optional array and ignores it for UV math.

`src` / `frame` are parsed and kept for a future VAPX fusion path. The current render path does not touch them.

## Do not use AVPlayer

`AVPlayer` + `AVPlayerLayer` blit the whole frame. VAP needs two rectangles sampled from one texture, then an `RGBA` output. The system player cannot do that.

Official iOS uses VideoToolbox and decodes NV12 by sample index. VAPKit starts with a shorter path that is enough to play: `AVAssetReader` emits BGRA, Metal-compatible, prefetching at most 4 frames.

```swift
let output = AVAssetReaderTrackOutput(
    track: videoTrack,
    outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferMetalCompatibilityKey as String: true,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as CFDictionary,
    ]
)
```

The decoder does not know about Alpha. It only hands out a `CVPixelBuffer` on media time. Frames that have fallen behind the window are dropped; when the window is empty, prefetch again. Seek / loop is not a clock tweak. Tear down the current reader and reopen it from a new `timeRange`.

```swift
func copyPixelBuffer(forMediaTime mediaTime: TimeInterval) -> CVPixelBuffer? {
    let buffer: CVPixelBuffer? = withLock {
        while pending.count > 1, pending[0].time + 0.001 < mediaTime {
            pending.removeFirst()
        }
        return pending.first?.buffer
    }
    if buffer != nil { prefetch() }
    return buffer
}
```

Decoding all 151 frames of a 1136×1632 NV12 clip at once is about 420 MB. A sliding window is a memory constraint, not an optimization.

## The clock picks the frame; decode follows

The playback clock cannot be `Timer` + `sleep(1/fps)`. The view hangs a `CADisplayLink`. Each tick hands `targetTimestamp` to the player. The player turns the anchored media time into “which second should be on screen now,” then asks the decoder for that frame.

```swift
private func mediaTime(at hostTime: CFTimeInterval) -> TimeInterval {
    guard state == .playing else { return anchorMediaTime }
    return max(0, anchorMediaTime + (hostTime - anchorHostTime))
}
```

On pause, freeze `anchorMediaTime`. Do not record a wall-clock deadline, or resume will drift. Duration follows the JSON: `duration = f / fps`, not the track duration from `ffprobe`. The official demo is `80 / 25 = 3.2s` and matches the container. When they disagree, the authoring frame count still wins, so completion and looping stay aligned with fusion attachments.

Gift scenes are usually `loop = false`: play once per tap. If it loops after the end, the decoder resets to 0 and the anchors are stamped again. If it does not loop, it stops on the last frame. When decode is late, drop behind-frames and chase the clock. Do not stop the clock to wait.

The view never advances time. `VAPMetalView` attaches the display link only while it is in a window, and tears it down offscreen. Each frame asks the player for a buffer; if there is no new one, reuse the last to avoid flashing empty.

```swift
if let fresh = player.copyPixelBuffer(forHostTime: link.targetTimestamp) {
    lastBuffer = fresh
}
guard let lastBuffer else { return }
renderer.render(pixelBuffer: lastBuffer, info: info, drawable: drawable, ...)
```

`intrinsicContentSize` uses `info.width` / `info.height`, not the encoded frame. Gift overlays are laid out in logical size. UV is computed from encoded size.

## Metal: one texture, two UV sets

The fragment shader is short enough to read in one pass:

```c
float4 rgb = videoTexture.sample(linearSampler, input.rgbUV);
float4 alpha = videoTexture.sample(linearSampler, input.alphaUV);
return float4(rgb.rgb, alpha.r);
```

Alpha comes from **R**. Encoding writes R=G=B, and all three official clients do the same. Do not take `.a` (the video pixels themselves are opaque), and do not average channels first.

Vertex order matches official iOS: BL, TL, BR, TR. Image-space `y / height` maps straight onto Metal `v`. WebGL’s `UNPACK_FLIP_Y` is the opposite. Copy that over and Alpha will sit above or below RGB.

The UV denominator is the **actual texture size**, not the dead numbers `videoW` / `videoH` from JSON. Decode buffers are often 16-aligned and a few columns wider than the authoring size. Divide by JSON, then sample the padded texture, and Alpha slides into the black gutter.

```swift
private func uvRect(_ rect: VAPRect, videoWidth: Int, videoHeight: Int) -> SIMD4<Float> {
    let width = max(Float(videoWidth), 1)
    let height = max(Float(videoHeight), 1)
    return SIMD4(
        Float(rect.x) / width,
        Float(rect.y) / height,
        Float(rect.maxX) / width,
        Float(rect.maxY) / height
    )
}
```

Blending matches official Metal: `sourceAlpha` / `oneMinusSourceAlpha`. What the encoder wrote into the RGB region is actually premultiplied-on-black color, `rgb_stored = src.rgb * src.a`. The official shader still blends as straight Alpha. VAPKit matches the official output first and does not “fix” premultiply in the shader.

The layer itself is transparent: `CAMetalLayer.isOpaque = false`, cleared to `(0,0,0,0)`. The live feed sits underneath. The gift only contributes pixels that should light up.

## Integration is one player

SwiftUI and UIKit share `VAPPlayer`. Views only display. Scheduling lives in the player.

```swift
@StateObject private var player = VAPPlayer()

VAPView(player: player)
    .allowsHitTesting(false)
    .task {
        try? await player.load(videoURL: url)
        player.loop = false
        player.play()
    }
```

If the MP4 has `vapc`, you do not need another JSON. When the web side strips the box, or a remux drops `vapc`, pass a sidecar explicitly:

```swift
try await player.load(videoURL: videoURL, manifestURL: jsonURL)
```

The public API never shows `AVAssetReader`, `CVPixelBuffer`, or `MTLDevice`. The demo is a live gifting UI: a full-screen looping background, a gift bar at the bottom, and the VAP only plays when you tap “Send to 冬去春来.” The gift you can send today is “星际兔” (`user_246106.mp4`).

## What this model has not done yet

VAPX fusion attachments — pasting a user’s nickname and avatar into the animation with a per-frame mask — still have `src` / `frame` parsed, but nothing is rendered. There is no remote download either. Loading stops at local File / Bundle.

The color path also differs from official. Official decodes full-range NV12, defaults to BT.601, and switches to 709 via `kCVImageBufferYCbCrMatrixKey`. VAPKit currently takes BGRA, skips the YUV matrix, and loses a chance to match official pixels. An A/B comparison would need NV12 again.

Authoring tools emit HEVC (`hvc1`). The simulator and some older devices have no hardware decode. Official asks `VTIsHardwareDecodeSupported` first. VAPKit currently leaves that to `AVAssetReader`; failure is `decoderInitializationFailed`, with no FFmpeg software fallback.

When JSON and the real track disagree, the documented contract is to stop and report `invalidVideo`, not to scale UV and “make it play.” `load` still does not compare `videoW/H` against the track. That cut is still in the contract, not in the code.

## Closing

VAPKit is worth reading not because it is “yet another gift player,” but because it collapses transparent animation into three hard invariants:

1. Geometry comes only from JSON rectangles and the encoded frame size. Do not hardcode 750 / 4 / 8, and do not guess a left/right split.
2. The clock picks the frame that should be on screen; decode follows. Do not `sleep(1/fps)`, and do not use `AVPlayer` as a time source.
3. Compositing is two samples from the same texture: `rgb.rgb` plus `alpha.r`. Do not flip Alpha, rotate it, or take the wrong channel.

H.264 cannot carry transparency, so paint transparency into the picture. The repo is [github.com/shenxiang11/vapkit](https://github.com/shenxiang11/vapkit). The sample project is `Examples/DemoApp/DemoApp.xcodeproj`.
