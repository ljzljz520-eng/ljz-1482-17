import bcrypt from "bcryptjs";
import { PrismaClient, TaskStatus, TaskScenario, Role, MembershipStatus, TemplateFollowMode } from "@prisma/client";
import { logger } from "../src/config/logger.js";

const prisma = new PrismaClient();
const now = new Date();
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60_000);
const mb = (value) => BigInt(value * 1024 * 1024);

async function seed() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    logger.info("Database already seeded, skipping.");
    return;
  }

  const passwordHash = await bcrypt.hash("123456", 10);

  const studio = await prisma.tenant.create({
    data: {
      name: "北极星创作工作室",
      slug: "polaris",
      exportQuota: 100,
      storageLimit: mb(512),
      storageUsed: mb(22)
    }
  });
  const lab = await prisma.tenant.create({
    data: {
      name: "远岸数据实验室",
      slug: "farshore",
      exportQuota: 50,
      storageLimit: mb(256),
      storageUsed: mb(4)
    }
  });

  await prisma.billingAccount.create({
    data: { tenantId: studio.id, availableBalance: 200, heldAmount: 20, consumedTotal: 20, version: 1 }
  });
  await prisma.billingAccount.create({
    data: { tenantId: lab.id, availableBalance: 90, heldAmount: 0, consumedTotal: 10, version: 1 }
  });

  const admin = await prisma.user.create({
    data: {
      email: "admin@workspace.test",
      name: "林岚",
      passwordHash,
      activeTenantId: studio.id
    }
  });
  const member = await prisma.user.create({
    data: {
      email: "member@workspace.test",
      name: "周启明",
      passwordHash,
      activeTenantId: studio.id
    }
  });
  const leaving = await prisma.user.create({
    data: {
      email: "editor@workspace.test",
      name: "许一诺",
      passwordHash,
      activeTenantId: studio.id
    }
  });
  const other = await prisma.user.create({
    data: {
      email: "other@workspace.test",
      name: "顾南",
      passwordHash,
      activeTenantId: lab.id
    }
  });

  await prisma.membership.createMany({
    data: [
      { tenantId: studio.id, userId: admin.id, role: Role.OWNER, status: MembershipStatus.ACTIVE },
      { tenantId: studio.id, userId: member.id, role: Role.MEMBER, status: MembershipStatus.ACTIVE },
      { tenantId: studio.id, userId: leaving.id, role: Role.MEMBER, status: MembershipStatus.ACTIVE },
      { tenantId: lab.id, userId: leaving.id, role: Role.MEMBER, status: MembershipStatus.ACTIVE },
      { tenantId: lab.id, userId: other.id, role: Role.OWNER, status: MembershipStatus.ACTIVE }
    ]
  });

  const brand = await prisma.template.create({
    data: {
      tenantId: studio.id,
      name: "品牌发布物料",
      description: "固定品牌色、封面和发布检查清单。",
      versions: {
        create: [
          { version: "1.3.0", changelog: "稳定版本，适合年度物料", publishedAt: minutesAgo(40) },
          { version: "2.0.0", changelog: "新增视频封面与社媒尺寸", publishedAt: minutesAgo(10) }
        ]
      }
    },
    include: { versions: true }
  });
  const report = await prisma.template.create({
    data: {
      tenantId: studio.id,
      name: "季度数据报告",
      description: "指标页、结论摘要和客户附录。",
      versions: {
        create: [{ version: "1.0.0", changelog: "初始发布", publishedAt: minutesAgo(20) }]
      }
    },
    include: { versions: true }
  });
  const retro = await prisma.template.create({
    data: {
      tenantId: studio.id,
      name: "旧版活动复盘（已删除模板）",
      description: "用于验证删除模板不影响既有项目的来源快照。",
      deletedAt: minutesAgo(5),
      versions: {
        create: [{ version: "0.9.0", changelog: "归档版本", publishedAt: minutesAgo(80) }]
      }
    },
    include: { versions: true }
  });
  const labTemplate = await prisma.template.create({
    data: {
      tenantId: lab.id,
      name: "实验室保密报告",
      description: "其他租户模板，用于验证服务端隔离。",
      versions: { create: [{ version: "1.0.0", changelog: "私有", publishedAt: minutesAgo(3) }] }
    },
    include: { versions: true }
  });

  await prisma.templateFavorite.create({
    data: {
      userId: admin.id,
      templateId: brand.id,
      pinnedVersionId: brand.versions.find((item) => item.version === "1.3.0").id,
      mode: TemplateFollowMode.PINNED
    }
  });
  await prisma.templateFavorite.create({
    data: { userId: admin.id, templateId: report.id, mode: TemplateFollowMode.FOLLOWING }
  });
  await prisma.templateFavorite.create({
    data: { userId: member.id, templateId: report.id, mode: TemplateFollowMode.FOLLOWING }
  });
  await prisma.templateFavorite.create({
    data: { userId: other.id, templateId: labTemplate.id, mode: TemplateFollowMode.FOLLOWING }
  });

  const projectsData = [
    {
      name: "春季新品发布",
      summary: "跨渠道发布资产与落地页",
      content: "## 发布节奏\n\n1. 预热视频\n2. 媒体资料包\n3. 直播复盘",
      templateId: brand.id,
      version: "2.0.0"
    },
    {
      name: "Q2 增长复盘",
      summary: "漏斗、留存与投放效率",
      content: "## 指标\n\n- 激活率 +12%\n- 导出等待时间 -30%",
      templateId: report.id,
      version: "1.0.0"
    },
    {
      name: "客户成功案例",
      summary: "保留旧模板来源的历史项目",
      content: "## 背景\n\n项目仍可查看，但模板已删除。",
      templateId: retro.id,
      version: "0.9.0"
    },
    {
      name: "内部品牌规范",
      summary: "草稿、审核记录与游标恢复",
      content: "## 草稿\n\n这里有一段尚未保存到云端的本机编辑。",
      templateId: null,
      version: null
    }
  ];

  const projects = [];
  for (const item of projectsData) {
    const version = item.templateId
      ? (await prisma.templateVersion.findFirst({
          where: { templateId: item.templateId, version: item.version }
        }))
      : null;
    projects.push(
      await prisma.project.create({
        data: {
          tenantId: studio.id,
          name: item.name,
          summary: item.summary,
          content: item.content,
          createdById: admin.id,
          templateId: item.templateId,
          templateVersionId: version?.id,
          templateSnapshot: version ? `${item.name.includes("旧") ? "旧版活动复盘（已删除模板）" : item.templateId === brand.id ? "品牌发布物料" : "季度数据报告"}@${version.version}` : "空白项目"
        }
      })
    );
  }

  const privateProject = await prisma.project.create({
    data: {
      tenantId: lab.id,
      name: "租户隔离机密项目",
      summary: "北极星成员不应在服务端查询到该项目或下载链接。",
      content: "secret",
      createdById: other.id,
      templateId: labTemplate.id,
      templateVersionId: labTemplate.versions[0].id,
      templateSnapshot: "实验室保密报告@1.0.0"
    }
  });

  await prisma.projectVisit.createMany({
    data: [
      {
        tenantId: studio.id,
        userId: admin.id,
        projectId: projects[0].id,
        cursor: "第三章：媒体资料包",
        content: projects[0].content,
        visitedAt: minutesAgo(12)
      },
      {
        tenantId: studio.id,
        userId: admin.id,
        projectId: projects[3].id,
        cursor: "第 12 行：审核意见",
        content: projects[3].content,
        visitedAt: minutesAgo(2)
      }
    ]
  });

  const seedTasks = [
    {
      tenantId: studio.id,
      projectId: projects[0].id,
      requestedById: admin.id,
      clientRequestId: "seed-studio-running-001",
      status: TaskStatus.RUNNING,
      scenario: TaskScenario.NORMAL,
      estimatedUnits: 20,
      attempt: 0,
      workerId: "seed-historical-worker",
      leasedAt: minutesAgo(0.05),
      lastHeartbeatAt: minutesAgo(0.03),
      createdAt: minutesAgo(0.06)
    },
    {
      tenantId: studio.id,
      projectId: projects[1].id,
      requestedById: admin.id,
      clientRequestId: "seed-studio-success-001",
      status: TaskStatus.SUCCEEDED,
      scenario: TaskScenario.NORMAL,
      estimatedUnits: 8,
      actualUnits: 6,
      attempt: 0,
      resultName: "q2-growth-report.txt",
      resultBytes: mb(6),
      workerId: "seed-worker",
      completedAt: minutesAgo(60 * 24 * 2),
      createdAt: minutesAgo(60 * 24 * 2)
    },
    {
      tenantId: studio.id,
      projectId: projects[2].id,
      requestedById: member.id,
      clientRequestId: "seed-studio-success-002",
      status: TaskStatus.SUCCEEDED,
      scenario: TaskScenario.NORMAL,
      estimatedUnits: 6,
      actualUnits: 5,
      attempt: 0,
      resultName: "customer-story.txt",
      resultBytes: mb(5),
      workerId: "seed-worker",
      completedAt: minutesAgo(60 * 24),
      createdAt: minutesAgo(60 * 24)
    },
    {
      tenantId: studio.id,
      projectId: projects[0].id,
      requestedById: member.id,
      clientRequestId: "seed-studio-success-003",
      status: TaskStatus.SUCCEEDED,
      scenario: TaskScenario.NORMAL,
      estimatedUnits: 12,
      actualUnits: 9,
      attempt: 1,
      resultName: "launch-kit.txt",
      resultBytes: mb(11),
      workerId: "seed-worker",
      completedAt: minutesAgo(300),
      createdAt: minutesAgo(360)
    },
    {
      tenantId: studio.id,
      projectId: projects[3].id,
      requestedById: admin.id,
      clientRequestId: "seed-studio-failed-001",
      status: TaskStatus.FAILED,
      scenario: TaskScenario.FAIL_ONCE,
      estimatedUnits: 7,
      attempt: 0,
      failureReason: "历史失败示例；新失败任务可点击重试",
      workerId: "seed-worker",
      completedAt: minutesAgo(200),
      createdAt: minutesAgo(220)
    },
    {
      tenantId: lab.id,
      projectId: privateProject.id,
      requestedById: other.id,
      clientRequestId: "seed-lab-success-001",
      status: TaskStatus.SUCCEEDED,
      scenario: TaskScenario.NORMAL,
      estimatedUnits: 12,
      actualUnits: 10,
      attempt: 0,
      resultName: "private-lab-export.txt",
      resultBytes: mb(4),
      workerId: "seed-worker",
      completedAt: minutesAgo(10),
      createdAt: minutesAgo(20)
    }
  ];

  for (const data of seedTasks) {
    const created = await prisma.exportTask.create({ data });
    if (created.status === TaskStatus.SUCCEEDED) {
      await prisma.exportTask.update({
        where: { id: created.id },
        data: { resultUrl: `/api/exports/${created.id}/download` }
      });
    }
  }

  logger.info("Seed completed: admin@workspace.test / member@workspace.test / editor@workspace.test / other@workspace.test password 123456");
}

seed()
  .catch((error) => {
    logger.error({ err: error }, "Seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
