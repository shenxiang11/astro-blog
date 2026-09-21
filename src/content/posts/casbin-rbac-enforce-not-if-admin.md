---
title: Casbin：权限检查不是 if admin，本质是 (用户, 资源, 操作)
description: 用一套内部 IT 服务台把 Casbin RBAC 落到 Postgres。Model 只定义语法，策略按角色继承展开，接口 enforce 管能力，SQL 管数据范围，前端只藏菜单。
lang: zh
pubDatetime: 2026-09-21T14:50:00Z
modDatetime: 2026-09-21T15:04:00Z
featured: true
draft: false
tags:
  - Casbin
  - RBAC
  - Rust
  - Postgres
timezone: Asia/Shanghai
---

权限代码里最容易长出来的是这种判断：

```ts
if (user.role === "admin") allow();
```

角色一多就散。主管能不能分派工单、客服能不能改状态、员工能不能只看自己的单，每一条都变成新的 `if`。改一个角色，要翻一遍接口。

我们做了一套内部 IT 服务台，用 [Casbin](https://casbin.org/) 把这件事收成一句请求：**这个人，能不能对这个资源做这个操作。** 后端是 Rust / Axum，策略存在 Postgres，前端用 shadcn 按权限裁菜单。下面按接入顺序写，不是 Casbin 官方文档的复述。

## 目录

## 一次请求只问三件事

Casbin 不认你的路由表，也不认 JWT 里的角色字符串。它只吃三元组：

```text
(subject, object, action)
(alice@acme.local, tickets, assign)
```

`subject` 我们用登录邮箱，策略页上能直接读。`object` 是业务资源，不是 URL。`action` 是能力：`read` / `write` / `assign` / `delete` / `manage`。

工单列表能不能看、报表能不能进、策略能不能改，全部问同一句：

```rust
rbac::require(&state, &user.email, "tickets", "read").await?;
```

`require` 内部就是 `enforcer.enforce((email, object, action))`。返回 `false` 就 403。接口不再出现 `if user.roles.contains("admin")`。

## Model 只定义语法

`model.conf` 不写谁是管理员。它只规定请求长什么样、策略长什么样、角色怎么继承、怎么判定允许：

```ini
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && (p.obj == "*" || keyMatch(r.obj, p.obj)) && (p.act == "*" || keyMatch(r.act, p.act))
```

几处有意为之：

- `g(r.sub, p.sub)` 让用户继承角色，角色再继承角色。
- `p.obj == "*"` / `p.act == "*"` 给 admin 一条兜底，不必给每个新资源补权限。
- `keyMatch` 预留 `tickets/*` 这种前缀，当前业务还没用上。

Model 改动成本高，尽量一次定稳。业务变化写 `p` 和 `g`，不要改 matcher。

## 角色继承写在 g 里

服务台四个岗位，能力是叠上去的：

```text
admin → supervisor → agent → requester
```

对应 grouping：

```text
g, agent, requester
g, supervisor, agent
g, admin, supervisor
```

权限挂在**最低需要它的角色**上：

| 角色 | 直接权限 |
| --- | --- |
| requester | `tickets.create`、`tickets.read` |
| agent | `tickets.write` |
| supervisor | `tickets.assign`、`users.read`、`reports.read` |
| admin | `users.manage`、`policies.manage`、`tickets.delete`、`*, *` |

Alice 的直接角色只有 `admin`。`get_implicit_roles_for_user` 会展开成 admin、supervisor、agent、requester。`get_implicit_permissions_for_user` 把沿途的 `p` 全部带出来。前端菜单吃的是展开结果，不是直接角色。

用户和角色的绑定也是 `g`：

```text
g, alice@acme.local, admin
g, dave@acme.local, requester
```

换角色就是删掉旧 grouping、加上新的。不要在 `users` 表再存一份角色当真相，否则两边会漂。

## 策略进 Postgres

生产里不要把 `policy.csv` 当真相。我们用 `sqlx-adapter`，表名按 Casbin 约定叫 `casbin_rule`：

```sql
CREATE TABLE casbin_rule (
    id SERIAL PRIMARY KEY,
    ptype VARCHAR NOT NULL,
    v0 VARCHAR NOT NULL,
    v1 VARCHAR NOT NULL,
    v2 VARCHAR NOT NULL,
    v3 VARCHAR NOT NULL,
    v4 VARCHAR NOT NULL,
    v5 VARCHAR NOT NULL,
    CONSTRAINT unique_key_sqlx_adapter UNIQUE (ptype, v0, v1, v2, v3, v4, v5)
);
```

`p` 规则占 `v0 v1 v2`（角色、资源、操作）。`g` 规则占 `v0 v1`（用户或上级角色、角色）。空列填空字符串，适配器靠这个对齐。

启动时用同一条 Postgres 连接池建 Enforcer：

```rust
let model = DefaultModel::from_file("casbin/model.conf").await?;
let adapter = SqlxAdapter::new_with_pool(pool.clone()).await?;
let enforcer = Enforcer::new(model, adapter).await?;
```

`add_policy` / `add_grouping_policy` 默认会写回数据库。admin 在页面上加一条 `p, requester, tickets, write`，Dave 下一次请求立刻能改工单状态。不要再维护一份内存副本。

空库才跑 seed。库里已经有策略时，启动不要覆盖，否则页面上改过的规则会被冲掉。

## 接口 enforce，不要按路径鉴权

有人会拿 `axum-casbin` 按 URL 做中间件。服务台这种业务接口不合适：`GET /tickets` 和 `PATCH /tickets/:id` 的 object 都是 `tickets`，差的是 action；同一条路径还可能「看全部」或「只看自己的」。

我们把 Enforcer 放进 `AppState`，每个 handler 自己声明能力：

```rust
pub async fn assign(...) -> AppResult<Json<TicketView>> {
    rbac::require(&state, &user.email, "tickets", "assign").await?;
    // 改 assignee
}

pub async fn delete(...) -> AppResult<Json<serde_json::Value>> {
    rbac::require(&state, &user.email, "tickets", "delete").await?;
    // 删行
}
```

JWT 只解决「你是谁」。中间件抽出 `AuthUser { id, email }`，Casbin 再用 email 问「你能做什么」。两件事不要揉进一个过滤器。

## 两层：Casbin 管能力，SQL 管范围

Dave 有 `tickets.read`，但不该看见全公司的单。这件事不要写进 matcher。matcher 里拼 `r.sub == ticket.owner` 会把每张工单都变成一次策略请求，也让策略页变得不可读。

我们的切法：

```rust
rbac::require(&state, &user.email, "tickets", "read").await?;

let can_see_all = rbac::enforce(&state, &user.email, "tickets", "write").await?;
if can_see_all {
    // 全表
} else {
    // WHERE requester_id = 当前用户
}
```

第一层：有没有读工单的能力。第二层：有没有处理工单的能力，有则看全部，没有则只看自己提交的。

这是生产里更常见的组合。Casbin 回答「能不能进这个功能」；行级范围留给 SQL。新功能也按这个缝去接，不要一上来就上 ABAC。

## 前端只藏入口

前端不实现 Casbin，也不自己解析角色字符串。它只消费 `/api/me` 展开后的 `permissions`，在三层藏入口：菜单、路由、按钮。拦截仍然在 Enforcer。

### 登录态里带着隐式权限

登录接口一次返回 JWT 和 Profile。Profile 里是 `direct_roles`、`roles`（继承展开）和 `permissions`（沿途所有 `p`）。`AuthProvider` 把 token 放进 `localStorage`，之后每个请求带 `Authorization`。刷新页面时用同一枚 token 打 `/api/me`，权限以服务端当前 Enforcer 为准，不信本地缓存的角色名。

整棵组件树只通过 `allowed(object, action)` 问权限。底层是通配符匹配，和 matcher 里的 `*` 对齐：

```ts
export function can(profile: Profile | null, object: string, action: string) {
  if (!profile) return false
  return profile.permissions.some(
    (item) =>
      (item.object === "*" || item.object === object) &&
      (item.action === "*" || item.action === action),
  )
}
```

Alice 只有一条 `admin, *, *` 时，`allowed("reports", "read")` 也为真。Dave 的列表里没有这条，同一句返回假。

改完别人的角色后要 `refresh()`，把 `/api/me` 再拉一遍。否则当前页还拿着旧 Profile，按钮不会动。

### 侧栏按能力滤一遍

菜单不是写死五个入口，而是带上资源和操作：

```ts
const links = [
  { to: "/", label: "总览", object: "tickets", action: "read" },
  { to: "/tickets", label: "工单", object: "tickets", action: "read" },
  { to: "/users", label: "人员", object: "users", action: "read" },
  { to: "/reports", label: "报表", object: "reports", action: "read" },
  { to: "/policies", label: "权限策略", object: "policies", action: "manage" },
]
```

渲染前 `filter`。Dave 看不见报表和策略。侧栏底部展示的是 `direct_roles`，方便对照「我挂的是 requester」，不要把它拿来做判断。

`users` 有一个例外：`users.read` 或 `users.manage` 都能进人员页。admin 的通配符本来就能过；显式 `manage` 是为了以后拆掉 `*` 时菜单还在。

### 路由再挡一层

没登录进 `RequireAuth`，去 `/login`。已登录的页面包在 `Guard` 里，对象和操作与菜单同一套：

```tsx
<Route element={<Guard object="tickets" action="read" />}>
  <Route path="/" element={<DashboardPage />} />
  <Route path="/tickets" element={<TicketsPage />} />
</Route>
<Route element={<Guard object="reports" action="read" />}>
  <Route path="/reports" element={<ReportsPage />} />
</Route>
<Route element={<Guard object="policies" action="manage" />}>
  <Route path="/policies" element={<PoliciesPage />} />
</Route>
```

Dave 手输 `/reports`，`allowed` 为假，跳到 `/403`。这只挡住 UI。他仍可以绕过前端打 API，所以 handler 里的 `require` 不能省。

### 按钮按更细的 action 裁

进了工单页不等于能改、能分派、能删。同一张表上三组控件问三句不同的话：

```tsx
{allowed("tickets", "create") && <Button>新建工单</Button>}
{allowed("tickets", "write") && <StatusSelect />}
{allowed("tickets", "assign") && <Button>分派</Button>}
{allowed("tickets", "delete") && <Button>删除</Button>}
```

Carol 能改状态，看不到分派。Bob 能分派。Alice 能删。Dave 默认只有「新建」。Alice 在策略页给 `requester` 加上 `tickets.write` 之后，Dave 刷新 Profile，行上才会出现改状态。

### 策略页就是 Enforcer 的壳

`/policies` 本身也要 `policies.manage`。页面分两个页签：

- `p`：增删 `(subject, object, action)`，打到 `POST/DELETE /api/policies`
- `g`：只读展示用户→角色，以及 `admin → supervisor → agent → requester`

加一条 `p` 会写入 `casbin_rule`。后端 `add_policy` 默认持久化，不必重启。换角色走「人员」页的 `POST /api/roles/assign`，替换该用户的 grouping。

策略页不要做成第二套权限引擎。它只是把 Casbin 已经有的 API 摊在桌上，方便把「改一条规则立刻生效」走通。

## 新功能怎么接

不要改 Model。继续用三元组。假设要加知识库 `articles`：

1. 在后端白名单里登记资源名，策略页下拉才选得到。
2. 给最低需要它的角色加 `p`。空库写进 seed；已经跑过的库用策略页或迁移插入，seed 不会再跑。
3. handler 入口 `require(email, "articles", "read" | "write" | "delete")`。
4. 需要「只看自己的」时，再用一次 `enforce` 决定 `WHERE`。
5. 前端同步三处：`links` 加菜单、`Guard` 包路由、页面里用 `allowed("articles", ...)` 裁按钮。改完策略后对还开着的会话调用 `refresh()`。

admin 已有 `*, *`，新资源默认全开。权限挂 requester，整条继承链都会有。所以宁可挂在 agent，也不要随手挂在最底层。

换角色、加用户，只动 `g`。不要在业务表和 `casbin_rule` 各写一份。

## 用四个账号把链路走通

| 账号 | 直接角色 | 用来看什么 |
| --- | --- | --- |
| `dave@acme.local` | requester | 只能看见自己的工单，没有报表和策略菜单 |
| `carol@acme.local` | agent | 能改状态，不能分派 |
| `bob@acme.local` | supervisor | 能分派，能进报表 |
| `alice@acme.local` | admin | 能改 `p` / `g`，改完立刻生效 |

密码都是演示用的。先用 Dave 确认数据范围，再用 Alice 给 `requester` 加上 `tickets.write`，切回 Dave，工单行上会出现改状态。这一下能同时验证：策略落库、继承展开、接口 enforce、前端按隐式权限重绘。

Casbin 在这套服务台里只做一件事：记住「谁对什么能做什么」，并在每次请求上回答是或否。角色继承、通配符、动态改策略，都建立在这个三元组上。`if admin` 散落在代码里时，先把它收成这一句。
