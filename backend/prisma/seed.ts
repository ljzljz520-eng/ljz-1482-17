import { PrismaClient, Role, TemplateMode } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pino } from 'pino';

const logger = pino();
const prisma = new PrismaClient();

async function ensureTenant(input: {
  slug: string;
  name: string;
  balance: number;
  storageQuota: number;
  users: Array<{ slug: string; email: string; name: string; role?: Role; password: string }>;
}) {
  const tenant = await prisma.tenant.upsert({
    where: { id: input.slug },
    update: { name: input.name, balance: input.balance, storageQuota: input.storageQuota },
    create: { id: input.slug, name: input.name, balance: input.balance, storageQuota: input.storageQuota }
  });

  const users = [];
  for (const item of input.users) {
    const passwordHash = await bcrypt.hash(item.password, 10);
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: { name: item.name },
      create: { id: item.slug, email: item.email, name: item.name, passwordHash }
    });
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } }
    });
    if (!membership) {
      await prisma.membership.create({
        data: { userId: user.id, tenantId: tenant.id, role: item.role ?? Role.MEMBER, status: 'ACTIVE' }
      });
    }
    users.push(user);
  }

  const ledgerCount = await prisma.ledgerEntry.count({ where: { tenantId: tenant.id } });
  if (ledgerCount === 0) {
    await prisma.ledgerEntry.create({
      data: {
        tenantId: tenant.id,
        kind: 'CREDIT',
        units: input.balance,
        amount: input.balance,
        reservationDelta: 0,
        storageDelta: 0,
        balanceAfter: input.balance,
        note: '演示租户初始化充值'
      }
    });
  }
  return { tenant, users };
}

async function ensureProject(tenantId: string, name: string) {
  const existing = await prisma.project.findFirst({ where: { tenantId, name } });
  if (existing) return existing;
  return prisma.project.create({ data: { tenantId, name, status: 'ACTIVE' } });
}

async function main() {
  const studio = await ensureTenant({
    slug: '11111111-1111-1111-1111-111111111101',
    name: '云溪创作工作室',
    balance: 80,
    storageQuota: 50000,
    users: [
      { slug: '22222222-2222-2222-2222-222222222201', email: 'admin@demo.local', name: '林岚', role: Role.OWNER, password: '123456' },
      { slug: '22222222-2222-2222-2222-222222222202', email: 'member@demo.local', name: '周野', role: Role.MEMBER, password: '123456' }
    ]
  });

  const lowQuota = await ensureTenant({
    slug: '11111111-1111-1111-1111-111111111102',
    name: '低配额验收团队',
    balance: 3,
    storageQuota: 50000,
    users: [{ slug: '22222222-2222-2222-2222-222222222203', email: 'low@demo.local', name: '额度紧张', role: Role.OWNER, password: '123456' }]
  });

  const tinyStorage = await ensureTenant({
    slug: '11111111-1111-1111-1111-111111111103',
    name: '存储不足验收团队',
    balance: 40,
    storageQuota: 500,
    users: [{ slug: '22222222-2222-2222-2222-222222222204', email: 'storage@demo.local', name: '存储紧张', role: Role.OWNER, password: '123456' }]
  });

  const exTeam = await ensureTenant({
    slug: '11111111-1111-1111-1111-111111111104',
    name: '退出验收团队',
    balance: 30,
    storageQuota: 20000,
    users: [{ slug: '22222222-2222-2222-2222-222222222205', email: 'leaving@demo.local', name: '准备退出', role: Role.MEMBER, password: '123456' }]
  });

  const brandTemplate = await prisma.template.findFirst({ where: { tenantId: studio.tenant.id, name: '品牌月报' } });
  if (!brandTemplate) {
    const template = await prisma.template.create({
      data: {
        tenantId: studio.tenant.id,
        name: '品牌月报',
        description: '适合产品数据、运营复盘和成员协作的固定排版模板',
        currentVersion: 2,
        versions: {
          create: [
            { version: 1, body: JSON.stringify({ layout: 'single-column', accent: 'blue' }), changeNote: '首版发布' },
            { version: 2, body: JSON.stringify({ layout: 'two-column-kpi', accent: 'indigo' }), changeNote: '新增 KPI 卡片' }
          ]
        }
      },
      include: { versions: { where: { version: 2 } } }
    });
    await prisma.templateFavorite.upsert({
      where: { userId_templateId: { userId: studio.users[0].id, templateId: template.id } },
      update: { mode: TemplateMode.PINNED, versionId: template.versions[0].id },
      create: { userId: studio.users[0].id, templateId: template.id, versionId: template.versions[0].id, mode: TemplateMode.PINNED }
    });
  }

  const socialTemplate = await prisma.template.findFirst({ where: { tenantId: studio.tenant.id, name: '社媒海报' } });
  if (!socialTemplate) {
    const template = await prisma.template.create({
      data: {
        tenantId: studio.tenant.id,
        name: '社媒海报',
        description: '验证收藏可选择跟随最新发布版本',
        currentVersion: 1,
        versions: { create: { version: 1, body: JSON.stringify({ format: '9:16', tone: 'warm' }), changeNote: '初始海报' } }
      }
    });
    await prisma.templateFavorite.upsert({
      where: { userId_templateId: { userId: studio.users[0].id, templateId: template.id } },
      update: { mode: TemplateMode.FOLLOW_LATEST, versionId: null },
      create: { userId: studio.users[0].id, templateId: template.id, mode: TemplateMode.FOLLOW_LATEST }
    });
  }

  const reportCount = await prisma.project.count({ where: { tenantId: studio.tenant.id, name: '十月增长月报' } });
  if (reportCount === 0) {
    const source = await prisma.template.findFirstOrThrow({
      where: { tenantId: studio.tenant.id, name: '品牌月报' },
      include: { versions: { where: { version: 2 } } }
    });
    await prisma.project.create({
      data: {
        tenantId: studio.tenant.id,
        name: '十月增长月报',
        sourceTemplateId: source.id,
        sourceVersionId: source.versions[0].id,
        sourceSnapshot: JSON.stringify({ name: source.name, version: 2, preserved: true, body: source.versions[0].body })
      }
    });
  }

  await ensureProject(lowQuota.tenant.id, '低配额项目');
  await ensureProject(tinyStorage.tenant.id, '小存储项目');
  await ensureProject(exTeam.tenant.id, '退出成员项目');
}

main()
  .then(async () => {
    logger.info('database seed completed');
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    logger.error({ err: error }, 'database seed failed');
    await prisma.$disconnect();
    process.exit(1);
  });
