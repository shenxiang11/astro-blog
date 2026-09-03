---
title: VAPKit：礼物透明动画，本质是同一帧里采两次
description: 拆 VAPKit 源码。H.264 带不走 Alpha，VAP 把灰阶透明度画进同一张图；播放器读 vapc、AVAssetReader 解码，Metal 按 rgbFrame / aFrame 合成。
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

直播间点一次礼物，屏幕上飞出一只半透明的兔子。看起来像带 Alpha 的视频，其实不是。H.264 / H.265 没有透明通道。腾讯 [VAP](https://github.com/Tencent/vap) 的做法是：把彩色画面和一张灰阶透明度画进**同一帧**，配置 JSON 打进 MP4 顶层的 `vapc` box。普通播放器当不透明视频播；要叠在直播画面上，得自己拆几何、自己合成。

[VAPKit](https://github.com/shenxiang11/vapkit) 是一套独立的 iOS 播放器，不是官方 SDK 的封装。运行时不依赖 FFmpeg，也不走 `AVPlayer`。它读出 `rgbFrame` / `aFrame`，用 `AVAssetReader` 解码，再用 Metal 采两次、合成一次。

## 目录

## VAP 到底是什么

没有特殊的 `.vap` 容器。所谓 VAP 文件，就是一份普通 MP4，每一帧长这样：

```
一张编码帧（videoW × videoH）
├── rgbFrame   [x, y, w, h]   彩色，叠在黑底上
└── aFrame     [x, y, w, h]   灰阶，R = G = B = 源 Alpha
```

配置是一份 JSON。原生播放器从顶层 `vapc` box 取出；Web 侧通常另带一份 sidecar，因为浏览器不好读自定义 box。ISO BMFF 会忽略不认识的 box，所以同一份文件在 QuickTime 里仍能当普通视频播。

`info` 里有两套尺寸，混用是最常见的播放器 bug：

| | 逻辑尺寸 `w` × `h` | 编码尺寸 `videoW` × `videoH` |
| --- | --- | --- |
| 是什么 | 展示给用户的动画大小，等于 `rgbFrame` | 整张打包图的大小 |
| 谁用 | 视图 layout | UV 分母、解码校验 |

作者工具还会在两块内容之间留 4 或 8 像素缝，再把宽高补到 16 的倍数。`1136 − 750 − 375 = 11` 不是协议常数，是缝加 padding。播放器**不要自己推布局**，只信 JSON 里的矩形。

协议版本必须是 `v == 2`。没有 `vapc`、也没有 sidecar 的 MP4，VAPKit 直接当无效视频，不会按「左右对半」去猜。

## 先走路顶层 box

`vapc` 不一定紧跟在 `ftyp` 后面。官方 demo 是 `ftyp → vapc → moov`，市面上的素材也可能是 `ftyp → moov → vapc → mdat`。解析器只做一件事：沿顶层 box 往前走，碰到 `vapc` 就把后面的 UTF-8 JSON 交出去。

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

JSON 进 `parseInfo` 之后，硬约束比看起来多：

- `v` 必须是 `2`，否则 `unsupportedVersion`
- `f`、`fps`、`w`、`h`、`videoW`、`videoH` 都得是正数
- `aFrame` / `rgbFrame` 必须落在编码帧里面
- `rgbFrame` 的宽高必须等于 `w` / `h`

未知字段丢掉。市面素材里偶尔有 `"codeTag": ["17ae.com"]`，官方工具从不写、官方播放器也不读。VAPKit 存成可选数组，UV 计算完全不理它。

`src` / `frame` 会解析并留着，给以后的 VAPX 融合用。当前渲染路径不碰它们。

## 不要用 AVPlayer

`AVPlayer` + `AVPlayerLayer` 整帧贴上去。VAP 需要的是：同一张纹理上采两个矩形，再输出 `RGBA`。系统播放器做不到。

官方 iOS 走 VideoToolbox，按 sample index 解 NV12。VAPKit 先用更短的路径证明能播：`AVAssetReader` 吐 BGRA，Metal 兼容，预读最多 4 帧。

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

解码器不知道 Alpha。它只按媒体时间交出 `CVPixelBuffer`。窗口里过期的帧丢掉，空了再预读。seek / 循环不是改时钟就完事，要拆掉当前 reader，从新的 `timeRange` 重开。

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

整段 151 帧、1136×1632 的 NV12 一次解开大约 420 MB。滑动窗口是内存上的硬选择，不是优化项。

## 时钟选帧，解码跟着走

播放时钟不能是 `Timer` + `sleep(1/fps)`。视图挂 `CADisplayLink`，每一跳把 `targetTimestamp` 交给播放器，播放器用锚定的媒体时间算出「现在该是哪一秒」，再向解码器要那一帧。

```swift
private func mediaTime(at hostTime: CFTimeInterval) -> TimeInterval {
    guard state == .playing else { return anchorMediaTime }
    return max(0, anchorMediaTime + (hostTime - anchorHostTime))
}
```

暂停时冻结 `anchorMediaTime`，不记墙上的 deadline，恢复才不会漂。时长跟 JSON 走：`duration = f / fps`，不是 `ffprobe` 的 track duration。官方 demo 是 `80 / 25 = 3.2s`，和容器对得上；对不齐时仍以作者帧数为准，完成和循环才不会和融合附件各走各的。

礼物场景一般 `loop = false`，点一次播一遍。播完如果循环，解码器复位到 0，锚点重打；不循环就停在末尾。解码晚了，丢掉落后帧去追时钟，不要把时钟停下来等。

视图自己不推进时间。`VAPMetalView` 只在窗口里时挂 display link，离屏就拆掉；每一帧向 player 要 buffer，没有新的就复用上一张，避免闪空。

```swift
if let fresh = player.copyPixelBuffer(forHostTime: link.targetTimestamp) {
    lastBuffer = fresh
}
guard let lastBuffer else { return }
renderer.render(pixelBuffer: lastBuffer, info: info, drawable: drawable, ...)
```

`intrinsicContentSize` 用的是 `info.width` / `info.height`，不是编码帧。礼物 overlay 按逻辑尺寸排，UV 才按编码尺寸算。

## Metal：一张纹理，两套 UV

片元着色器短到可以整段看完：

```c
float4 rgb = videoTexture.sample(linearSampler, input.rgbUV);
float4 alpha = videoTexture.sample(linearSampler, input.alphaUV);
return float4(rgb.rgb, alpha.r);
```

Alpha 取 **R**。编码时 R=G=B，官方三条端都这么写。不要取 `.a`（视频像素本身不透明），也不要先平均再当透明度。

顶点顺序跟官方 iOS：BL、TL、BR、TR。图像空间的 `y / height` 直接映射到 Metal 的 `v`。WebGL 那套 `UNPACK_FLIP_Y` 反过来，抄过来会把 Alpha 和 RGB 上下错开。

UV 分母用的是 **实际纹理宽高**，不是 JSON 里的 `videoW` / `videoH` 死数。解码缓冲经常 16 对齐，比作者尺寸多几列；拿 JSON 去除、再拿 padded 纹理去采，Alpha 会往黑边里偏一截。

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

混合跟官方 Metal 对齐：`sourceAlpha` / `oneMinusSourceAlpha`。编码器写进 RGB 区的其实是预乘黑底的颜色，`rgb_stored = src.rgb * src.a`。官方 shader 仍然按直通 Alpha 去混。VAPKit 先对齐官方输出，不在 shader 里「修正」预乘。

层本身透明：`CAMetalLayer.isOpaque = false`，clear 成 `(0,0,0,0)`。直播画面在底下，礼物只贡献该亮的像素。

## 接入只要一个 player

SwiftUI 和 UIKit 共用 `VAPPlayer`。视图只负责显示，调度在播放器里。

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

MP4 里有 `vapc` 就不用再带 JSON。Web 侧剥掉 box、或文件被重封装弄丢 `vapc` 时，显式传 sidecar：

```swift
try await player.load(videoURL: videoURL, manifestURL: jsonURL)
```

公开 API 里看不到 `AVAssetReader`、`CVPixelBuffer`、`MTLDevice`。Demo 是一个直播送礼界面：全屏循环背景，底部礼物栏，点「送给冬去春来」才播 VAP。现在能送的是「星际兔」（`user_246106.mp4`）。

## 这套模型还没做的

VAPX 融合附件——把用户昵称、头像按每帧 mask 贴进动画——解析留下了 `src` / `frame`，渲染没接。远端下载也还没有，资源加载停在本地 File / Bundle。

色域路径和官方也不一样。官方解 NV12 full range，默认 BT.601，按 `kCVImageBufferYCbCrMatrixKey` 切 709。VAPKit 现在走 BGRA，省掉 YUV 矩阵，也丢掉了和官方像素级对齐的机会。要做 A/B，得换回 NV12。

HEVC（`hvc1`）作者工具会出。模拟器和一部分旧机器没有硬件解码。官方会先问 `VTIsHardwareDecodeSupported`；VAPKit 目前交给 `AVAssetReader`，失败就 `decoderInitializationFailed`，不会退回 FFmpeg 软解。

JSON 和真实轨道对不上时，文档约定是停、报 `invalidVideo`，不要缩放 UV「凑合能播」。当前 `load` 还没有把 `videoW/H` 和 track 对一遍，这一刀还在约定里，不在代码里。

## 结语

VAPKit 值得看的不是「又一个礼物播放器」，而是它把透明动画收成三条很硬的不变量：

1. 几何只来自 JSON 矩形和编码帧尺寸。不要写死 750 / 4 / 8，也不要左右对半去猜。
2. 时钟选该上屏的那一帧，解码跟着走；不要 `sleep(1/fps)`，也不要用 `AVPlayer` 当时间源。
3. 合成就是同一张纹理采两次：`rgb.rgb` 加 `alpha.r`。Alpha 不翻转、不旋转、不取错通道。

H.264 带不走透明度，就把透明度画进画面。仓库在 [github.com/shenxiang11/vapkit](https://github.com/shenxiang11/vapkit)，示例工程是 `Examples/DemoApp/DemoApp.xcodeproj`。
