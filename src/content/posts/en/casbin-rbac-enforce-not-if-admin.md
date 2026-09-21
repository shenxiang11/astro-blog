---
title: Casbin RBAC is not if admin. It is (user, object, action)
description: How we wired Casbin into an internal IT helpdesk. The model only defines grammar, policies live in Postgres, handlers enforce capabilities, SQL limits rows, and the UI only hides entry points.
lang: en
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

The first permission check that grows in an app looks like this:

```ts
if (user.role === "admin") allow();
```

It does not stay one `if`. Supervisors assign tickets, agents change status, employees see only their own requests. Each rule becomes another branch. Change a role, and you hunt through handlers.

We built an internal IT helpdesk and collapsed that into one Casbin question: **can this user perform this action on this object?** The API is Rust / Axum. Policies live in Postgres. The shadcn UI trims menus from implicit permissions. This is the integration path, not a recap of the official docs.

## Table of contents

## A request asks three things

Casbin does not read your router or the role string in a JWT. It takes a triple:

```text
(subject, object, action)
(alice@acme.local, tickets, assign)
```

`subject` is the login email, so the policy screen stays readable. `object` is a business resource, not a URL. `action` is a capability: `read`, `write`, `assign`, `delete`, `manage`.

Every feature asks the same sentence:

```rust
rbac::require(&state, &user.email, "tickets", "read").await?;
```

`require` is `enforcer.enforce((email, object, action))`. `false` becomes 403. Handlers do not contain `if user.roles.contains("admin")`.

## The model is grammar, not business

`model.conf` does not name an admin. It only defines the shape of a request, a policy, a grouping, and the allow rule:

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

A few choices:

- `g(r.sub, p.sub)` walks user → role → parent role.
- `p.obj == "*"` / `p.act == "*"` gives admin a backstop so new resources do not need a patch.
- `keyMatch` leaves room for `tickets/*`. We do not use it yet.

Keep the model still. Put change into `p` and `g`.

## Inheritance lives in g

Four jobs, stacked:

```text
admin → supervisor → agent → requester
```

```text
g, agent, requester
g, supervisor, agent
g, admin, supervisor
```

Attach a permission to the **lowest role that needs it**:

| Role | Direct policies |
| --- | --- |
| requester | `tickets.create`, `tickets.read` |
| agent | `tickets.write` |
| supervisor | `tickets.assign`, `users.read`, `reports.read` |
| admin | `users.manage`, `policies.manage`, `tickets.delete`, `*, *` |

Alice's direct role is only `admin`. `get_implicit_roles_for_user` expands the chain. `get_implicit_permissions_for_user` collects every `p` along it. The sidebar reads the expansion, not the direct role.

User binding is also `g`:

```text
g, alice@acme.local, admin
g, dave@acme.local, requester
```

Changing a role means remove the old grouping and add a new one. Do not keep a second role column on `users` as source of truth.

## Put policies in Postgres

Do not treat `policy.csv` as production state. We use `sqlx-adapter` and the ecosystem table name `casbin_rule`:

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

A `p` rule uses `v0 v1 v2` (role, object, action). A `g` rule uses `v0 v1`. Unused columns stay empty strings.

The API shares the app pool with the adapter:

```rust
let model = DefaultModel::from_file("casbin/model.conf").await?;
let adapter = SqlxAdapter::new_with_pool(pool.clone()).await?;
let enforcer = Enforcer::new(model, adapter).await?;
```

`add_policy` / `add_grouping_policy` persist by default. When admin adds `p, requester, tickets, write` in the UI, Dave can change ticket status on the next request. Do not keep a second in-memory copy.

Seed only on an empty table. If rules already exist, skip seed, or the UI edits get wiped on boot.

## Enforce in handlers, not on paths

Path middleware looks neat until `GET /tickets` and `PATCH /tickets/:id` share an object and differ by action, and the same path means “all rows” or “my rows”.

The Enforcer sits on `AppState`. Each handler names a capability:

```rust
pub async fn assign(...) -> AppResult<Json<TicketView>> {
    rbac::require(&state, &user.email, "tickets", "assign").await?;
}

pub async fn delete(...) -> AppResult<Json<serde_json::Value>> {
    rbac::require(&state, &user.email, "tickets", "delete").await?;
}
```

JWT answers who you are. Middleware extracts `AuthUser { id, email }`. Casbin answers what that email can do. Keep those two filters apart.

## Two layers: capability, then rows

Dave has `tickets.read`. He must not see every ticket in the company. Do not put `r.sub == ticket.owner` in the matcher. That turns every row into a policy request and makes the policy screen unreadable.

```rust
rbac::require(&state, &user.email, "tickets", "read").await?;

let can_see_all = rbac::enforce(&state, &user.email, "tickets", "write").await?;
if can_see_all {
    // all tickets
} else {
    // WHERE requester_id = current user
}
```

Layer one: can you read tickets. Layer two: can you process tickets. If yes, see all; if not, see your own.

