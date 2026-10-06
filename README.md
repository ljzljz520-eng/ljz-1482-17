# UserCenter 全栈团队工作区

UserCenter 已从静态展示站改造为完整的多租户团队工作区，覆盖项目游标、模板收藏、导出任务、真实配额、账目流水和成员关系管理。

## 核心能力

- **统一服务端授权**：登录后签发 JWT，所有项目、模板、导出历史和下载链接都在后端按 `tenantId` 过滤，不能通过前端隐藏链接或猜测任务 ID 越权。
- **关系数据库持久化**：PostgreSQL + Prisma 保存用户、团队成员、项目、模板版本、收藏、访问游标、导出任务和账单流水。
- **配额预留与结算**：提交导出时校验真实余额与团队实际配额并冻结预留；任务完成时按实际消费结算并释放未用部分；取消、失败重试和工作器失联不会重复扣费。
- **取消竞争处理**：排队任务立即取消并释放；运行中任务进入 `CANCELLING`；正常任务取消优先，演示场景可验证“取消请求已发出但工作器仍完成”时仅成功结算一次。
- **跨设备游标与本机草稿保护**：云端最近访问游标可跨设备恢复，但检测到本机草稿时不会自动覆盖，必须由用户手动恢复云端或显式保存上云。
- **模板版本策略**：收藏必须选择“固定版本”或“跟随最新发布”；模板软删除后，既有项目的 `templateSnapshot` 和版本关系仍保留。
- **独立的数据清理操作**：清理浏览器缓存只删除本机 token、草稿和游标缓存；删除云端项目是独立的服务端软删除操作，不会相互级联。

## 技术栈

- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Zustand + Axios + React Hot Toast
- Backend: Node.js 20 + Express + Prisma ORM + JWT + Zod + Pino
- Database: PostgreSQL 16
- Infrastructure: Docker Compose、Nginx 反向代理、Docker Volume 持久化

## 启动指南

1. 确保 Docker Desktop 或 Docker Engine 已启动。
2. 在仓库根目录执行：

```bash
docker compose up --build
```

3. 等待数据库健康检查、Prisma 表同步和种子脚本完成。
4. 打开前端：<http://localhost:3000>
5. API 健康检查：<http://localhost:4000/health>

> 后端容器启动时会自动执行 `prisma db push` 和种子脚本；PostgreSQL 数据保存在 Docker Volume `postgres-data` 中。如需从空库重新验收，先执行 `docker compose down -v`。

## 服务地址

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:4000/api>
- Health Check: <http://localhost:4000/health>
- Database: `localhost:5432`，数据库 `usercenter`，用户 `usercenter`，密码 `usercenter_pass`

## 测试账号

所有账号密码均为：`123456`

| 账号 | 团队 | 用途 |
| --- | --- | --- |
| `admin@workspace.test` | 北极星创作工作室 | 团队所有者，可发布/删除模板、查看完整账目 |
| `member@workspace.test` | 北极星创作工作室 | 普通成员，可创建导出、验证成员权限 |
| `editor@workspace.test` | 北极星创作工作室 | 用于验收“退出团队”；若有未结任务服务端会拒绝 |
| `other@workspace.test` | 远岸数据实验室 | 第二个租户，用于验证历史和下载链接的服务端租户隔离 |

## 页面与验收路径

1. **工作台**：查看真实可用余额、冻结预留、累计实际消费、实际配额、未结任务和存储空间。
2. **项目与游标**：打开项目、编辑本机草稿、保存云端游标；在另一设备或另一浏览器登录可看到恢复提示，但不会自动覆盖本机草稿。
3. **模板收藏**：在固定版本与跟随发布之间切换，发布新版本，删除模板后检查既有项目来源。
4. **导出历史**：
   - 正常完成：预留大于实际消费，完成后返还差额。
   - 失败后重试：旧失败预留先释放，重试重新预留并成功结算。
   - 取消竞争：验证取消后工作器仍完成时只有一次结算。
   - 工作器失联：停止心跳后由服务端超时巡检标记失败并释放。
   - 存储空间不足：服务端在结果落盘前拒绝并释放预留。
   - 重复点击：同一 `clientRequestId` 只返回同一任务，不会重复冻结。
5. **配额账目**：查看 `RESERVE / SETTLE / RELEASE` 流水、余额变动、冻结变动和操作后余额。
6. **设置与验收**：执行清本机数据、退出团队，并查看所有验收预期。

## 账目模型

每次导出的账目顺序如下：

1. **提交时预留 `RESERVE`**：事务内检查团队剩余实际配额和账户可用余额，然后减少可用余额、增加冻结额。
2. **完成时结算 `SETTLE`**：实际消费不能超过预留；释放全部冻结，将未使用差额返还可用余额，并只把实际消费计入累计消费。
3. **取消/失败/失联释放 `RELEASE`**：未结算任务释放全部冻结；已结算任务的重复取消或重复完成回调不会再次入账。

数据库通过任务状态条件更新、Prisma 事务、账户版本号和唯一 `entryKey` 防止并发重复扣减。

## 目录结构

```text
backend/
  prisma/schema.prisma       # 关系模型与枚举
  prisma/seed.js             # 自动演示数据
  src/routes/                # 认证、项目、模板、导出、账目接口
  src/services/              # 租户授权、额度事务、任务状态机
  src/workers/               # 内置导出工作器和心跳失联巡检
frontend/
  src/components/pages/      # 工作台、项目、模板、导出、账目、设置页面
  src/context/               # 登录态
  src/api/                   # Axios 客户端和类型化接口
  nginx.conf                 # /api 代理到 backend:4000
docker-compose.yml           # db + backend + frontend
```
