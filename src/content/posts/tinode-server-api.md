---
title: Tinode Server API 中文译本
description: 翻译 Tinode 官方 Server API。会话、用户、主题、ACL、消息协议，以及客户端与服务端之间的 JSON 报文。
pubDatetime: 2026-08-19T22:30:00Z
featured: false
draft: false
tags:
  - Tinode
  - IM
  - API
  - 即时通讯
timezone: Asia/Shanghai
canonicalURL: https://github.com/tinode/chat/blob/master/docs/API.md
---

这是 [Tinode](https://github.com/tinode/chat) 官方 [Server API](https://github.com/tinode/chat/blob/master/docs/API.md) 的中文译本。原文覆盖连接方式、账号与鉴权、主题模型、访问控制，以及客户端与服务端之间的全部 JSON 报文。协议字段、报文名、示例代码保持原样，只翻译说明文字。

译文对应仓库 `master` 分支上的文档。实现细节以官方仓库为准。

## 目录

## 它是怎么工作的？

Tinode 既是 IM 路由器，也是存储。概念上大致遵循 [发布-订阅](https://en.wikipedia.org/wiki/Publish%E2%80%93subscribe_pattern) 模型。

服务端把会话（session）、用户（user）和主题（topic）连在一起。会话是客户端应用与服务端之间的网络连接。用户代表通过会话连上服务端的人。主题是一条具名通信通道，在会话之间路由内容。

用户和主题都会被分配唯一 ID。用户 ID 是带 `usr` 前缀的字符串，后面跟 base64-URL 编码的伪随机 64 位数字，例如 `usr2il9suCbuko`。主题 ID 见后文。

移动端或 Web 这类客户端通过 WebSocket 或 long polling 连上服务端，创建会话。大多数操作都要求客户端先鉴权。客户端发送 `{login}` 包来鉴权当前会话，细节见 [鉴权](#鉴权)。鉴权成功后，客户端会拿到一个后续登录用的 token。同一用户可以同时建立多个会话。协议故意不支持登出（也不需要）。

会话建立之后，用户就可以通过主题和其他用户交互。可用的主题类型如下：

* `me`：管理自己的资料，并接收其他主题的通知。每个用户都有一个 `me` 主题。
* `fnd`：用来查找其他用户和主题。每个用户也有一个 `fnd` 主题。
* 点对点主题：严格只属于两个用户的通信通道。每个参与者看到的主题名是对方的用户 ID：`usr` 前缀加上用户 ID 的 base64-URL 编码数字部分，例如 `usr2il9suCbuko`。
* 群组主题：多人通信通道。命名为 `grp` 加上 11 个伪随机字符，例如 `grpYiqEXb4QY6s`。群组主题必须显式创建。

会话通过发送 `{sub}` 包加入主题。`{sub}` 同时承担三件事：创建新主题、把用户订阅到主题、把当前会话附着到主题。细节见 [`{sub}`](#sub)。

会话加入主题之后，用户就可以发送 `{pub}` 包产生内容。内容会以 `{data}` 包投递给其他已附着的会话。

用户可以用 `{get}` 和 `{set}` 查询或更新主题元数据。

主题元数据变化——比如主题描述改了，或其他用户加入、离开——会通过 `{pres}`（presence，在线状态）包通知仍在线的会话。`{pres}` 要么发到被影响的主题，要么发到 `me` 主题。

当用户的 `me` 主题上线（也就是已鉴权会话附着到 `me`）时，会向所有与该用户有点对点订阅关系的其他用户的 `me` 主题发送 `{pres}` 包。

## 通用约定

时间戳一律是 [RFC 3339](http://tools.ietf.org/html/rfc3339) 格式字符串，精度到毫秒，时区固定为 UTC，例如 `"2015-10-06T18:07:29.841Z"`。

文中提到的 base64，都是去掉填充字符的 base64 URL 编码，见 [RFC 4648](http://tools.ietf.org/html/rfc4648)。

`{data}` 包带有服务端签发的顺序 ID：从 1 开始、每条消息加一的十进制数字。保证在单个主题内唯一。

为了把请求和响应对应起来，客户端可以给发往服务端的包分配消息 ID。这些 ID 是客户端定义的字符串，至少应在当前会话内唯一。服务端不解释这些 ID，原样返回给客户端。

## 连接到服务端

通过网络访问服务端有三种方式：WebSocket、long polling，以及 [gRPC](https://grpc.io/)。

客户端通过 HTTP(S) 建立连接时（WebSocket 或 long polling），服务端提供这些端点：

* `/v0/channels`：WebSocket 连接
* `/v0/channels/lp`：long polling
* `/v0/file/u`：文件上传
* `/v0/file/s`：文件下载

`v0` 表示 API 版本（当前是 0）。每个 HTTP(S) 请求都必须带 API key。服务端按这个顺序查找：

* HTTP 头 `X-Tinode-APIKey`
* URL 查询参数 `apikey`（`/v0/file/s/abcdefg.jpeg?apikey=...`）
* 表单字段 `apikey`
* Cookie `apikey`

演示应用里为了方便内置了一把默认 API key。生产环境请用 [`keygen` 工具](https://github.com/tinode/chat/tree/master/keygen) 自己生成。

连接打开后，客户端必须先向服务端发一条 `{hi}`。服务端用 `{ctrl}` 回复，表示成功或错误。响应的 `params` 里包含服务端协议版本，例如 `"params":{"ver":"0.15"}`，也可能包含其他值。

### gRPC

gRPC API 的定义见 [proto 文件](https://github.com/tinode/chat/blob/master/pbx/model.proto)。gRPC API 比本文描述的 API 多一点能力：允许 `root` 用户以其他用户的身份发消息，也可以删除用户。

protobuf 消息里的 `bytes` 字段期望的是 JSON 编码的 UTF-8 内容。例如，字符串要先加引号再转成 UTF-8 字节：`[]byte("\"some string\"")`（Go），`'"another string"'.encode('utf-8')`（Python 3）。

### WebSocket

消息以文本帧发送，一帧一条。二进制帧留给将来用。默认情况下，服务端接受任意 `Origin` 头的连接。

### Long Polling

Long polling 走 `HTTP POST`（推荐）或 `GET`。客户端第一次请求时，服务端会回一条 `{ctrl}`，`params` 里带 `sid`（会话 ID）。之后每次请求都必须在 URL 或请求体里带上 `sid`。

服务端允许所有来源，也就是 `Access-Control-Allow-Origin: *`。

### 带外传输大文件

大文件通过 `HTTP POST`、`Content-Type: multipart/form-data` 带外发送。细节见 [带外处理大文件](#带外处理大文件)。

### 跑在反向代理后面

Tinode 可以放在 NGINX 这类反向代理后面。为了效率，它可以从 Unix socket 接受客户端连接：把 `listen` 和/或 `grpc_listen` 配成 Unix socket 文件路径，例如 `unix:/run/tinode.sock`。也可以把 `use_x_forwarded_for` 设为 `true`，让服务端从 `X-Forwarded-For` HTTP 头读取对端 IP。

## 用户

用户代表一个人，也就是消息的生产者和消费者。

用户通常被赋予两种鉴权级别之一：已认证 `auth`，或匿名 `anon`。第三种级别 `root` 只能通过 `gRPC` 使用，它允许 `root` 以其他用户的身份发消息。

连接刚建立时，客户端可以发 `{acc}` 或 `{login}`，把用户鉴权到其中某个级别。

每个用户都有唯一 ID，格式是 `usr` 加上 base64 编码的 64 位数值，例如 `usr2il9suCbuko`。用户还有这些属性：

* `created`：用户记录创建时间
* `updated`：用户的 `public` 或 `trusted` 上次更新时间
* `status`：账号状态
* `username`：`basic` 鉴权用的唯一字符串；其他用户看不到
* `defacs`：对象，描述该用户与已认证、匿名用户进行点对点对话时的默认访问模式；见 [访问控制](#访问控制)
  * `auth`：对已认证 `auth` 用户的默认访问模式
  * `anon`：对匿名 `anon` 用户的默认访问
* `trusted`：系统管理签发的、由应用定义的对象。谁都能读，只有系统管理员能改。
* `public`：描述该用户的、由应用定义的对象。任何人都可以查询用户的 `public` 数据。
* `private`：只属于当前用户、也只有该用户能访问的、由应用定义的对象。
* `tags`：[发现](#fnd-与-tags查找用户和主题) 与凭证。

用户账号有状态，定义如下：

* `ok`（正常）：默认状态，账号没有任何限制，可以正常使用。
* `susp`（停用）：用户不能再登录，也无法通过 [搜索](#fnd-与-tags查找用户和主题) 找到。管理员可以设置，并且完全可逆。
* `del`（软删除）：用户被标记为已删除，但数据还在。目前不支持恢复。
* `undef`（未定义）：鉴权器内部使用，其他地方不该用。

一个用户可以同时与服务端保持多个连接（会话）。每个会话会打上客户端提供的 `User Agent` 字符串，用来区分客户端软件。

协议按设计不支持登出。如果应用需要换用户，应该新开一条连接，用新用户的凭证鉴权。

### 鉴权

鉴权在概念上接近 [SASL](https://en.wikipedia.org/wiki/Simple_Authentication_and_Security_Layer)：以一组适配器的形式提供，每个适配器实现一种鉴权方法。鉴权器用于账号注册 [`{acc}`](#acc) 和 [`{login}`](#login)。服务端开箱自带这些方法：

* `token`：用加密 token 鉴权。
* `basic`：用登录名-密码对鉴权。
* `anonymous`：给临时用户设计，比如通过聊天处理客服请求。
* `rest`：一种 [元方法](https://github.com/tinode/chat/tree/master/server/auth/rest/)，通过 JSON RPC 接入外部鉴权系统。

其他鉴权方法也可以用适配器实现。

`token` 被设计成主要鉴权手段。Token 鉴权很轻：通常不打数据库，全部在内存里完成。其他鉴权方法只用来获取或刷新 token。拿到 token 之后，后续登录都应该用它。

`basic` 方案期望 `secret` 是一段 base64 编码字符串，原文由用户名、冒号 `:`、明文密码拼成。`basic` 方案里的用户名不能包含冒号 `:`（ASCII 0x3A）。

`anonymous` 只能用来创建账号，不能用来登录：用户用 `anonymous` 建号，拿到加密 token，之后用 `token` 登录。token 丢失或过期后，用户就再也进不去这个账号。

编译进服务端的鉴权器名称可以用 `logical_names` 配置改写。例如，可以把自定义的 `rest` 鉴权器暴露成 `basic`，或者把 `token` 对用户隐藏。做法是在配置文件里提供一组映射：`logical_name:actual_name` 表示改名，`actual_name:` 表示隐藏。例如，要用 `rest` 服务做 basic 鉴权，就写 `"logical_names": ["basic:rest"]`。

#### 创建账号

创建新账号时，用户必须告诉服务端之后用哪种鉴权方法访问这个账号，并在合适时提供共享密钥。创建账号时只能用 `basic` 和 `anonymous`。`basic` 要求用户自己生成唯一登录名和密码发给服务端。`anonymous` 不交换密钥。

用户可以可选地设 `{acc login=true}`，用新账号立刻鉴权。`login=false`（或不设）时，账号会创建，但创建它的会话鉴权状态不变。`login=true` 时，服务端会尝试用新账号鉴权当前会话，成功的话 `{acc}` 的 `{ctrl}` 响应里会带上鉴权 token。这对 `anonymous` 特别重要，因为这是唯一能拿到鉴权 token 的时机。

#### 登录

登录靠发 `{login}`。只能用 `basic` 和 `token`。任何登录的响应都是 `{ctrl}`：要么是 200 加上后续 `token` 登录可用的 token，要么是 300 要求补充信息（比如校验凭证，或多步鉴权里响应方法相关的 challenge），要么是 4xx 错误。

Token 有服务端配置的过期时间，需要定期刷新。

#### 修改鉴权参数

用户可以发 `{acc}` 修改鉴权参数，比如改登录名和密码。目前只有 `basic` 支持改参数：

```js
acc: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  user: "usr2il9suCbuko", // 被修改的用户，可选
  token: "XMg...g1Gp8+BO0=", // 会话尚未鉴权时的鉴权 token，可选
  scheme: "basic", // 正在更新的鉴权方案
  secret: base64encode("new_username:new_password") // 新参数
}
```

如果只改密码，`username` 留空，也就是 `secret: base64encode(":new_password")`。

会话尚未鉴权时，请求必须带 `token`。它可以是登录时拿到的常规鉴权 token，也可以是 [重置密码](#重置密码也就是忘记密码) 流程里拿到的受限 token。会话已鉴权时，不要带 token。如果请求以 `ROOT` 级别鉴权，可以把 `user` 设成另一个用户的有效 ID。否则必须留空（默认当前用户），或等于当前用户 ID。

#### 重置密码，也就是「忘记密码」

要重置登录名或密码（或鉴权器支持的其他密钥），发送 `scheme` 为 `reset` 的 `{login}`，`secret` 是 base64 编码字符串，原文格式为「要重置密钥的鉴权方案`:`重置方法`:`重置方法的值」。最常见的邮箱重置密码是：

```js
login: {
  id: "1a2b3",
  scheme: "reset",
  secret: base64encode("basic:email:jdoe@example.com")
}
```

其中 `jdoe@example.com` 是用户之前已校验过的邮箱。

如果邮箱与注册信息匹配，服务端会按指定方法和地址发一条重置说明。邮件里带有受限安全 token，用户可以把它放进 `{acc}`，并带上新密钥，流程见 [修改鉴权参数](#修改鉴权参数)。

### 停用用户

服务管理员可以停用用户账号。账号停用后，用户不能再登录，也不能再使用服务。

只有 `root` 用户可以停用账号。root 发送：

```js
acc: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  user: "usr2il9suCbuko", // 被修改的用户
  status: "susp"
}
```

同样的消息把 `status` 改成 `"ok"` 即可解除停用。root 用户可以对用户的 `me` 主题执行 `{get what="desc"}` 来查看账号状态。

### 凭证校验

服务端可以可选地配置：某些与用户账号和鉴权方案绑定的凭证必须校验。例如，可以要求用户提供唯一邮箱或手机号，或完成 captcha，才能注册。

邮箱校验开箱即用，改配置就能用。手机号校验基本成型，但还不能真正用，因为发短信需要商业订阅。

如果某些凭证是必需的，用户必须始终保持它们处于已校验状态。也就是说，要改必需凭证时，必须先添加并校验新凭证，再删旧的。

凭证最初在注册时通过 `{acc}` 指定，用 `{set topic="me"}` 添加，用 `{del topic="me"}` 删除，用 `{get topic="me"}` 查询。客户端通过 `{login}` 或 `{acc}` 完成校验。

### 访问控制

访问控制通过 ACL（访问控制列表）管理用户对主题的访问。权限按每个「用户-主题」对（订阅）单独分配。

ACL 主要用在群组主题上。对 `me` 和点对点主题，它主要用于管理在线状态通知，以及禁止用户发起或继续点对点对话。频道的所有读者权限相同。

用户对主题的访问由两套权限决定：用户自己想要的权限 `want`，以及主题管理者授予的权限 `given`。每个权限是位图里的一位，要么有要么没有。实际访问权限是 `want` 和 `given` 的按位与。报文里用一组 ASCII 字符表示权限，出现某个字符就表示对应位被置上：

* 无访问：`N` 本身不是一种权限，而是明确表示权限被清空/未设置。通常意味着**不要**套用默认权限。
* 加入：`J`，允许订阅主题
* 读：`R`，允许接收 `{data}` 包
* 写：`W`，允许向主题 `{pub}`
* 在线状态：`P`，允许接收 `{pres}` 更新
* 审批：`A`，允许批准加入请求、移除和封禁成员；拥有此权限的用户是主题管理员
* 分享：`S`，允许邀请其他人加入主题
* 删除：`D`，允许硬删除消息；只有所有者能彻底删除主题
* 所有者：`O`，用户是主题所有者；所有者可以把任意权限赋给任意成员，改主题描述，删除主题；一个主题最多一个所有者；有些主题没有所有者

用户订阅主题或开始与另一用户聊天时，访问权限要么显式指定，要么按默认值 `defacs` 分配。之后可以用 `{set}` 修改。

客户端可以在 `{sub}` 和 `{set}` 里显式设权限。如果权限缺失或是空字符串（注意不是 `N`），Tinode 会用之前分配的默认权限 `defacs`。如果也没有默认权限，群组主题里的已认证用户会得到 `JRWPS`，点对点主题会得到 `JRWPA`；匿名用户会得到 `N`（无访问），也就是每次订阅请求都必须由主题管理者显式批准。

默认访问针对两类用户：已认证和匿名。默认访问值会作为 `given` 权限应用到所有新订阅。主题的默认访问在创建时由 `{sub.desc.defacs}` 设定，之后所有者可以用 `{set}` 改。同样，用户的默认访问在建号时由 `{acc.desc.defacs}` 设定，之后用户可以向 `me` 主题发 `{set}` 修改。

## 主题

主题是一条给一个或多个人用的具名通信通道。主题有持久化属性，可以用 `{get what="desc"}` 查询。

与查询者无关的主题属性：

* `created`：主题创建时间
* `updated`：主题的 `trusted`、`public` 或 `private` 上次更新时间
* `touched`：主题上最后一条消息的时间
* `defacs`：对象，描述主题对已认证和匿名用户的默认访问模式；见 [访问控制](#访问控制)
  * `auth`：对已认证用户的默认访问模式
  * `anon`：对匿名用户的默认访问
* `seq`：整数，该主题上最新一条 `{data}` 消息的服务端顺序 ID
* `trusted`：系统管理员签发的、由应用定义的对象。谁都能读，只有管理员能改。
* `public`：描述该主题的、由应用定义的对象。能订阅主题的人都能收到 `public` 数据，只有主题 `owner` 能改。

与用户相关的主题属性：

* `acs`：对象，描述当前用户的实际访问权限；见 [访问控制](#访问控制)
  * `want`：该用户请求的权限
  * `given`：授予该用户的权限
* `private`：只属于当前用户（主题订阅者）的、由应用定义的对象。

主题通常有订阅者。其中一个可以被指定为主题所有者（`O` 权限），拥有全部权限。订阅者列表可以用 `{get what="sub"}` 查询，结果出现在 `{meta}` 的 `sub` 段里。

### `me` 主题

每个用户在建号时都会自动创建 `me` 主题。它用来管理账号信息，并接收来自相关用户和主题的在线状态通知。`me` 没有所有者，不能删除，也不能退订。可以 `leave` 这个主题，这会停掉相关通信，并表示用户离线（用户可能仍处于登录状态，并继续使用其他主题）。

加入或离开 `me` 会向所有与该用户有点对点主题、且设置了 `P` 权限的用户发送 `{pres}`。

`me` 是只读的。向 `me` 发 `{pub}` 会被拒绝。

向 `me` 发 `{get what="desc"}` 会自动回一条带 `desc` 段的 `{meta}`，内容是主题参数（见 [主题](#主题) 开头）。`me` 的 `public` 是用户想展示给联系人的数据。改它不只改 `me` 的 `public`，凡是展示该用户 `public` 的地方都会一起变，包括该用户所有点对点主题的 `public`。

向 `me` 发 `{get what="sub"}` 和其他主题不同：它返回的是当前用户订阅的主题列表，而不是用户对 `me` 的订阅。

* `seq`：该主题最后一条消息的服务端数字 id
* `recv`：当前用户自称已接收到的 seq
* `read`：当前用户自称已读到的 seq
* `seen`：对点对点订阅，会报告对方上次在线时间和 User Agent
  * `when`：用户上次在线时间
  * `ua`：用户上次使用的客户端 User Agent

向 `me` 发 `{get what="data"}` 会被拒绝。

内部实现上，`me` 并不单独持久化。`topics` 表或集合里没有 `me`，它们是根据 `users` 库记录在内存里创建的。

### `slf` 主题

`slf`（self）用来存只有自己能看的信息，比如书签或稍后阅读。发到 `slf` 的消息只有发送者能访问。

用户第一次订阅时会自动创建这个主题。

### `fnd` 与 Tags：查找用户和主题

每个用户在建号时都会自动创建 `fnd` 主题。它是发现其他用户和群组主题的端点。用户和群组主题可以通过 `tags` 被发现。Tags 可以在创建主题或用户时可选地指定，之后对 `me` 或群组主题用 `{set what="tags"}` 更新。

Tag 是任意不区分大小写的 Unicode 字符串（服务端会转成小写），最长 96 个字符，可以包含 Unicode [`Letter` 和 `Number` 类](https://en.wikipedia.org/wiki/Unicode_character_property#General_Category)，以及这些 ASCII 字符：`_`、`.`、`+`、`-`、`@`、`#`、`!`、`?`。

Tag 可以有前缀，作为命名空间。前缀是 2 到 16 个字符，以字母 `[a-z]` 开头，后面可以是小写 ASCII 字母和数字，再跟冒号 `:`。例如带前缀的电话 tag `tel:+14155551212`，或邮箱 tag `email:alice@example.com`。某些带前缀的 tag 可以强制唯一，这时只有一个用户或主题能拥有它。某些 tag 可以对用户不可变：用户增删这类 tag 会被服务端拒绝。

Tags 在服务端建了索引，用于用户和主题发现。搜索结果按匹配到的 tag 数量降序排列。

要查找用户或主题，用户把 `fnd` 的 `public` 或 `private` 设成搜索查询（见 [查询语言](#查询语言)），然后发 `{get topic="fnd" what="sub"}`。如果两个都设了，用 `public`。`private` 查询会跨会话和设备持久化，也就是该用户所有会话看到的是同一份 `private` 查询。`public` 查询是临时的，不落库，也不在会话间共享。`private` 适合大而少变的查询，比如按手机通讯录找人。`public` 适合短而具体的查询，比如找某个不在通讯录里的主题或用户。

系统用带 `sub` 段的 `{meta}` 回复，列出找到的用户或主题，格式和订阅一样。

`fnd` 是只读的。向 `fnd` 发 `{pub}` 会被拒绝。

_目前不支持_：当新用户注册时带有匹配给定查询的 tags，`fnd` 会收到该新用户的 `{pres}` 通知。

[插件](https://github.com/tinode/chat/tree/master/pbx) 支持 `Find` 服务，可以替换默认搜索。

内部实现上，`fnd` 也不单独持久化。`topics` 表或集合里没有 `fnd`，它们是根据 `users` 库记录在内存里创建的。

#### 查询语言

Tinode 查询语言用来定义查找用户和主题的搜索查询。查询是一串由空格或逗号分隔的原子项。每一项会拿去匹配用户或主题的 tags。单个词可以是从右到左书写的语言，但整条查询按从左到右解析。空格当作 `AND`，逗号（以及前后带空格的逗号）当作 `OR`。运算符顺序会被忽略：所有 `AND` tags 归一组，所有 `OR` tags 归一组。`OR` 优先于 `AND`：如果一个 tag 前面或后面有逗号，它就是 `OR` tag，否则是 `AND`。例如 `aaa bbb, ccc`（`aaa AND bbb OR ccc`）会被解释成 `(bbb OR ccc) AND aaa`。

含空格的查询项必须把空格换成下划线 ` ` -> `_`，例如 `new york` -> `new_york`。

**一些例子：**

* `flowers`：找带 `flowers` tag 的主题或用户。
* `flowers travel`：找同时带 `flowers` 和 `travel` 的主题或用户。
* `flowers, travel`：找带 `flowers` 或 `travel`（或两者都有）的主题或用户。
* `flowers travel, puppies`：找带 `flowers`，并且带 `travel` 或 `puppies` 的，也就是 `(travel OR puppies) AND flowers`。
* `flowers, travel puppies, kittens`：找带 `flowers`、`travel`、`puppies` 或 `kittens` 任意一个的，也就是 `flowers OR travel OR puppies OR kittens`。`travel` 和 `puppies` 之间的空格因为 `OR` 优先于 `AND`，也被当成 `OR`。

#### 对查询做增量更新

_目前不支持_。查询，尤其是 `fnd.private`，可以任意大，只受消息大小限制和底层数据库查询大小限制。不必为了增删一项就重写整条查询，可以增量增删。

增量更新请求从左到右处理。同一项可以出现多次，例如 `-a_tag+a_tag` 是合法请求。

#### 查询改写

按登录名、电话或邮箱找人时，查询项必须带前缀，例如写 `email:alice@example.com` 而不是 `alice@example.com`。这会给终端用户添麻烦，因为他们得先学查询语言。Tinode 在服务端做**查询改写**：如果查询项（tag）没有前缀，服务端会补上合适的前缀。对 `fnd.public` 的查询，原词也会保留（`alice@example.com` 改写成 `email:alice@example.com OR alice@example.com`）；对 `fnd.private`，只保留改写后的词（`alice@example.com` 改写成 `email:alice@example.com`）。所有看起来像邮箱的项，例如 `alice@example.com`，都会改写成 `email:alice@example.com OR alice@example.com`。看起来像电话号码的项会转成 [E.164](https://en.wikipedia.org/wiki/E.164)，并改写成 `tel:+14155551212 OR +14155551212`。另外，对 `fnd.public`，其他看起来像登录名、且没有前缀的项会改写成登录名：`alice` -> `basic:alice OR alice`。

如上所述，看起来像电话号码的 tags 会转成 E.164。这种转换需要 ISO 3166-1 alpha-2 国家码。转换逻辑如下：

* 如果 tag 已经带国家呼叫码，原样使用：`+1(415)555-1212` -> `+14155551212`。
* 如果没有前缀，国家码取自客户端在 `{hi}` 的 `lang` 里设置的 locale。
* 如果客户端没在 `hi.lang` 里提供，取 `tinode.conf` 的 `default_country_code`。
* 如果 `tinode.conf` 也没设 `default_country_code`，用 `US`。

#### 可能的用途

* 把用户限制在组织内。
  可以给用户分配一个不可变 tag，表示所属组织。用户搜索其他用户或主题时，搜索可以强制始终包含这个 tag。这样可以把用户切成互相可见性有限的组织。

* 按地理位置搜索。
  客户端可以定期根据当前位置给用户打上 [geohash](https://en.wikipedia.org/wiki/Geohash) tag。在某个区域找人，就是匹配 geohash tags。

* 按数值区间搜索，比如年龄区间。
  思路类似 geohash。用最小的 2 的幂覆盖整个数值范围，例如人类年龄用 2⁷ = 128 年覆盖。整个范围对半切：0-63 记为 0，64-127 记为 1。对每个子区间重复：0-31 是 00，32-63 是 01，0-15 是 000，32-47 是 010。完成后，30 岁属于这些区间：0（0-63）、00（0-31）、001（16-31）、0011（24-31）、00111（28-31）、001111（30-31）、0011110（30）。给 30 岁用户打上若干表示年龄的 tags，例如 `age:00111`、`age:001111`、`age:0011110`。理论上 7 个都可以打，但通常没必要。要查 28-35 岁，把区间收成最少的 tags：`age:00111`（28-31）、`age:01000`（32-35）。这条查询会通过 `age:00111` 匹配到 30 岁用户。

### 点对点主题

点对点（P2P）主题是严格两个用户之间的通信通道。两个参与者看到的主题名不一样。每人看到的是对方的用户 ID：`usr` 加上对方用户 ID 的 base64 URL 编码。例如，`usrOj0B3-gSBSs` 和 `usrIU_LOVwRNsc` 开一个 P2P 主题，前者看到的是 `usrIU_LOVwRNsc`，后者看到的是 `usrOj0B3-gSBSs`。P2P 主题没有所有者。

一方订阅以另一方用户 ID 为名的主题，就会创建 P2P 主题。例如，`usrOj0B3-gSBSs` 发 `{sub topic="usrIU_LOVwRNsc"}`，就能和 `usrIU_LOVwRNsc` 建立 P2P 主题。Tinode 会回一条 `{ctrl}`，主题名如上所述。另一方会在 `me` 主题上收到带更新后访问权限的 `{pres}`。

内部存储时，P2P 主题名是 `p2p` 加上两个 64 位用户 ID 的 base64 URL 编码拼接，数值较小的 ID 在前：`p2pm7PvMGmdcx_uVkDRaSTbwA`。

P2P 主题的 `public` 与用户相关。A 和 B 之间的 P2P 主题，B 看到的是 A 的 `public`，反过来也一样。用户更新 `public` 后，该用户所有 P2P 主题的 `public` 也会自动更新。

P2P 主题的 `private` 和其他主题类型一样，由每个参与者各自定义。

### 群组主题

群组主题是多用户通信通道。名称是 `grp` 或 `chn` 加上一段来自 base64 URL 编码字符集的字符串。不要对群组名的内部结构或长度做其他假设。

群组主题的订阅者数量有上限（由配置文件的 `max_subscriber_count` 控制），每个订阅者的访问权限单独管理。群组主题也可以开启任意数量的只读用户——`readers`。所有 `readers` 权限相同。开启了 `readers` 的群组主题叫做 `channels`（频道）。

发送 `topic` 为 `new` 或 `nch`（后面可以跟任意字符）的 `{sub}` 即可创建群组主题，例如 `new` 和 `newAbC123` 等价。Tinode 会回一条 `{ctrl}`，带上新主题名，也就是 `{sub topic="new"}` 会收到 `{ctrl topic="grpmiKBkQVXnm3P"}`。创建失败时，错误报告在原始主题名上，也就是 `new` 或 `newAbC123`。创建者成为主题所有者。所有权可以用 `{set}` 转给别人，但任何时候都必须有一个所有者。

频道主题和普通群组主题的差别如下：

* 发 `{sub topic="nch"}` 创建频道。发 `{sub topic="new"}` 会创建不带频道能力的群组主题。
* 发 `{sub topic="chnAbC123"}` 会创建对该频道的 `reader` 订阅。非频道主题会拒绝这种订阅。
* 用 [`fnd`](#fnd-与-tags查找用户和主题) 搜索时，频道地址带 `chn` 前缀，非频道主题带 `grp` 前缀。
* 频道读者收到的消息没有 `From` 字段。普通订阅者收到的消息带发送者 ID 的 `From`。
* 频道和普通群组主题的默认权限不同：频道群组主题默认不授予任何权限。
* 订阅者加入或离开主题（普通或开启了频道的）会向当前已加入该主题、且有相应权限的其他订阅者发 `{pres}`。读者加入或离开频道不产生 `{pres}`。

### `sys` 主题

`sys` 主题是一条随时可用、用来联系系统管理员的通道。普通非 root 用户不能订阅 `sys`，但可以不订阅就向它发布。现有客户端用这条通道举报滥用：发送 Drafty 格式的 `{pub}`，把举报内容作为 JSON 附件。root 用户可以订阅 `sys`。订阅之后，root 会收到其他用户发到 `sys` 的消息。

## 使用服务端签发的消息 ID

Tinode 用服务端签发的顺序消息 ID，为客户端缓存 `{data}` 消息提供基础支持。客户端可以对主题发 `{get what="desc"}` 拿到最后一条消息 id。如果返回的 ID 大于本地已收到的最新消息 ID，客户端就知道主题有未读消息，以及未读数量。客户端可以用 `{get what="data"}` 拉取这些消息，也可以用消息 ID 分页拉取历史。

## User Agent 与在线状态通知

当用户的一个或多个会话附着到 `me` 时，该用户被报告为在线。客户端通过 `{login}` 的 `ua`（user agent）字段向服务端表明自己的身份。User Agent 按如下方式出现在 `{meta}` 和 `{pres}` 里：

* 用户的第一个会话附着到 `me` 时，该会话的 user agent 会通过 `{pres what="on" ua="..."}` 广播。
* 多个会话都附着到 `me` 时，最近发生过动作的那个会话的 user agent 会通过 `{pres what="ua" ua="..."}` 报告；这里的「动作」指客户端发出的任何消息。为避免流量过大，user agent 变化最多每分钟广播一次。
* 用户的最后一个会话从 `me` 脱离时，该会话的 user agent 会连同时间戳一起记录，并通过 `{pres what="off" ua="..."}` 广播，之后作为上次在线时间和 user agent 报告。

空的 `ua=""` 不会被报告。也就是说，用户先用非空 user agent 附着到 `me`，再用空的附着，这次变化不会报告。将来可能会禁止空 user agent。

## Trusted、Public、Private、Auxiliary 字段

主题有 `trusted`、`public`、`aux` 字段，订阅有 `private` 字段。这些字段的主要差别在访问控制：

* `trusted`：`ROOT` 用户可写，任何人可读。
* `public`：`owner` 或该用户可写，任何人可读。
* `aux`：主题管理员可写，订阅者可读。
* `private`：只有创建该订阅的用户能读写。

这些字段一般由应用定义。除了 `fnd` 主题，服务端不强制它们的结构。同时，为了互操作，客户端软件应使用同一套格式。下面几节描述官方客户端实现的格式。

虽然还没强制，如果第三方应用定义自定义 key，key 名应以 `x-` 加上应用的完全限定域名开头，例如 `x-example.com-value: "abc"`。字段应只包含基本类型，也就是 `string`、`boolean`、`number` 或 `null`。

### Trusted

群组和点对点主题里，可选的 `trusted` 字段是一组键值对；`fnd` 和 `sys` 没有 `trusted`。`ROOT` 用户可写，能访问该主题或用户的人都能读。目前定义了这些可选 key：

```js
trusted: {
  verified: true, // boolean，表示已验证/可信的用户或主题
  staff: true,    // boolean，表示该用户或主题属于服务端管理方
  danger: true    // boolean，表示该用户或主题不可信
}
```

### Public

群组、点对点、系统主题里，`public` 字段预期是 [theCard](https://github.com/tinode/chat/blob/master/docs/thecard.md)。用户自己的 `public` 由该用户可写，主题的 `public` 由主题所有者可写。能访问该主题或用户的人都能读。

`fnd` 主题期望 `public` 是表示 [搜索查询](#查询语言) 的字符串。

### Private

群组和点对点主题里，`private` 字段是一组键值对。只有该用户能读写。目前定义了这些 key：

```js
private: {
  comment: "some comment", // string，用户对主题或对端用户的可选备注
  arch: true, // boolean，表示用户已归档该主题，
              // 不应和其他未归档主题一起出现在 UI 里
  accepted: "JRWS", // string，用户已接受的 given 模式
  tpins: ["grpmiKBkQVXnm3P", "usrIU_LOVwRNsc"] // 要置顶到联系人列表顶部的主题 ID 数组；
              // 仅 me 主题
}
```

`fnd` 主题期望 `private` 是表示 [搜索查询](#查询语言) 的字符串。

### Auxiliary

`aux` 字段是一组键值对。主题管理员可写，所有主题订阅者可读。目前定义了这些 key：

```js
aux: {
  pins: [1001, 23456] // 要置顶到消息列表顶部的整数消息 ID 数组
}
```

## 内容格式

`{pub}` 和 `{data}` 里的 `content` 由应用定义，服务端不强制结构。同时，为了互操作，客户端软件应使用同一套格式。目前支持这两种 `content`：

* 纯文本
* [Drafty](https://github.com/tinode/chat/blob/master/docs/drafty.md)

如果用 Drafty，必须设置消息头 `"head": {"mime": "text/x-drafty"}`。

## 带外处理大文件

大文件带内发送会有几个问题：

* 数据库存储受限，因为带内消息存在数据库字段里
* 拉取聊天历史时，带内消息必须完整下载

Tinode 提供两个处理大文件的端点：`/v0/file/u` 上传，`/v0/file/s` 下载。这两个端点都要求客户端同时提供 [API key](#连接到服务端) 和登录凭证。服务端按这个顺序检查凭证：

**登录凭证**

* HTTP 头 `Authorization`（https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization）
* URL 查询参数 `auth` 和 `secret`（`/v0/file/s/abcdefg.jpeg?auth=...&secret=...`）
* 表单字段 `auth` 和 `secret`
* Cookie `auth` 和 `secret`

### 上传

要上传文件，先构造 RFC 2388 multipart 请求，再用 HTTP POST 发给服务端。服务端要么回 `307 Temporary Redirect` 并带上新的上传 URL，要么回 `200 OK`，响应体是 `{ctrl}`：

```js
ctrl: {
  params: {
    url: "/v0/file/s/mfHLxDWFhfU.pdf"
  },
  code: 200,
  text: "ok",
  ts: "2018-07-06T18:47:51.265Z"
}
```

如果收到 `307 Temporary Redirect`，客户端必须到给出的 URL 重试这次上传。`307` 里的 URL 只应用于这一次上传。之后的上传应先尝试默认 URL。

`ctrl.params.url` 是当前服务端上已上传文件的路径。它可以是完整路径如 `/v0/file/s/mfHLxDWFhfU.pdf`，相对路径如 `./mfHLxDWFhfU.pdf`，或只是文件名 `mfHLxDWFhfU.pdf`。除完整路径外，其他都相对于默认**下载**端点 `/v0/file/s/` 解释。例如返回 `mfHLxDWFhfU.pdf` 时，文件位于 `http(s)://current-tinode-server/v0/file/s/mfHLxDWFhfU.pdf`。

拿到文件 URL 之后（无论是立刻拿到还是跟随重定向之后），客户端可以用这个 URL 发一条 `{pub}`，把上传的文件当作附件；如果是图片，也可以当作主题或用户资料的头像（见 [theCard](https://github.com/tinode/chat/blob/master/docs/thecard.md)）。例如，这个 URL 可以用在 [Drafty](https://github.com/tinode/chat/blob/master/docs/drafty.md) 格式的 `pub.content` 里：

```js
{
  pub: {
    id: "121103",
    topic: "grpnG99YhENiQU",
    head: {
      mime: "text/x-drafty"
    },
    content: {
      ent: [
      {
        data: {
        mime: "image/jpeg",
        name: "roses-are-red.jpg",
        ref:  "/v0/file/s/sJOD_tZDPz0.jpg",
        size: 437265
      },
        tp: "EX"
      }
    ],
    fmt: [
      {
        at: -1,
      key:0,
      len:1
      }
    ]
    }
  },
  extra: {
    attachments: ["/v0/file/s/sJOD_tZDPz0.jpg"]
  }
}
```

必须把用到的 URL 列在 `extra: attachments[...]` 里。Tinode 服务端用这个字段维护已上传文件的引用计数。某个文件的计数降到零时（例如带有该共享 URL 的消息被删了，或客户端没把 URL 放进 `extra.attachments`），服务端会回收这个文件。只应使用相对 URL。`extra.attachments` 里的绝对 URL 会被忽略。URL 值应是上传响应里返回的 `ctrl.params.url`。

### 下载

服务端点 `/v0/file/s` 响应 HTTP GET 来提供文件。客户端必须把相对 URL 相对于这个端点解析，也就是收到 `mfHLxDWFhfU.pdf` 或 `./mfHLxDWFhfU.pdf` 时，应把它当作当前 Tinode HTTP 服务上的 `/v0/file/s/mfHLxDWFhfU.pdf`。

_重要！_ 作为安全措施，如果下载 URL 是绝对地址并且指向另一台服务器，客户端不应发送安全凭证。

## 推送通知

Tinode 用编译期适配器处理推送通知。服务端自带 [Tinode Push Gateway](https://github.com/tinode/chat/tree/master/server/push/tnpg/)、[Google FCM](https://firebase.google.com/docs/cloud-messaging/) 和 `stdout` 适配器。Tinode Push Gateway 和 Google FCM 支持带 [Play Services](https://developers.google.com/android/guides/overview) 的 Android（部分国产手机可能不支持）、iOS 设备，以及除 Safari 外的主流浏览器。`stdout` 适配器实际上不发推送，主要用于调试、测试和日志。其他类型的推送，例如 [TPNS](https://intl.cloud.tencent.com/product/tpns)，可以写对应适配器来处理。

如果要写自定义插件，通知 payload 如下：

```js
{
  topic: "grpnG99YhENiQU", // 收到消息的主题
  xfrom: "usr2il9suCbuko", // 发送该消息的用户 ID
  ts: "2019-01-06T18:07:30.038Z", // RFC3339 格式的消息时间戳
  seq: "1234", // 消息的顺序 ID（整数值以文本发送）
  mime: "text/x-drafty", // 可选的消息 MIME-Type
  content: "Lorem ipsum dolor sit amet, consectetur adipisci", // 消息内容前 80 个字符的纯文本
}
```

### Tinode Push Gateway

Tinode Push Gateway（TNPG）是 Tinode 的专有服务，替 Tinode 发推送。内部用 Google FCM，因此支持的平台和 FCM 一样。相对 FCM，TNPG 的主要好处是配置简单：移动客户端不用重新编译，只要在服务端做 [配置更新](https://github.com/tinode/chat/tree/master/server/push/tnpg/)。

### Google FCM

[Google FCM](https://firebase.google.com/docs/cloud-messaging/) 支持带 [Play Services](https://developers.google.com/android/guides/overview) 的 Android、iPhone 和 iPad，以及除 Safari 外的主流浏览器。要用 FCM，移动客户端（iOS、Android）必须用从 Google 拿到的凭证重新编译。细节见 [说明](https://github.com/tinode/chat/tree/master/server/push/fcm/)。

### Stdout

`stdout` 适配器主要用于调试和日志。它把推送 payload 写到 `STDOUT`，可以重定向到文件，或被其他进程读取。

## 视频通话

[见单独文档](https://github.com/tinode/chat/blob/master/docs/call-establishment.md)。

## 链接预览

Tinode 提供一项可选服务，帮助客户端应用生成用于消息的链接（URL）预览。如果启用，端点在 `/v0/urlpreview`。服务只接收一个参数 `url`：

```
/v0/urlpreview?url=https%3A%2F%2Ftinode.co
```

服务会对给定 URL 发 HTTP(S) GET，拉取文档的前若干 KB。如果返回的文档 content-type 是 `text/html`，会解析出页面标题、描述和图片 URL。结果格式化为 JSON 返回：

```json
{"title": "Page title", "description": "This is a page description", "image_url": "https://tinode.co/img/logo64x64.png"}
```

链接预览服务需要鉴权，方式和 [带外处理大文件](#带外处理大文件) 完全一样。

## 消息

消息是一组逻辑上关联的数据，以 JSON 格式的 UTF-8 文本传递。

所有客户端到服务端的消息都可以带可选的 `id` 字段。客户端用它来确认服务端已收到并处理该消息。`id` 预期是会话内唯一的字符串，但可以是任意字符串。服务端除了检查 JSON 合法性外，不解释它。服务端回复客户端时原样返回 `id`。

服务端要求严格合法的 JSON，包括字段名两边的双引号。下面的记法为了简洁省略了字段名两边的双引号，也省略了最外层的花括号。示例里用 `//` 注释只是为了好读。真正和服务端通信时不能用这些注释。

对于会更新应用定义数据的消息，例如 `{set}` 的 `private` 或 `public` 字段，如果要清空服务端数据，使用只含一个 Unicode DEL 字符 `␡`（`\u2421`）的字符串。也就是说，发 `"public": null` 不会清空字段，发 `"public": "␡"` 才会。

服务端会静默忽略任何无法识别的字段。

### 客户端到服务端的消息

每条客户端到服务端的消息都包含下面各节描述的主载荷，以及可选的顶层字段 `extra`：

```js
{
  abc: { ... }, // 主载荷，见下面各节
  extra: {
    attachments: ["/v0/file/s/sJOD_tZDPz0.jpg"], // 需要免于 GC 的带外附件数组
    obo: "usr2il9suCbuko", // root 用户设置的替代用户 ID（obo = On Behalf Of）
    authlevel: "auth"  // root 用户设置的改写鉴权级别
  }
}
```

`attachments` 数组列出带外上传文件的 URL。列出它们会增加这些文件的引用计数。计数降到 0 后，文件会被自动删除。
`obo`（On Behalf Of）可以由 `root` 用户设置。设置后，服务端会把这条消息当作来自指定用户，而不是实际发送者。
`authlevel` 是对 `obo` 的补充，允许为该用户设置自定义鉴权级别。未设置时使用 `"auth"`。

#### `{hi}`

握手消息。客户端用来告知服务端自己的版本和 user agent。这必须是客户端发给服务端的第一条消息。服务端回 `{ctrl}`，`ctrl.params` 里包含服务端构建号 `build`、线路协议版本 `ver`、long polling 时的会话 ID `sid`，以及服务端约束。

```js
hi: {
  id: "1a2b3",     // string，客户端提供的消息 id，可选
  ver: "0.15.8-rc2", // string，客户端支持的线路协议版本，必填
  ua: "JS/1.0 (Windows 10)", // string，标识客户端软件的 user agent，可选
  dev: "L1iC2...dNtk2", // string，标识这台已连接设备的唯一值，
                   // 用于推送通知；服务端不解释。
                   // 见推送通知支持；可选
  platf: "android", // string，底层 OS，用于推送通知，取
                   // "android"、"ios"、"web" 之一；缺失时服务端会尽量
                   // 从 user agent 字符串检测平台；可选
  lang: "en-US"    // 客户端设备的人类语言；可选
}
```

User agent `ua` 预期遵循 [RFC 7231 第 5.5.3 节](http://tools.ietf.org/html/rfc7231#section-5.5.3) 的建议，但格式不强制。这条消息可以发多次，用来更新 `ua`、`dev` 和 `lang`。如果发多次，第二条及之后的 `ver` 必须不变或不设。

#### `{acc}`

`{acc}` 用来创建用户，或更新已有用户的 `tags` 以及鉴权凭证 `scheme` 和 `secret`。要创建新用户，把 `user` 设成 `new`，后面可以跟任意字符序列，例如 `newr15gsr`。已鉴权或匿名会话都可以发 `{acc}` 创建新用户。要更新当前用户的鉴权数据或校验凭证，不要设 `user`。

`{acc}` **不能**用来修改已有用户的 `desc` 或 `cred`。请改更新用户的 `me` 主题。

```js
acc: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  user: "newABC123", // string，"new" 后面可选跟任意字符，用来创建新用户，
              // 默认：当前用户，可选
  token: "XMgS...8+BO0=", // string，会话尚未鉴权时用于该请求的鉴权 token，可选
  // 一次性动作的临时鉴权参数，例如重置密码
  tmpscheme: "code", // 临时鉴权方案名
  tmpsecret: "XMgS...8+BO0=", // 临时鉴权密钥
  status: "ok", // 修改用户状态；无默认值，可选
  authlevel: "auth", // 当 UserID 已设置且不等于当前用户时的鉴权级别；
              // ""、"auth" 或 "anon"；默认：""
  scheme: "basic", // 该账号的鉴权方案，必填；
               // 创建账号目前支持 "basic" 和 "anon"
  secret: base64encode("username:password"), // string，所选鉴权方案的 base64 编码密钥；
              // 要删除某个方案，使用只含一个 DEL Unicode 字符 "\u2421" 的字符串；
              // "token" 和 "basic" 不能删除
  login: true, // boolean，用新创建的账号鉴权当前会话，
              // 也就是创建账号并立刻登录
  tags: ["alice johnson",... ], // 用于用户发现的 tag 数组；见 fnd 主题，
              // 可选（缺失时，用户除了按登录名外无法被发现）
  cred: [  // 需要校验的账号凭证，例如邮箱或手机号
    {
      meth: "email", // string，校验方法，例如 "email"、"tel"、"recaptcha" 等
      val: "alice@example.com", // string，要校验的凭证，例如邮箱或电话
      resp: "178307", // string，校验响应，可选
      params: { ... } // 该方法特有的参数，可选
    },
  ...
  ],

  desc: {  // object，用户初始化数据，和表初始化非常接近；
           // 只在创建账号时使用；可选
    defacs: {
      auth: "JRWS", // string，该用户与其他已认证用户进行点对点对话的默认访问模式
      anon: "N"  // string，该用户与匿名（未鉴权）用户进行点对点对话的默认访问模式
    }, // 用户点对点主题的默认访问模式
    public: { ... }, // 描述用户的、由应用定义的载荷，所有人可见
    private: { ... } // 只通过 me 主题对用户自己可见的私有载荷
  }
}
```

服务端用 `{ctrl}` 回复，`params` 里包含新用户账号的细节，例如用户 ID；如果 `login: true`，还会带鉴权 token。如果缺少 `desc.defacs`，服务端会给新账号分配服务端默认访问权限。

创建账号只支持 `basic` 和 `anonymous` 两种鉴权方案。

#### `{login}`

用来鉴权当前会话。

```js
login: {
  id: "1a2b3",     // string，客户端提供的消息 id，可选
  scheme: "basic", // string，鉴权方案；目前支持
                   // "basic"、"token" 和 "reset"
  secret: base64encode("username:password"), // string，所选鉴权方案的 base64 编码密钥，必填
  cred: [
    {
      meth: "email", // string，校验方法，例如 "email"、"tel"、"captcha" 等，必填
      resp: "178307" // string，校验响应，必填
    },
  ...
  ],   // 对凭证校验请求的响应，可选
}
```

服务端用 `{ctrl}` 回复 `{login}`。消息的 `params` 里，`user` 是已登录用户的 id。`token` 是一段加密字符串，可用于后续鉴权。token 过期时间作为 `expires` 传回。

#### `{sub}`

`{sub}` 包承担这些职能：

* 创建新主题
* 把用户订阅到已有主题
* 把会话附着到之前已订阅的主题
* 拉取主题数据

用户发送 `topic` 为 `new12321`（普通主题）或 `nch12321`（频道）的 `{sub}` 来创建新群组主题，其中 `12321` 表示任意字符串，包括空字符串。服务端会创建主题，并向该会话回新主题名。

用户发送 `topic` 为对端用户 ID 的 `{sub}` 来创建新的点对点主题。

用户始终会被订阅到新创建的主题，当前会话也会附着上去。

如果用户和该主题之前没有关系，发送 `{sub}` 会建立关系。订阅意味着在会话所属用户和主题之间建立过去不存在的关系。

加入（附着到）主题意味着会话开始消费该主题的内容。服务端会根据上下文自动区分订阅和加入/附着：如果用户和主题之前没有关系，服务端先订阅用户，再把当前会话附着到主题。如果关系已存在，服务端只附着会话。订阅时，服务端会对照主题的 ACL 检查用户访问权限。它可能立刻授予访问、拒绝访问，或向主题管理者生成审批请求。

服务端用 `{ctrl}` 回复 `{sub}`。

`{sub}` 可以包含镜像 `{get}` 和 `{set}` 的 `get` 和 `set` 字段。如果带了，服务端会把它们当作随后在同一主题上的 `{set}` 和 `{get}`。如果设了 `get`，回复里可能包含 `{meta}` 和 `{data}`。

```js
sub: {
  id: "1a2b3",  // string，客户端提供的消息 id，可选
  topic: "me",  // 要订阅或附着的主题
  bkg: true,    // 由自动化代理发出的附着请求，服务端应延迟发送
                // 在线状态通知，因为该代理预计很快断开
  // 主题初始化数据，仅用于新主题和新订阅，镜像 {set}
  set: {
  // 新主题参数，镜像 {set desc}
    desc: {
      defacs: {
        auth: "JRWS", // string，新已认证订阅者的默认访问
        anon: "N"    // string，新匿名（未鉴权）订阅者的默认访问
      }, // 新主题的默认访问模式
      trusted: { ... }, // 系统管理分配的、由应用定义的载荷
      public: { ... }, // 描述主题的、由应用定义的载荷
      private: { ... } // 按用户区分的、由应用定义的私有内容
    }, // object，可选

    // 订阅参数，镜像 {set sub}。sub.user 必须为空
    sub: {
      mode: "JRWS", // string，请求的访问模式，可选；
                   // 默认：服务端定义
    }, // object，可选

    tags: [ // 字符串数组，更新 tags（见 fnd 主题说明），可选
        "email:alice@example.com", "tel:1234567890"
    ],

    cred: { // 更新凭证，可选
      meth: "email", // string，校验方法，例如 "email"、"tel"、"recaptcha" 等
      val: "alice@example.com", // string，要校验的凭证，例如邮箱或电话
      resp: "178307", // string，校验响应，可选
      params: { ... } // 该方法特有的参数，可选
    },

    aux: { ... } // 更新辅助数据
  },

  get: {
    // 向主题请求的元数据；空格分隔的列表，合法字符串
    // 是 "desc"、"sub"、"data"、"tags"；默认：什么都不请求；未知字符串会被忽略；
    // 细节见 {get what}
    what: "desc sub data", // string，可选

    // {get what="desc"} 的可选参数
    desc: {
      ims: "2015-10-06T18:07:30.038Z" // 时间戳，"if modified since"：
              // 仅当 public 或 private 至少有一个在该时间戳之后更新时才返回，可选
    },

    // {get what="sub"} 的可选参数
    sub: {
      ims: "2015-10-06T18:07:30.038Z", // 时间戳，"if modified since"：
              // 只返回该时间戳之后修改过的订阅，可选
      user: "usr2il9suCbuko", // string，只返回单个用户的结果，
                            // 除 me 以外的任意主题，可选
      topic: "usr2il9suCbuko", // string，只返回单个主题的结果，
                            // 仅 me 主题，可选
      limit: 20 // integer，限制返回对象数量
    },

    // {get what="data"} 的可选参数，细节见 {get what="data"}
    data: {
      since: 123, // integer，加载服务端签发 ID 大于等于此值的消息
            // （闭区间），可选
      before: 321, // integer，加载服务端顺序 ID 小于此值的消息
            // （开区间），可选
      limit: 20, // integer，限制返回对象数量，
                 // 默认：32，可选
    } // object，可选
  }
}
```

`trusted`、`private`、`public` 的格式见 [Trusted、Public、Private、Auxiliary 字段](#trustedpublicprivateauxiliary-字段)。

#### `{leave}`

这是 `{sub}` 的对位消息。它也承担两个职能：

* 离开主题但不退订（`unsub=false`）
* 退订（`unsub=true`）

服务端用 `{ctrl}` 回复 `{leave}`。不退订的离开只影响当前会话。退订会影响该用户的所有会话。

```js
leave: {
  id: "1a2b3",  // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND",   // string，要离开、退订或删除的主题，必填
  unsub: true // boolean，离开并退订，可选，默认：false
}
```

#### `{pub}`

用来向主题订阅者分发内容。

```js
pub: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND", // string，要发布到的主题，必填
  noecho: false, // boolean，抑制回显（见下），可选
  head: { key: "value", ... }, // 字符串键值对集合，可选
  content: { ... }  // object，要发布给主题订阅者的、由应用定义的内容，必填
}
```

主题订阅者在 [`{data}`](#data) 消息里收到 `content`。默认情况下，发起会话会像其他当前附着到该主题的会话一样收到一份 `{data}` 副本。如果发起会话不想收到自己刚发布的数据副本，把 `noecho` 设为 `true`。

`content` 格式见 [内容格式](#内容格式)。

`head` 字段目前定义了这些值：

* `attachments`：表示附在这条消息上的媒体路径数组，`["/v0/file/s/sJOD_tZDPz0.jpg"]`。
* `auto`：消息由自动程序发送时为 `true`，例如 chatbot 或自动回复。
* `forwarded`：表示这是一条转发消息，原消息的唯一 ID，`"grp1XUtEhjv6HND:123"`。
* `mentions`：消息里被提及（`@alice`）的用户 ID 数组：`["usr1XUtEhjv6HND", "usr2il9suCbuko"]`。
* `mime`：消息内容的 MIME-Type，`"text/x-drafty"`；`null` 或缺失视为 `"text/plain"`。
* `replace`：表示这是对另一条消息的更正/替换，被更新/替换消息在主题内的唯一 ID，`":123"`。
* `reply`：表示这是对另一条消息的回复，原消息的唯一 ID，`"grp1XUtEhjv6HND:123"`。
* `sender`：当消息以其他用户身份发送时，由服务端加上的发送者用户 ID，`"usr1XUtEhjv6HND"`。
* `thread`：表示这条消息属于某个会话线程，线程第一条消息在主题内的唯一 ID，`":123"`；`thread` 用来给扁平消息列表打标，而不是建树。
* `webrtc`：表示该消息所代表的视频通话状态的字符串。可能的值：
  * `"started"`：通话已发起，正在建立
  * `"accepted"`：通话已被接受并建立
  * `"finished"`：此前成功建立的通话已结束
  * `"missed"`：建立前超时
  * `"declined"`：被叫在建立前挂断
  * `"busy"`：因被叫正在另一通电话而拒绝
  * `"disconnected"`：服务端因其他原因终止（例如出错）
* `webrtc-duration`：表示视频通话时长（毫秒）的数字。

应用自定义字段应以 `x-` 开头。服务端目前还不强制这条规则，将来可能会。

唯一消息 ID 应尽可能写成 `<topic_name>:seq`，例如 `"grp1XUtEhjv6HND:123"`。如果省略主题，也就是 `":123"`，则假定是当前主题。

#### `{get}`

查询主题的元数据，例如描述或订阅者列表，或查询消息历史。请求者必须已 [订阅并附着](#sub) 到主题，才能收到完整响应。未附着时也能拿到有限的 `desc` 和 `sub` 信息。

```js
get: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND", // string，要请求数据的主题名
  what: "sub desc data del cred", // string，要查询的参数，空格分隔；
                        // 未知值会被忽略；必填

  // {get what="desc"} 的可选参数
  desc: {
    ims: "2015-10-06T18:07:30.038Z" // 时间戳，"if modified since"：
          // 仅当 public 或 private 至少有一个在该时间戳之后更新时才返回，可选
  },

  // {get what="sub"} 的可选参数
  sub: {
    ims: "2015-10-06T18:07:30.038Z", // 时间戳，"if modified since"：
          // 仅当 public 或 private 至少有一个在该时间戳之后更新时才返回，可选
    user: "usr2il9suCbuko", // string，只返回单个用户的结果，
                          // 除 me 以外的任意主题，可选
    topic: "usr2il9suCbuko", // string，只返回单个主题的结果，
                           // 仅 me 主题，可选
    limit: 20 // integer，限制返回对象数量
  },

  // {get what="data"} 的可选参数
  data: {
    since: 123, // integer，加载服务端签发 ID 大于等于此值的消息
                // （闭区间），可选
    before: 321, // integer，加载服务端顺序 ID 小于此值的消息
               // （开区间），可选
    limit: 20, // integer，限制返回对象数量，默认：32，可选
  },

  // {get what="del"} 的可选参数
  del: {
    since: 5, // integer，加载删除事务 ID 大于等于此值的已删除区间
              // （闭区间），可选
    before: 12, // integer，加载删除事务 ID 小于此值的已删除区间
                // （开区间），可选
    limit: 25, // integer，限制返回对象数量，默认：32，可选
  }
}
```

* `{get what="desc"}`

查询主题描述。服务端用包含所请求数据的 `{meta}` 回复。细节见 `{meta}`。
如果指定了 `ims` 且数据未更新，消息会跳过 `trusted`、`public` 和 `private` 字段。

未先 [附着](#sub) 到主题时，也能拿到有限信息。

`trusted`、`private`、`public` 的格式见 [Trusted、Public、Private、Auxiliary 字段](#trustedpublicprivateauxiliary-字段)。

* `{get what="sub"}`

获取订阅者列表。服务端用包含订阅者列表的 `{meta}` 回复。细节见 `{meta}`。
对 `me` 主题，请求返回的是用户的订阅列表。如果指定了 `ims` 且数据未更新，回一条 `{ctrl}`「未修改」。

未先 [附着](#sub) 到主题时，只返回用户自己的订阅。

* `{get what="tags"}`

查询已索引的 tags。服务端用包含字符串 tag 数组的 `{meta}` 回复。细节见 `{meta}` 和 `fnd` 主题。
只支持 `me` 和群组主题。

* `{get what="data"}`

查询消息历史。服务端发送匹配查询 `data` 字段参数的 `{data}` 消息。
这些数据消息不提供 `id` 字段，因为这对数据消息是常见做法。所有 `{data}` 传完后，会再发一条 `{ctrl}`。

* `{get what="del"}`

查询消息删除历史。服务端用包含已删除消息区间列表的 `{meta}` 回复。

* `{get what="cred"}`

查询 [凭证](#凭证校验)。服务端用包含凭证数组的 `{meta}` 回复。只支持 `me` 主题。

* `{get what="aux"}`

查询主题辅助数据。服务端用包含辅助键值对对象的 `{meta}` 回复。

#### `{set}`

更新主题元数据，删除消息或主题。请求者一般应已 [订阅并附着](#sub) 到主题。只有 `desc.private` 和请求者的 `sub.mode` 可以在未附着时更新。

```js
set: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND", // string，要更新的主题名，必填

  // 更新主题描述的可选载荷
  desc: {
    defacs: { // 新的默认访问模式
      auth: "JRWP",  // 已认证用户的访问权限
      anon: "JRW" // 匿名用户的访问权限
    },
    trusted: { ... }, // 系统管理分配的、由应用定义的载荷
    public: { ... }, // 描述主题的、由应用定义的载荷
    private: { ... } // 按用户区分的、由应用定义的私有内容
  },

  // 更新订阅的可选载荷
  sub: {
    user: "usr2il9suCbuko", // string，受此请求影响的用户；
                            // 默认（空）表示当前用户
    mode: "JRWP" // string，访问模式变更：user 已定义时是 given，
                 // user 未定义时是 requested
  }, // object，what == "sub" 时的载荷

  // 对 tags 的可选更新（见 fnd 主题说明）
  tags: [ // 字符串数组
    "email:alice@example.com", "tel:1234567890"
  ],

  cred: { // 对凭证的可选更新
    meth: "email", // string，校验方法，例如 "email"、"tel"、"recaptcha" 等
    val: "alice@example.com", // string，要校验的凭证，例如邮箱或电话
    resp: "178307", // string，校验响应，可选
    params: { ... } // 该方法特有的参数，可选
  },

  aux: { ... } // 由应用定义的键值对
}
```

#### `{del}`

删除消息、订阅、主题、用户。

```js
del: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND", // string，受影响的主题，对 "topic"、"sub"、
               // "msg" 必填
  what: "msg", // string，取 "topic"、"sub"、"msg"、"user"、"cred" 之一；
               // 要删除的是整个主题、一条订阅、部分或全部消息、
               // 一个用户、一条凭证；可选，默认："msg"
  hard: false, // boolean，请求硬删除还是仅标记为已删除；
               // what="msg" 时表示对所有用户删除还是只对当前用户；
               // 可选，默认：false
  delseq: [{low: 123, hi: 125}, {low: 156}], // 要删除的消息 ID 区间数组，
               // 左闭右开，也就是 [low, hi)，可选
  user: "usr2il9suCbuko" // string，被删除的用户（what="user"），
               // 或其订阅被删除的用户（what="sub"），可选
  cred: { // 要删除的凭证（仅 me 主题）
    meth: "email", // string，校验方法，例如 "email"、"tel" 等
    val: "alice@example.com" // string，被删除的凭证
  }
}
```

`what="msg"`

用户可以软删除 `hard=false`（默认）或硬删除 `hard=true` 消息。软删除只对请求用户隐藏消息，不从存储里删掉。软删除需要 `R` 权限。硬删除会从存储里删掉消息内容（`head`、`content`），留下一条消息桩，影响所有用户。硬删除需要 `D` 权限。可以在 `delseq` 里指定一个或多个消息 ID 区间来批量删除。每次删除操作会分配唯一的 `delete ID`。最大的 `delete ID` 会回写到 `{meta}` 的 `clear` 里。

`what="sub"`

删除订阅会把指定用户从主题订阅者中移除。需要 `A` 权限。用户不能删除自己的订阅，应改用 `{leave}`。如果是软删除（默认），只标记为已删除，不真正从存储里删记录。

`what="topic"`

删除主题会删掉主题本身，包括所有订阅和所有消息。只有所有者能删除主题。

`what="user"`

删除用户是非常重的操作，请谨慎。

`what="cred"`

删除凭证。已校验的凭证，以及从未尝试校验的凭证，会硬删除。校验失败过的凭证会软删除，防止同一用户再次使用。

#### `{note}`

客户端产生的短暂通知，转发给当前附着到该主题的其他客户端，例如正在输入、送达回执。这条消息是「发完即忘」：本身不落盘，服务端也不确认。判定为非法的消息会被静默丢弃。
`{note.recv}` 和 `{note.read}` 会改服务端上的持久状态。该值会被存储，并回写到 `{meta.sub}` 的对应字段。

```js
note: {
  topic: "grp1XUtEhjv6HND", // string，要通知的主题，必填
  what: "kp", // string，通知的动作类型
  seq: 123,   // integer，被确认的消息 ID，
              // recv 和 read 必填
  unread: 10, // integer，客户端报告的未读消息总数，可选
  event: "ringing", // string，子动作；目前只用于音视频通话，
                    // 当 what="call" 时
  payload: {  // object，call 和 data 的必填载荷
    ...
  }
}
```

目前定义了这些动作类型：

* `call`：视频通话状态更新。
* `data`：一段通用的结构化数据，通常是表单响应。
* `kp`：按键，也就是正在输入通知。客户端应用用它表示用户正在写新消息。
* `kpa`：正在录制音频消息。
* `kpv`：正在录制视频消息。
* `read`：用户已看到（已读）一条 `{data}`。同时隐含 `recv`。
* `recv`：客户端软件已收到 `{data}`，但用户可能还没看到。

`read` 和 `recv` 通知可以可选地带 `unread`，表示该客户端认定的未读消息总数。按用户统计的 `unread` 由服务端维护：向用户发送新 `{data}` 时递增，收到 `{note unread=...}` 时重置为报告值。服务端从不递减 `unread`。该值会包含在推送通知里，用来显示 iOS 角标。

### 服务端到客户端的消息

为特定请求生成、发往某个会话的消息会带 `id` 字段，等于原始消息的 id。服务端不解释 `id`。

大多数服务端到客户端的消息都有 `ts` 字段，表示服务端生成该消息的时间戳。

#### `{data}`

主题里发布的内容。这些是唯一会持久化到数据库的消息；`{data}` 会广播给所有拥有 `R` 权限的主题订阅者。

```js
data: {
  topic: "grp1XUtEhjv6HND", // string，分发这条消息的主题，始终存在
  from: "usr2il9suCbuko", // string，发布该消息的用户 id；
                          // 如果是服务端生成的，可能缺失
  head: { key: "value", ... }, // 字符串键值对集合，从 {pub} 原样传递，可选
  ts: "2015-10-06T18:07:30.038Z", // string，时间戳
  seq: 123, // integer，服务端签发的顺序 ID
  content: { ... } // object，与用户在 {pub} 里发布的内容完全一致
}
```

数据消息有 `seq` 字段，保存服务端生成的顺序数字 ID。ID 保证在主题内唯一。从 1 开始，主题每成功收到一条 [`{pub}`](#pub) 就加一。

`content` 格式见 [内容格式](#内容格式)。

`head` 字段的可能值见 [`{pub}`](#pub)。

#### `{ctrl}`

表示错误或成功条件的通用响应。发给发起会话。

```js
ctrl: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND", // string，主题名，如果这是某个主题上下文中的响应，可选
  code: 200, // integer，表示请求成功或失败的码，遵循 HTTP 状态码模型，始终存在
  text: "OK", // string，关于结果的更多细节，始终存在
  params: { ... }, // object，通用响应参数，取决于上下文，可选
  ts: "2015-10-06T18:07:30.038Z", // string，时间戳
}
```

#### `{meta}`

关于主题元数据或订阅者的信息，作为对 `{get}`、`{set}` 或 `{sub}` 的响应发给发起会话。

```js
meta: {
  id: "1a2b3", // string，客户端提供的消息 id，可选
  topic: "grp1XUtEhjv6HND", // string，主题名，如果这是某个主题上下文中的响应，可选
  ts: "2015-10-06T18:07:30.038Z", // string，时间戳
  desc: {
    created: "2015-10-24T10:26:09.716Z",
    updated: "2015-10-24T10:26:09.716Z",
    status: "ok", // 账号状态；仅 me 主题包含，且仅当
                  // 请求由 root 鉴权会话发出
    defacs: { // 主题的默认访问权限；仅当当前用户有 S 权限时出现
      auth: "JRWP", // 已认证用户的默认访问
      anon: "N" // 匿名用户的默认访问
    },
    acs: {  // 用户的实际访问权限
      want: "JRWP", // string，请求的访问权限
      given: "JRWP", // string，授予的访问权限
    mode: "JRWP" // string，want 与 given 的组合
    },
    seq: 123, // integer，最后一条 {data} 的服务端 id
    read: 112, // integer，用户通过 {note} 声称已读到的消息 ID，可选
    recv: 115, // integer，类似 read，但是已接收，可选
    clear: 12, // integer，如果有消息被删除，已删除消息的最大 ID，可选
    trusted: { ... }, // 系统管理可写、所有人可读的应用定义载荷
    public: { ... }, // 主题所有者可写、所有人可读的应用定义数据
    private: { ... } // 只对当前用户可见的应用定义数据
  }, // object，主题描述，可选
  sub:  [ // 对象数组，主题订阅者或用户的订阅，可选
    {
      user: "usr2il9suCbuko", // string，该订阅描述的用户 ID，
                            // 查询 me 时缺失
      updated: "2015-10-24T10:26:09.716Z", // 订阅上次变更的时间戳，
                                           // 仅请求者自己的订阅出现
      touched: "2017-11-02T09:13:55.530Z", // 主题上最后一条消息的时间戳
                                           // （将来也可能包含其他事件，例如新订阅者）
      acs: {  // 用户的访问权限
        want: "JRWP", // string，请求的访问权限，出现在用户自己的订阅上，
              // 以及请求者是主题管理者或所有者时
        given: "JRWP", // string，授予的访问权限，与 want 一样可选
        mode: "JRWP" // string，want 与 given 的组合
      },
      read: 112, // integer，用户通过 {note} 声称已读到的消息 ID，可选
      recv: 315, // integer，类似 read，但是已接收，可选
      clear: 12, // integer，如果有消息被删除，已删除消息的最大 ID，可选
      trusted: { ... }, // 系统管理分配的应用定义载荷
      public: { ... }, // 用户的 public 对象，查询 P2P 主题时缺失
      private: { ... } // 用户的 private 对象
      online: true, // boolean，用户当前在线状态；如果这是群组或 p2p 主题，
                    // 表示用户在该主题里是否在线，也就是是否已附着并在听消息；
                    // 如果这是对 me 查询的响应，表示该主题是否在线；
                    // p2p 只要对端在线就算在线，不一定附着到主题；
                    // 群组主题只要有至少一个活跃订阅者就算在线

      // 以下字段仅在查询 me 主题时出现

      topic: "grp1XUtEhjv6HND", // string，该订阅描述的主题
      seq: 321, // integer，最后一条 {data} 的服务端 id

      // 以下字段仅在查询 me 主题、且所描述的是 P2P 主题时出现
      seen: { // object，如果是 P2P 主题，对端上次在线信息
        when: "2015-10-24T10:26:09.716Z", // 时间戳
        ua: "Tinode/1.0 (Android 5.1)" // string，对端客户端的 user agent
      }
    },
    ...
  ],
  tags: [ // 该主题或用户（查询 me 时）被索引的 tag 数组
    "email:alice@example.com", "tel:+1234567890", "flowers"
  ],
  cred: [ // 用户凭证数组
    {
      meth: "email", // string，校验方法
      val: "alice@example.com", // string，凭证值
      done: true     // 校验状态
    },
    ...
  ],
  del: {
    clear: 3, // 最近一次适用的 delete 事务 ID
    delseq: [{low: 15}, {low: 22, hi: 28}, ...], // 已删除消息的 ID 区间
  },
  aux: { ... } // 主题管理者可写、主题订阅者可读的应用定义键值对
}
```

#### `{pres}`

Tinode 用 `{pres}` 通知客户端重要事件。另有一份 [文档](https://docs.google.com/spreadsheets/d/e/2PACX-1vStUDHb7DPrD8tF5eANLu4YIjRkqta8KOhLvcj2precsjqR40eDHvJnnuuS3bw-NcWsP1QKc7GSTYuX/pubhtml?gid=1959642482&single=true) 说明所有可能的使用场景。

```js
pres: {
  topic: "me", // string，接收该通知的主题，始终存在
  src: "grp1XUtEhjv6HND", // string，受此次变更影响的主题或用户，始终存在
  what: "on", // string，动作类型，发生了什么变化，始终存在
  seq: 123, // integer，what 为 msg 时，消息的服务端签发 ID，可选
  clear: 15, // integer，what 为 del 时，对删除事务 ID 的更新
  delseq: [{low: 123}, {low: 126, hi: 136}], // 区间数组，what 为 del 时，
             // 已删除消息的 ID 区间，可选
  ua: "Tinode/1.0 (Android 2.2)", // string，标识客户端软件的 User Agent，
             // what 为 on 或 ua 时出现，可选
  act: "usr2il9suCbuko",  // string，执行该动作的用户，可选
  tgt: "usrRkDVe0PYDOo",  // string，受该动作影响的用户，可选
  acs: {want: "+AS-D", given: "+S"} // object，访问模式变更，what 为 acs 时出现，可选
}
```

目前定义了这些动作类型：

* `on`：主题或用户上线
* `off`：主题或用户离线
* `ua`：user agent 变了，例如用户先用一个客户端登录，再用另一个登录
* `upd`：主题描述变了
* `tags`：主题 tags 变了
* `aux`：主题 aux 数据变了
* `acs`：访问权限变了
* `gone`：主题不再可用，例如被删了，或你被退订了
* `term`：对主题的订阅已终止，可以尝试重新订阅
* `msg`：有新消息
* `read`：收件人已读一条或多条消息
* `recv`：收件人已收到一条或多条消息
* `del`：消息被删除了

`{pres}` 是纯短暂消息：不存储，如果目标暂时不可用，也不会尝试稍后投递。

`{pres}` 消息没有时间戳。

#### `{info}`

转发后的客户端通知 `{note}`。服务端保证这条消息符合本规范，并且 `topic` 和 `from` 字段内容正确。其余内容从 `{note}` 原样拷贝，如果发起方愿意，它们可能不正确或有误导。

```js
info: {
  topic: "grp1XUtEhjv6HND", // string，受影响的主题，始终存在
  src: "usrRkDVe0PYDOo",  // string，事件发生的主题；
                          // 仅当 "topic": "me" 时出现
  from: "usr2il9suCbuko", // string，发布该消息的用户 id，始终存在
  what: "read", // string，取 "kp"、"recv"、"read"、"data" 之一，见客户端 {note}，始终存在
  seq: 123, // integer，客户端已确认的消息 ID，
            // 保证 0 < read <= recv <= {ctrl.params.seq}；recv 和 read 时出现
  event: "ringing", // string，音视频通话使用
  payload: { ... }  // object，任意载荷，视频通话使用
}
```