This is the usual production split. Casbin answers “can you enter this feature”. SQL answers “which rows”. Add new features along the same seam. Do not jump to ABAC first.

## The UI only hides doors

The client does not run Casbin and does not parse role strings. It consumes the expanded `permissions` from `/api/me` and hides doors in three places: the sidebar, the router, and the buttons. Enforcement still lives in the Enforcer.

### The session carries implicit permissions

Login returns a JWT and a Profile in one shot. The Profile has `direct_roles`, inherited `roles`, and every `p` along the chain. `AuthProvider` stores the token, then sends `Authorization` on each request. On reload it hits `/api/me` with the same token. The current Enforcer wins; a cached role name does not.

The tree asks permissions only through `allowed(object, action)`. The matcher and the client both understand `*`:

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

If Alice only has `admin, *, *`, `allowed("reports", "read")` is true. Dave's list has no such rule, so the same call is false.

After changing someone else's role, call `refresh()` and load `/api/me` again. Otherwise this tab still holds the old Profile and the buttons do not move.

### Filter the sidebar by capability

The menu is not five hard-coded entries. Each link names an object and an action:

```ts
const links = [
  { to: "/", label: "Overview", object: "tickets", action: "read" },
  { to: "/tickets", label: "Tickets", object: "tickets", action: "read" },
  { to: "/users", label: "People", object: "users", action: "read" },
  { to: "/reports", label: "Reports", object: "reports", action: "read" },
  { to: "/policies", label: "Policies", object: "policies", action: "manage" },
]
```

Filter before render. Dave does not see reports or policies. The footer shows `direct_roles` so you can read “I am hung on requester”. Do not use that string for checks.

`users` has one exception: `users.read` or `users.manage` both open the people page. Admin's wildcard already passes. The explicit `manage` keeps the item if you later drop `*`.

### Guard the route again

`RequireAuth` sends anonymous users to `/login`. Signed-in pages sit behind `Guard`, with the same object and action as the menu:

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

If Dave types `/reports`, `allowed` is false and the app goes to `/403`. That only blocks the UI. He can still call the API, so the handler `require` stays.

### Cut buttons with a finer action

Entering the ticket page does not mean edit, assign, or delete. Three controls on the same row ask three questions:

```tsx
{allowed("tickets", "create") && <Button>New ticket</Button>}
{allowed("tickets", "write") && <StatusSelect />}
{allowed("tickets", "assign") && <Button>Assign</Button>}
{allowed("tickets", "delete") && <Button>Delete</Button>}
```

Carol can change status and cannot assign. Bob can assign. Alice can delete. Dave only gets “New ticket” by default. After Alice adds `tickets.write` to `requester` and Dave refreshes the Profile, the status control appears.

### The policy page is a shell over the Enforcer

`/policies` itself needs `policies.manage`. Two tabs:

- `p`: add or remove `(subject, object, action)` via `POST/DELETE /api/policies`
- `g`: read-only user → role bindings, plus `admin → supervisor → agent → requester`

Adding a `p` writes `casbin_rule`. `add_policy` persists by default; no restart. Changing a role goes through `POST /api/roles/assign` on the people page and replaces that user's grouping.

Do not turn this screen into a second engine. It only exposes APIs Casbin already has, so “edit a rule, next request honors it” is easy to walk through.

## Adding a feature

Leave the model alone. Keep the triple. For a knowledge base `articles`:

1. Register the object name so the policy dropdown can select it.
2. Add `p` on the lowest role that needs it. Empty databases get seed; live databases get the policy UI or a migration. Seed will not run again.
3. Call `require(email, "articles", ...)` at the handler door.
4. If the user should see only their rows, `enforce` once more and add `WHERE`.
5. Update the client in three places: add a `links` item, wrap the route in `Guard`, and cut page buttons with `allowed("articles", ...)`. Call `refresh()` on sessions that are still open.

Admin already has `*, *`, so new objects are open to them. A policy on requester flows up the whole chain. Prefer hanging it on agent unless everyone should have it.

Role changes and new users only touch `g`. Do not write the same fact into a business table and `casbin_rule`.

## Walk the chain with four accounts

| Account | Direct role | What to look for |
| --- | --- | --- |
| `dave@acme.local` | requester | Own tickets only; no reports or policy menu |
| `carol@acme.local` | agent | Can change status, cannot assign |
| `bob@acme.local` | supervisor | Can assign and open reports |
| `alice@acme.local` | admin | Can edit `p` / `g`; next request picks it up |

Use Dave first for row scope. Then as Alice add `tickets.write` to `requester`, switch back to Dave, and the status control appears. That one loop checks persistence, inheritance, enforce, and a UI redraw from implicit permissions.

Casbin does one job here: remember who can do what to which object, and answer yes or no on every request. Inheritance, wildcards, and live policy edits all sit on that triple. When `if admin` starts spreading, fold it back into that sentence.
