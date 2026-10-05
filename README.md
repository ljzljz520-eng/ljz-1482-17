# UserCenter 全栈工作区

一个可直接运行的多租户 UserCenter：网页集中展示项目游标、模板收藏、真实配额与导出历史；服务端统一认证授权，并通过 PostgreSQL 持久化成员关系、模板版本、项目、导出任务、计费预留/结算账目与工作器租约。

## 🛠 技术栈

- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Zustand + Axios + Lucide React
- Backend: Node.js 20 + Express + TypeScript + Prisma ORM + Zod + JWT + Pino
- Database: PostgreSQL 16，Docker Volume 持久化
- Infrastructure: Docker Compose、多阶段构建、Nginx API 反向代理

## 🚀 启动指南

1. 确保 Docker Desktop 或 Docker Engine 正在运行。
2. 在仓库根目录执行：

```bash
docker compose up --build
```

3. 首次启动会自动执行 Prisma migration 和 seed。
4. 浏览器访问：<http://localhost:3000>

## 🔗 服务地址

- Frontend: <http://localhost:3000>
- Backend Health: <http://localhost:8080/health>
- PostgreSQL: `localhost:5432`，用户/密码/数据库均为 `usercenter`

## 🧪 演示账号

| 账号 | 密码 | 用途 |
| --- | --- | --- |
| `admin@demo.local` | `123456` | 工作室 Owner，80 units，可删除/发布模板 |
| `member@demo.local` | `123456` | 普通成员，可验证退出团队限制与成员关系归档 |
| `low@demo.local` | `123456` | 仅 3 units，标准/高级导出触发配额不足 |
| `storage@demo.local` | `123456` | 存储配额仅 500 B，任意导出触发空间不足 |
| `leaving@demo.local` | `123456` | 退出团队验收账号 |

## 核心业务规则

### 1. 服务端统一授权与租户隔离

- 页面展示不是安全边界；所有 API 都要求 `Authorization: Bearer <token>`。
- JWT 每次请求都会重新查询 `Membership`，退出团队后状态为 `LEFT`，旧 token 立即失效。
- 项目、模板、任务、历史、账目和文件下载均带 `tenantId` 条件。
- 即使知道其他租户的 artifact id，后端也返回 404，而不是靠前端隐藏链接。

### 2. 项目游标与本机草稿

- 最近访问游标按 `(projectId, userId, deviceId)` 保存到 PostgreSQL，可跨设备恢复。
- 编辑草稿只存在本机 `localStorage`。
- 另一台设备的云游标不会自动覆盖本机未保存草稿；发现跨设备游标后需要用户显式载入。
- “清本机数据”只删除本机草稿、游标缓存、导出意图和登录态。
- “删云端项目”是独立服务端操作：软删除云端项目、删除云游标并释放未领取任务预留，不清本机数据。

### 3. 模板收藏版本策略

收藏时必须显式选择：

- **固定版本（PINNED）**：收藏绑定具体 `TemplateVersion`，模板发布后不跟随。
- **跟随最新发布（FOLLOW_LATEST）**：创建项目时读取模板当前版本。

创建项目会复制 `sourceSnapshot`。后续删除模板只是 `isDeleted=true`，既有项目仍保留模板名称、版本号和快照内容。

### 4. 预留、实际消费与释放账目

系统采用“**提交时预留，完成时结算**”，而不是提交即扣款：

1. `RESERVE`：提交任务时在 Serializable 事务中锁定租户行，检查余额与存储，增加预留和存储占用，不扣真实余额。
2. `CONSUME`：工作器成功完成后，按 `actualUnits` 扣减真实余额，并冲销同一笔预留。
3. `RELEASE`：失败、取消、过期或删除项目时，冲销预留并释放存储，不产生消费。
4. `CREDIT`：初始化充值。

页面同时展示：

- 真实余额 `balance`
- 未结预留 `sum(reservationDelta)`
- 可用余额 `balance - reserved`
- 未结任务数量
- 已用/总存储空间

与“提交时直接扣减”相比，预留方案能表达未结容量，避免失败后退款账目和余额竞态；完成时结算让真实消费只由工作器最终结果决定。

### 5. 幂等、重试、取消竞争

- 创建任务使用 `(tenantId, projectId, idempotencyKey)` 数据库唯一约束。
- 前端把一次导出意图持久化在本机；连续点击、刷新后重复点击都会返回同一任务，不重复预留。
- 失败任务先释放旧预留；重试时在事务中重新检查余额/存储，再建立一笔新的 `RESERVE`。
- 并发重试通过条件更新保证只有一个请求能把终态任务改回 `PENDING`。
- `PENDING` 取消：立即释放预留和存储。
- `RUNNING` 取消：设置 `cancelRequestedAt`；若工作器已越过不可取消点，任务仍可成功并按实际消费结算，否则按取消释放。
- 已成功任务不能取消；重复取消终态任务不会再入账。

### 6. 工作器失联与 Fencing Token

- 工作器领取任务时获得短租约和单调递增的 `leaseToken`。
- 完成/失败上报必须带原 token；租约过期后被其他工作器领取或被清理器回收，旧 token 会被拒绝。
- 后台清理器每 15 秒扫描过期 `RUNNING` 任务，将其置为 `EXPIRED` 并释放预留。
- UI 中可点“模拟失联”让租约立即过期，再运行清理器，并用旧 token 完成来验证拒绝逻辑。

## 建议验收路径

1. 使用 `admin@demo.local` 登录。
2. 连续快速点击“连续点击也只预留一次”，只出现一条任务和一条 `RESERVE`。
3. 点击“工作器领取”：
   - 正常完成：出现 `CONSUME`，真实余额下降，预留归零，可鉴权下载。
   - 上报失败：出现 `RELEASE`，再点“安全重试”，只新增一次预留。
   - 领取后取消并完成：验证“取消后任务仍完成”的竞争结算。
   - 模拟失联：运行清理器后用旧 token 完成会被拒绝。
4. 切换 `low@demo.local`，选择标准/高级导出，验证余额不足时没有任何预留或扣减。
5. 切换 `storage@demo.local`，验证存储空间不足。
6. 打开两个浏览器窗口模拟两台设备，保存云游标后验证可恢复；一侧保留未保存草稿，另一侧云游标不得自动覆盖。
7. 分别点击“清本机数据”和“删云端项目”，确认两者互不影响。
8. 用 Owner 发布/删除模板，再查看从旧模板创建的项目来源仍在。
9. 用 `leaving@demo.local` 登录并退出团队，刷新后旧会话无法继续访问 API。

## 目录结构

```text
backend/
  prisma/schema.prisma         # 关系模型
  prisma/migrations/           # 可部署 SQL migration
  prisma/seed.ts               # 幂等演示数据
  src/routes/                  # auth/projects/templates/exports API
  src/services/taskService.ts  # 预留、结算、取消、重试、租约、清理器
  src/middleware/auth.ts       # JWT 与成员关系鉴权
frontend/
  src/pages/Login.tsx          # 登录与演示账号
  src/pages/Dashboard.tsx      # 全栈工作区
  nginx.conf                   # /api 到 backend:8080 的代理
docker-compose.yml             # db/backend/frontend 一键启动
```

## 开发说明

容器内已完成依赖安装和构建，不依赖本机 Node.js。若在本机进行开发，可分别参考：

```bash
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev
```

本地 Vite 开发服务器会把 `/api` 代理到后端开发端口；容器网络中前端始终通过服务名 `backend:8080` 访问 API。
