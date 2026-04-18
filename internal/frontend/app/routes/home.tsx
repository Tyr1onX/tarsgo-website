import type { Route } from "./+types/home";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Navbar } from "../components/navbar";
import { Link } from "react-router";
import { fetchOptionalCurrentUserFromRequest } from "~/lib/server-auth";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TARS-Go | 吉林大学吉甲大师战队" },
    {
      name: "description",
      content:
        "吉林大学TARS-Go战队官网 - RoboMaster机甲大师赛参赛战队，外在做事沉稳有序，内在思维活跃创新",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  return {
    currentUser: await fetchOptionalCurrentUserFromRequest(request),
  };
}

const stats = [
  {
    icon: "calendar",
    value: "2018",
    label: "成立年份",
    color: "bg-accent-primary",
  },
  {
    icon: "users",
    value: "35+",
    label: "团队成员",
    color: "bg-accent-secondary",
  },
  {
    icon: "layers",
    value: "6",
    label: "技术组别",
    color: "bg-accent-tertiary",
  },
  {
    icon: "award",
    value: "Top 16",
    label: "全国最佳成绩",
    color: "bg-accent-gold",
  },
];

const timelineMilestones = [
  {
    year: "2018",
    title: "启航",
    intro: "吉林大学吉甲大师双创基地正式组建，团队开始以机器人竞赛与人工智能挑战为核心方向持续推进。",
    highlights: [
      "正式组建吉林大学吉甲大师双创基地。",
      "搭建机械、电控、视觉核心团队。",
      "开启 ICRA 人工智能挑战赛征程。",
    ],
    images: ["/assets/images/Milestone/2018_SetSail.png"],
  },
  {
    year: "2019",
    title: "突破",
    intro: "团队在国际挑战赛和 RoboMaster 赛场同步迈出关键一步，招新与培养体系也开始快速铺开。",
    highlights: [
      "首次出征 ICRA 人工智能挑战赛（蒙特利尔），获得三等奖。",
      "参加 ICCV 计算机视觉挑战赛（首尔）。",
      "开启全国大学生 RoboMaster 对抗赛征程。",
      "开展暑期夏令营和冬令营，跨南岭、南湖、南区，参与学院多达 12 个。",
    ],
    images: ["/assets/images/Milestone/2019_Breakthrough.png"],
  },
  {
    year: "2020",
    title: "全国佳绩",
    intro: "创业实践与竞赛成绩同步拉升，团队在全国与国际赛场都拿到了阶段性成果。",
    highlights: [
      "开展创业实践项目，获得挑战杯中国大学生创业计划竞赛全国金奖。",
      "首次参赛全国大学生 RoboMaster 对抗赛，获 2020 线上赛全国一等奖。",
      "ICRA 人工智能挑战赛获二等奖。",
    ],
    images: [
      "/assets/images/Milestone/2020_FirstAchievement1.png",
      "/assets/images/Milestone/2020_FirstAchievement2.png",
    ],
  },
  {
    year: "2021",
    title: "技术迭代",
    intro: "这一年完成了从竞赛经验积累到组织体系升级的关键过渡，六大组别逐步成型。",
    highlights: [
      "创业实践获得互联网+国际大学生创新创业大赛国家级银奖。",
      "建立机械、视觉、电控、AI、软件、运营 6 个组别。",
      "ICRA 人工智能挑战赛获二等奖。",
      "全国大学生 RoboMaster 对抗赛三等奖。",
      "高校联盟赛·黑龙江站八强。",
    ],
    images: ["/assets/images/Milestone/2021_TechnologicalIteration.png"],
  },
  {
    year: "2022",
    title: "传承体系",
    intro: "团队继续把人才培养和项目训练机制制度化，逐步形成更稳定的传帮带节奏。",
    highlights: [
      "创业实践获得互联网+国际大学生创新创业大赛国家级铜奖。",
      "完善培育体系，继续开展冬夏令营。",
      "全国大学生 RoboMaster 对抗赛三等奖。",
    ],
    images: [
      "/assets/images/Milestone/2022_InheritanceSystem1.png",
      "/assets/images/Milestone/2022_InheritanceSystem2.png",
    ],
  },
  {
    year: "2023",
    title: "文化建设",
    intro: "在竞赛之外，团队的品牌、文化和学术成果也进一步沉淀，开始形成更完整的外部影响力。",
    highlights: [
      "创业实践获得国际大学生创新大赛国家级铜奖。",
      "中国大学生计算机大赛国家级二等奖。",
      "全国大学生 RoboMaster 对抗赛三等奖。",
    ],
    images: [
      "/assets/images/Milestone/2023_CulturalDevelopment1.png",
      "/assets/images/Milestone/2023_CulturalDevelopment2.png",
    ],
  },
  {
    year: "2024",
    title: "首进国赛",
    intro: "团队在 RoboMaster 主赛道实现关键突破，首次挺进全国总决赛，完成阶段性里程碑。",
    highlights: [
      "全国大学生 RoboMaster 对抗赛东部赛区八强。",
      "晋级全国总决赛。",
      "获国家级二等奖、英雄一等奖。",
    ],
    images: ["/assets/images/Milestone/2024_NationalCompetition.png"],
  },
  {
    year: "2025",
    title: "薪火相传",
    intro: "在新老交替中继续完成机器人体系升级，团队在联盟赛和全国赛中稳定输出成绩。",
    highlights: [
      "新老传承持续推进，机器人全面升级。",
      "RM 高校联盟赛·辽宁站季军。",
      "全国大学生 RoboMaster 对抗赛国家级二等奖。",
      "工程一等奖、英雄一等奖等。",
    ],
    images: ["/assets/images/Milestone/2025_Legacy.png"],
  },
];

const robots = [
  {
    name: "英雄机器人",
    description: "火力担当，42mm 弹丸发射，打击效率最高",
  },
  {
    name: "步兵机器人",
    description: "灵活机动，17mm 弹丸射击，场上主力输出",
  },
  {
    name: "工程机器人",
    description: "资源采集与弹药补给，战场后勤保障",
  },
  {
    name: "哨兵机器人",
    description: "自主决策与自动瞄准，AI 驱动防御",
  },
  {
    name: "空中机器人",
    description: "空中侦察与空地协同，空中打击威胁",
  },
];

const robotImages = [
  "/assets/images/Robot/HeroRobot.jpg",
  "/assets/images/Robot/InfantryRobot.jpg",
  "/assets/images/Robot/EngineeringRobot.jpg",
  "/assets/images/Robot/SentinelRobot.jpg",
  "/assets/images/Robot/AerialRobots.jpg",
];

const achievementCertificates = [
  "/assets/images/CertificateOfAchievement/189fdebe075f2b2a425cc032852caee2.jpg",
  "/assets/images/CertificateOfAchievement/1dbf37a0cc85d1f3db363313d2460ba2.jpg",
  "/assets/images/CertificateOfAchievement/2138180547a10616f528f0b4a6f860f0.jpg",
  "/assets/images/CertificateOfAchievement/333f34f4ccd4639efe0a9d5be5b7755f.png",
  "/assets/images/CertificateOfAchievement/44dd97dc7af3ce600b404b742cd9bcd9.jpg",
  "/assets/images/CertificateOfAchievement/45acb4afe387a629b1c55cef3e44854f.jpg",
  "/assets/images/CertificateOfAchievement/4c7c8f9d37a3889010963ade17b85290.jpg",
  "/assets/images/CertificateOfAchievement/58fd9666b54ccf3f9c4f6bf47bc5acb3.jpg",
  "/assets/images/CertificateOfAchievement/67b19286d79aab85320755e120ab77e7.png",
  "/assets/images/CertificateOfAchievement/7145ec7f7d705e4ff83eadd902f11213.jpg",
  "/assets/images/CertificateOfAchievement/847747a76123517722ddbae81f2a03e5.jpg",
  "/assets/images/CertificateOfAchievement/8b29ef58b61e5875d489605b42f142ca.png",
  "/assets/images/CertificateOfAchievement/8b3d497b3ef2cb878e5fe7c5074466d6.jpg",
  "/assets/images/CertificateOfAchievement/8e56a495087d0c8d94d21b0078a9076e.jpg",
  "/assets/images/CertificateOfAchievement/9b04720073b9306b9e173246d5e891f4.jpg",
  "/assets/images/CertificateOfAchievement/9c90b1dcaf141a4dc6bc1b422ded2f94.jpg",
  "/assets/images/CertificateOfAchievement/a49ec7d4fc4105d59620b004b54f50d7.jpg",
  "/assets/images/CertificateOfAchievement/b826ac9abe537c256973c643544d1bfb.png",
  "/assets/images/CertificateOfAchievement/c44b45e9bce4372f101c56bbf71994c5.jpg",
  "/assets/images/CertificateOfAchievement/cad783e731ee5328f3894a9109301923.jpg",
  "/assets/images/CertificateOfAchievement/ceb2d8e6896447f4d5c17da2ecd1467e.jpg",
  "/assets/images/CertificateOfAchievement/dd3e82687cc57af11b1b59828fc43556.jpg",
  "/assets/images/CertificateOfAchievement/de58b36ee1169fb6170a70cbd42df164.jpg",
  "/assets/images/CertificateOfAchievement/e3558818a91d970a7d48883db6a8ae50.jpg",
  "/assets/images/CertificateOfAchievement/f5f004b168579608071d03a9fb047852.jpg",
];

const sponsorLogos = [
  { name: "YELITE", image: "/assets/images/Sponsors/YELITE.jpg" },
  { name: "AMASS", image: "/assets/images/Sponsors/amass.jpg" },
  { name: "驰翔股份", image: "/assets/images/Sponsors/cxgf.jpg" },
  { name: "金地卓立", image: "/assets/images/Sponsors/jdzl.jpg" },
  { name: "吉利汽车", image: "/assets/images/Sponsors/jlc.jpg" },
  { name: "吉运模压器", image: "/assets/images/Sponsors/jyymq.jpg" },
  { name: "坤乾科技", image: "/assets/images/Sponsors/kqkj.jpg" },
  { name: "联讯科技", image: "/assets/images/Sponsors/lxkj.jpg" },
  { name: "强基装备", image: "/assets/images/Sponsors/qjzb.jpg" },
  { name: "夜河神", image: "/assets/images/Sponsors/yeheshen.jpg" },
];

const groups = [
  {
    name: "机械组",
    description: "负责机器人结构设计、建模、加工与装配，将创意变为现实",
    logo: "/assets/images/Logo/Mechanical.png",
    accent: "from-[#0062FF]/24 via-[#2563EB]/14 to-transparent",
  },
  {
    name: "电控组",
    description: "嵌入式系统开发、电路设计、电机控制，让机器人\u201C动\u201D起来",
    logo: "/assets/images/Logo/ElectricalControl.png",
    accent: "from-[#10B981]/22 via-[#14B8A6]/12 to-transparent",
  },
  {
    name: "视觉组",
    description: "机器视觉、目标识别、自动瞄准，赋予机器人\u201C眼睛\u201D",
    logo: "/assets/images/Logo/Vision.png",
    accent: "from-[#F59E0B]/22 via-[#F97316]/12 to-transparent",
  },
  {
    name: "AI组",
    description: "负责智能算法、决策规划与自主控制，让机器人拥有更强的判断力",
    logo: "/assets/images/Logo/AI.png",
    accent: "from-[#EF4444]/22 via-[#EC4899]/12 to-transparent",
  },
  {
    name: "软件组",
    description: "负责上位机、工具链与平台开发，支撑整队协同与数据流转",
    logo: "/assets/images/Logo/Software.png",
    accent: "from-[#8B5CF6]/22 via-[#6366F1]/12 to-transparent",
  },
  {
    name: "运营组",
    description: "负责宣传、策划、赛事运营与对外联络，推动团队持续成长",
    logo: "/assets/images/Logo/Operations.png",
    accent: "from-[#22C55E]/22 via-[#84CC16]/12 to-transparent",
  },
];

const aboutModules = [
  {
    name: "参赛",
    title: "在真实对抗中验证整队协同与执行力",
    description: [
      "参赛模块记录的是吉甲大师最直接的赛场表达。从区域赛、公开赛到更高强度的对抗场景，机器人性能、临场判断和团队调度都会在瞬间被放大。",
      "每一次上场都是一次完整的系统检验，检验的不只是硬件和算法，更是队伍在高压环境下的反应速度、复盘效率与战术默契。",
    ],
    highlights: [
      "高强度攻防与临场协同",
      "区域赛与公开赛的实战记录",
      "在赛场上完成技术方案的闭环验证",
    ],
    images: [
      "/assets/images/ContestMoment/微信图片_20260417222437_263_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417222456_267_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417222636_293_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417222649_308_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417224230_338_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417224231_339_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417224233_342_1.jpg",
      "/assets/images/ContestMoment/微信图片_20260417224238_347_1.jpg",
    ],
  },
  {
    name: "备赛",
    title: "把每一场正式上场前的细节反复磨透",
    description: [
      "备赛阶段是团队最密集的联调周期。机械、电控、视觉、AI、软件与运营需要围绕同一目标协同推进，把设计、加工、联调、测试和复盘压缩进有限时间内。",
      "从实验室里的调试，到赛前节奏的演练，真正支撑赛场稳定发挥的，往往正是这些看似重复却必须做到极致的准备过程。",
    ],
    highlights: [
      "赛前联调、整机测试与快速修正",
      "围绕比赛目标进行跨组协同推进",
      "通过反复演练降低上场不确定性",
    ],
    images: [
      "/assets/images/Preparation_for_competition/19.jpg",
      "/assets/images/Preparation_for_competition/2021RM备赛.jpg",
      "/assets/images/Preparation_for_competition/3.jpg",
      "/assets/images/Preparation_for_competition/mmexportfe33110d1369fa229665a81fafd6fa0c_1744263091469.jpeg",
      "/assets/images/Preparation_for_competition/工作照.jpg",
      "/assets/images/Preparation_for_competition/测试1.jpg",
      "/assets/images/Preparation_for_competition/测试2.jpg",
      "/assets/images/Preparation_for_competition/照片底版2-50.jpg",
    ],
  },
  {
    name: "日常",
    title: "训练、例会与基地生活共同构成团队肌理",
    description: [
      "日常模块展示的是竞赛之外的团队状态。例会、讨论、展示、夜间调试和工位协作，组成了吉甲大师最真实也最持久的运转方式。",
      "正是这些看似平常的日常训练，让成员在长期协作中建立信任，也让整个团队能够在关键节点迅速进入战斗状态。",
    ],
    highlights: [
      "基地训练、例会沟通与日常协作",
      "长期积累形成稳定的团队节奏",
      "从日常磨合中沉淀执行习惯与协同方式",
    ],
    images: [
      "/assets/images/Daily/微信图片_20260417225903_435_1.jpg",
      "/assets/images/Daily/微信图片_20260417225907_440_1.jpg",
      "/assets/images/Daily/微信图片_20260417225909_442_1.jpg",
      "/assets/images/Daily/微信图片_20260417230243_484_1.jpg",
      "/assets/images/Daily/微信图片_20260417230640_503_1.jpg",
      "/assets/images/Daily/微信图片_20260417230651_510_1.jpg",
      "/assets/images/Daily/微信图片_20260417230830_524_1.jpg",
      "/assets/images/Daily/微信图片_20260417231106_531_1.jpg",
    ],
  },
  {
    name: "创新创业",
    title: "把竞赛能力延伸到项目孵化与双创实践",
    description: [
      "创新创业模块记录的是团队把技术能力转化为项目成果的过程。从方案打磨、导师指导到双创竞赛与设备开发，团队持续尝试把赛场经验沉淀为更具延展性的实践能力。",
      "这不仅拓宽了成员的技术边界，也让吉甲大师在机器人之外建立起更完整的项目组织与成果表达能力。",
    ],
    highlights: [
      "双创赛事、项目答辩与导师指导",
      "将竞赛经验转化为工程项目与设备开发",
      "持续拓展团队的成果沉淀与对外表达能力",
    ],
    images: [
      "/assets/images/Innovation_and_entrepreneurship/2021互联网+创新创业竞赛.jpg",
      "/assets/images/Innovation_and_entrepreneurship/2022双展览.jpg",
      "/assets/images/Innovation_and_entrepreneurship/创业大赛1.png",
      "/assets/images/Innovation_and_entrepreneurship/双创导师.jpg",
      "/assets/images/Innovation_and_entrepreneurship/双创开会1.jpg",
      "/assets/images/Innovation_and_entrepreneurship/图片4.png",
      "/assets/images/Innovation_and_entrepreneurship/汽车盖板调试.jpg",
      "/assets/images/Innovation_and_entrepreneurship/药瓶检测设备开发.png",
    ],
  },
  {
    name: "校企合作",
    title: "在交流、调研与合作中拓宽团队的真实场景",
    description: [
      "校企合作模块展示的是团队走出实验室后的另一种成长路径。通过企业参访、科创营、合作调研和校园展示，成员得以把课堂、竞赛和产业场景连接起来。",
      "这些实践一方面帮助团队理解更真实的工程需求，另一方面也让吉甲大师能够在更广泛的合作中持续吸收外部经验。",
    ],
    highlights: [
      "企业走访、合作调研与科创交流",
      "把校园项目与产业需求连接起来",
      "在外部合作中拓宽团队视野与实践边界",
    ],
    images: [
      "/assets/images/Industry-AcademiaCollaboration/981c784604bf99407189c4d3fdbfdacc.jpg",
      "/assets/images/Industry-AcademiaCollaboration/e31d9fb0eb0dcb146f518afc4b4359e9.jpg",
      "/assets/images/Industry-AcademiaCollaboration/参观企业.jpg",
      "/assets/images/Industry-AcademiaCollaboration/可口可乐参观.jpg",
      "/assets/images/Industry-AcademiaCollaboration/吉大附小.jpg",
      "/assets/images/Industry-AcademiaCollaboration/接待东北师大附中参观.jpg",
      "/assets/images/Industry-AcademiaCollaboration/重庆明月湖科创营.jpg",
      "/assets/images/Industry-AcademiaCollaboration/青岛海克斯康调研合作.jpg",
    ],
  },
];

function getAboutModuleLayoutClass(imageCount: number) {
  if (imageCount >= 8) {
    return "lg:grid-cols-[1.28fr_0.72fr]";
  }

  if (imageCount >= 6) {
    return "lg:grid-cols-[1.18fr_0.82fr]";
  }

  if (imageCount >= 4) {
    return "lg:grid-cols-[1.08fr_0.92fr]";
  }

  return "lg:grid-cols-[0.96fr_1.04fr]";
}

function getAboutPhotoWallClass(imageCount: number) {
  if (imageCount === 1) {
    return "grid-cols-1 auto-rows-[228px] sm:auto-rows-[248px]";
  }

  if (imageCount === 2) {
    return "grid-cols-2 auto-rows-[156px] sm:auto-rows-[176px]";
  }

  if (imageCount <= 4) {
    return "grid-cols-2 auto-rows-[128px] sm:auto-rows-[144px]";
  }

  if (imageCount <= 6) {
    return "grid-cols-2 md:grid-cols-3 auto-rows-[88px] sm:auto-rows-[100px]";
  }

  return "grid-cols-2 md:grid-cols-3 auto-rows-[80px] sm:auto-rows-[90px]";
}

function getAboutPhotoWallRowCount(imageCount: number) {
  if (imageCount <= 2) {
    return 1;
  }

  if (imageCount === 3) {
    return 2;
  }

  if (imageCount <= 6) {
    return 3;
  }

  return 4;
}

function getAboutPhotoCellClass(imageCount: number, index: number) {
  if (imageCount <= 2) {
    return "";
  }

  if (imageCount === 3) {
    return index === 0 ? "sm:col-span-2" : "";
  }

  if (imageCount === 4) {
    return index === 0 ? "sm:col-span-2" : "";
  }

  if (index === 0) {
    return "md:col-span-2 md:row-span-2";
  }

  if (index === imageCount - 1 && imageCount % 2 === 1) {
    return "md:col-span-2";
  }

  if (imageCount >= 8 && index === 4) {
    return "md:col-span-2";
  }

  return "";
}

function getCertificateVisibilityClass(index: number) {
  if (index < 4) {
    return "";
  }

  if (index < 6) {
    return "hidden sm:block";
  }

  if (index < 8) {
    return "hidden lg:block";
  }

  if (index < 10) {
    return "hidden xl:block";
  }

  return "hidden";
}

function StatIcon({ icon, className }: { icon: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    calendar: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
      </svg>
    ),
    users: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    layers: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
      </svg>
    ),
    award: (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" />
      </svg>
    ),
  };
  return <>{icons[icon]}</>;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const [activeAboutModuleIndex, setActiveAboutModuleIndex] = useState(0);
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(0);
  const [showAllCertificates, setShowAllCertificates] = useState(false);
  const [aboutPanelHeight, setAboutPanelHeight] = useState("auto");
  const aboutPanelRef = useRef<HTMLDivElement | null>(null);
  const activeAboutModule = aboutModules[activeAboutModuleIndex];
  const activeMilestone = timelineMilestones[activeMilestoneIndex];

  useEffect(() => {
    const panel = aboutPanelRef.current;

    if (!panel) {
      return;
    }

    let frameId = 0;

    const syncAboutPanelHeight = () => {
      const nextHeight = `${Math.ceil(panel.getBoundingClientRect().height)}px`;
      setAboutPanelHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    };

    const scheduleSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(syncAboutPanelHeight);
    };

    syncAboutPanelHeight();

    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (frameId) {
          window.cancelAnimationFrame(frameId);
        }
      };
    }

    const observer = new ResizeObserver(() => {
      scheduleSync();
    });

    observer.observe(panel);

    return () => {
      observer.disconnect();

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [activeAboutModuleIndex]);

  function showPreviousAboutModule() {
    setActiveAboutModuleIndex((current) =>
      current === 0 ? aboutModules.length - 1 : current - 1,
    );
  }

  function showNextAboutModule() {
    setActiveAboutModuleIndex((current) =>
      current === aboutModules.length - 1 ? 0 : current + 1,
    );
  }

  function showPreviousMilestone() {
    setActiveMilestoneIndex((current) =>
      current === 0 ? timelineMilestones.length - 1 : current - 1,
    );
  }

  function showNextMilestone() {
    setActiveMilestoneIndex((current) =>
      current === timelineMilestones.length - 1 ? 0 : current + 1,
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030303] text-fg-primary">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="bg-obsidian-base absolute inset-0" />
        <div className="bg-obsidian-grid absolute inset-[-15%]" />
        <div className="bg-obsidian-glow absolute -left-[12%] top-[8%] h-[42vw] w-[42vw]" />
        <div className="bg-obsidian-glow bg-obsidian-glow-secondary absolute right-[-10%] top-[32%] h-[46vw] w-[46vw]" />
        <div className="bg-obsidian-glow bg-obsidian-glow-tertiary absolute left-[18%] bottom-[-18%] h-[38vw] w-[38vw]" />
      </div>

      <div className="relative z-10">
      {/* Hero Section */}
      <section
        id="hero"
        className="relative min-h-[100svh] overflow-hidden bg-black"
      >
        <div className="absolute inset-0">
          <video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/assets/images/Robot/HeroRobot.jpg"
            aria-label="吉林大学吉甲大师双创基地宣传视频"
          >
            <source src="/assets/images/Video/599af37af64b86479092f9c28e4619a1.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,98,255,0.24),transparent_42%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.18)_0%,rgba(2,6,23,0.78)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.62)_0%,rgba(2,6,23,0.16)_38%,rgba(2,6,23,0.78)_100%)]" />
        </div>

        <div className="relative z-10 flex min-h-[100svh] items-center justify-center">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-center px-6 pb-16 pt-28 sm:px-10 sm:pt-32 lg:px-20">
            <div className="flex max-w-2xl flex-col items-center gap-6 text-center sm:gap-8">
              <img
                src="/assets/images/Logo/JiJiaMaster.png"
                alt="吉甲大师"
                className="motion-fade-down h-48 w-auto max-w-full object-contain sm:h-56 md:h-64"
              />
              <p className="motion-fade-up text-lg font-semibold tracking-[0.22em] text-white sm:text-2xl">
                吉林大学吉甲大师双创基地
              </p>
              <Link
                to="/register"
                className="motion-button inline-flex items-center gap-2 rounded-full border border-white/16 bg-white px-8 py-3 text-sm font-semibold text-slate-950 shadow-[0_20px_60px_-28px_rgba(255,255,255,0.78)] sm:px-10 sm:py-4 sm:text-base"
              >
                加入我们
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 sm:bottom-8">
          <div className="mx-auto flex max-w-[1440px] justify-center px-6 sm:px-10 lg:px-20">
            <a
              href="#about"
              className="motion-button pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/14 bg-white/10 text-white shadow-[0_18px_48px_-28px_rgba(255,255,255,0.76)] backdrop-blur-md hover:border-white/28 hover:bg-white/16 sm:h-16 sm:w-16"
              aria-label="下滑查看更多"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      <Navbar currentUser={loaderData.currentUser} />

      {/* About Section */}
      <section
        id="about"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-accent-primary bg-surface-light rounded-full">
              关于我们
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-primary text-center">
              一支跨校区、跨学科的机器人战队
            </h2>
            <p className="max-w-[700px] text-base text-fg-muted leading-relaxed text-center">
              TARS-Go 战队成立于 2018
              年，取名自电影《星际穿越》中的机器人
              TARS。战队依托吉林大学吉甲大师双创基地，汇聚了来自不同学院、不同校区的优秀同学，共同在
              RoboMaster 机甲大师赛中竞技拼搏。
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="motion-stat-surface flex flex-col items-center gap-3 rounded-2xl border border-white/8 bg-surface-light/92 p-7"
              >
                <div
                  className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center`}
                >
                  <StatIcon
                    icon={stat.icon}
                    className="w-6 h-6 text-fg-inverse"
                  />
                </div>
                <span className="font-mono text-4xl font-bold text-fg-primary">
                  {stat.value}
                </span>
                <span className="text-sm font-medium text-fg-muted">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="relative overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="absolute left-0 right-0 top-6 hidden h-px bg-border-subtle md:block" />
                  <div className="relative flex min-w-max gap-3 pr-4">
                    {aboutModules.map((module, index) => (
                      <button
                        key={module.name}
                        type="button"
                        onClick={() => setActiveAboutModuleIndex(index)}
                        className={`motion-button flex min-w-[112px] flex-col rounded-2xl border px-4 py-3 text-left transition-colors ${
                          index === activeAboutModuleIndex
                            ? "border-accent-primary bg-accent-primary text-fg-inverse shadow-[0_18px_40px_-24px_rgba(0,98,255,0.85)]"
                            : "border-white/8 bg-surface-light text-fg-muted hover:border-accent-primary/30 hover:text-fg-primary"
                        }`}
                        aria-pressed={index === activeAboutModuleIndex}
                      >
                        <span className="text-sm font-semibold tracking-[0.18em]">
                          {module.name}
                        </span>
                        <span className="mt-1 text-xs opacity-80">
                          {module.images.length} 张图片
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 lg:justify-end">
                <span className="text-sm text-fg-muted">
                  {String(activeAboutModuleIndex + 1).padStart(2, "0")} /{" "}
                  {String(aboutModules.length).padStart(2, "0")}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={showPreviousAboutModule}
                    className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-accent-primary/30 hover:text-accent-primary"
                    aria-label="查看上一模块"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={showNextAboutModule}
                    className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-accent-primary/30 hover:text-accent-primary"
                    aria-label="查看下一模块"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`grid gap-6 ${getAboutModuleLayoutClass(activeAboutModule.images.length)} lg:items-start`}
            >
              <div
                className={`grid ${getAboutPhotoWallClass(activeAboutModule.images.length)} gap-3 lg:h-[var(--about-photo-wall-height)] lg:[grid-template-rows:repeat(var(--about-photo-rows),minmax(0,1fr))]`}
                style={
                  {
                    "--about-photo-rows": String(
                      getAboutPhotoWallRowCount(activeAboutModule.images.length),
                    ),
                    "--about-photo-wall-height": aboutPanelHeight,
                  } as CSSProperties
                }
              >
                {activeAboutModule.images.map((image, index) => (
                  <article
                    key={image}
                    className={`motion-surface group relative overflow-hidden rounded-[28px] border border-white/10 bg-surface-light ${getAboutPhotoCellClass(activeAboutModule.images.length, index)}`}
                  >
                    <img
                      src={image}
                      alt={`${activeAboutModule.name}模块图片${index + 1}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05)_0%,rgba(2,6,23,0.18)_42%,rgba(2,6,23,0.84)_100%)]" />
                    <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8">
                      <span className="inline-flex rounded-full border border-white/12 bg-black/30 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-white/78 backdrop-blur-sm">
                        {activeAboutModule.name}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <div
                ref={aboutPanelRef}
                className="motion-panel-soft rounded-[28px] border border-white/8 bg-surface-light/80 p-5 sm:p-6"
              >
                <span className="inline-flex rounded-full border border-accent-primary/20 bg-accent-primary/10 px-4 py-1 text-[13px] font-semibold text-accent-primary">
                  {activeAboutModule.name}
                </span>
                <h3 className="mt-3.5 font-display text-3xl text-fg-primary sm:mt-4 sm:text-4xl">
                  {activeAboutModule.title}
                </h3>
                <div className="mt-3.5 space-y-2.5 sm:mt-4">
                  {activeAboutModule.description.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-6 text-fg-muted sm:text-base sm:leading-7"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                <div className="mt-4 rounded-[24px] border border-white/8 bg-surface-primary/68 p-4 sm:mt-5 sm:p-5">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-gold">
                    模块聚焦
                  </h4>
                  <ul className="mt-3 space-y-2.5">
                    {activeAboutModule.highlights.map((highlight) => (
                      <li
                        key={highlight}
                        className="flex gap-3 text-sm leading-6 text-fg-muted sm:text-[15px] sm:leading-7"
                      >
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-gold" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Achievements Section */}
      <section
        id="achievements"
        className="relative overflow-hidden border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,98,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(79,70,229,0.12),transparent_26%)]" />
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <div className="relative mb-12 flex flex-col items-center gap-3">
            <span className="inline-block rounded-full bg-surface-light px-4 py-1 text-[13px] font-semibold text-accent-primary">
              团队历程
            </span>
            <h2 className="text-center font-display text-3xl text-fg-primary sm:text-[40px]">
              以时间轴回看战队一路走来的每一步
            </h2>
            <p className="max-w-[760px] text-center text-base leading-relaxed text-fg-muted">
              从双创基地组建，到国际赛事历练，再到 RoboMaster 国赛突破，吉林大学吉甲大师双创基地在一届又一届成员的接力中不断完成技术积累、组织建设与文化沉淀。
            </p>
          </div>

          <div className="relative mx-auto max-w-[1240px]">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="relative overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="absolute left-0 right-0 top-6 hidden h-px bg-border-subtle md:block" />
                  <div className="relative flex min-w-max gap-3 pr-4">
                    {timelineMilestones.map((item, index) => (
                      <button
                        key={item.year}
                        type="button"
                        onClick={() => setActiveMilestoneIndex(index)}
                        className={`motion-button flex min-w-[104px] flex-col rounded-2xl border px-4 py-3 text-left transition-colors ${
                          index === activeMilestoneIndex
                            ? "border-accent-primary bg-accent-primary text-fg-inverse shadow-[0_18px_40px_-24px_rgba(0,98,255,0.85)]"
                            : "border-white/8 bg-surface-light text-fg-muted hover:border-accent-primary/30 hover:text-fg-primary"
                        }`}
                        aria-pressed={index === activeMilestoneIndex}
                      >
                        <span className="font-mono text-sm font-semibold">
                          {item.year}
                        </span>
                        <span className="mt-1 text-sm font-semibold">
                          {item.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 lg:justify-end">
                <span className="text-sm text-fg-muted">
                  {String(activeMilestoneIndex + 1).padStart(2, "0")} /{" "}
                  {String(timelineMilestones.length).padStart(2, "0")}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={showPreviousMilestone}
                    className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-accent-primary/30 hover:text-accent-primary"
                    aria-label="查看上一段历程"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={showNextMilestone}
                    className="motion-button flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-surface-light text-fg-primary hover:border-accent-primary/30 hover:text-accent-primary"
                    aria-label="查看下一段历程"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-white/8 bg-surface-light/86 p-6 shadow-[0_24px_70px_-40px_rgba(2,6,23,0.9)] sm:p-8">
              <article
                key={activeMilestone.year}
                className="motion-fade-up grid gap-6 lg:grid-cols-[0.92fr_1.08fr] lg:items-start"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#FFD700] text-base font-bold text-slate-950 shadow-[0_18px_40px_-22px_rgba(255,215,0,0.68)]">
                      {activeMilestone.year.slice(2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-accent-primary">
                        Team Timeline
                      </p>
                      <h3 className="mt-1 font-display text-3xl text-fg-primary sm:text-[34px]">
                        {activeMilestone.year}年 · {activeMilestone.title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-sm leading-7 text-fg-muted sm:text-base">
                    {activeMilestone.intro}
                  </p>

                  <div className="rounded-[24px] border border-white/8 bg-surface-primary/72 p-5">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-[#FFD700]">
                      关键节点
                    </h4>
                    <ul className="mt-4 space-y-3">
                      {activeMilestone.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="flex gap-3 text-sm leading-7 text-fg-muted sm:text-[15px]"
                        >
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFD700]" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  className={`grid gap-4 ${
                    activeMilestone.images.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  {activeMilestone.images.map((image, index) => (
                    <figure
                      key={image}
                      className={`overflow-hidden rounded-[24px] border border-white/8 bg-surface-primary ${
                        activeMilestone.images.length === 1 ? "sm:max-w-[760px]" : ""
                      }`}
                    >
                      <img
                        src={image}
                        alt={`${activeMilestone.year}年${activeMilestone.title}历史图片${index + 1}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </figure>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* Robot Showcase Section */}
      <section
        id="robots"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-accent-primary bg-surface-light rounded-full">
              机器人展示
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-primary text-center">
              我们的战旗机甲
            </h2>
            <p className="max-w-[600px] text-base text-fg-muted leading-relaxed text-center">
              每一台机器人都是团队智慧的结晶，融合机械设计、嵌入式系统、机器视觉、人工智能等多项技术
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {robots.map((robot, index) => (
              <div
                key={robot.name}
                className="motion-surface overflow-hidden rounded-2xl border border-white/8 bg-surface-light/92"
              >
                {robotImages[index] ? (
                  <img
                    src={robotImages[index]}
                    alt={robot.name}
                    loading="lazy"
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 flex items-center justify-center">
                    <svg
                      className="w-12 h-12 text-fg-muted/30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 8V4H8" />
                      <rect width="16" height="12" x="4" y="8" rx="2" />
                      <path d="M2 14h2" />
                      <path d="M20 14h2" />
                      <path d="M15 13v2" />
                      <path d="M9 13v2" />
                    </svg>
                  </div>
                )}
                <div className="p-5 flex flex-col gap-2">
                  <h3 className="text-base font-bold text-fg-primary">
                    {robot.name}
                  </h3>
                  <p className="text-[13px] text-fg-muted leading-relaxed">
                    {robot.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Achievement Certificates Section */}
      <section
        id="certificates"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="mx-auto max-w-[1440px] px-6 sm:px-10 lg:px-20">
          <div className="mb-12 flex flex-col items-center gap-3">
            <span className="inline-block rounded-full bg-white/[0.08] px-4 py-1 text-[13px] font-semibold text-accent-gold">
              成就展示
            </span>
            <h2 className="text-center font-display text-3xl text-fg-inverse sm:text-[40px]">
              团队荣誉证书与阶段成果陈列
            </h2>
            <p className="max-w-[760px] text-center text-base leading-relaxed text-fg-muted">
              这里集中展示团队在创新创业、学科竞赛与 RoboMaster
              相关实践中获得的阶段性荣誉。整体采用规整的矩形照片墙陈列，便于更直接地浏览不同阶段的获奖成果。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {achievementCertificates.map((image, index) => (
              <article
                key={image}
                className={`motion-surface group relative aspect-[4/3] overflow-hidden rounded-[24px] border border-white/8 bg-surface-light/86 p-3 sm:p-4 ${
                  showAllCertificates ? "" : getCertificateVisibilityClass(index)
                }`}
              >
                <span className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/28 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-accent-gold backdrop-blur-sm">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="h-full overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_56%)]">
                  <img
                    src={image}
                    alt={`团队荣誉证书${index + 1}`}
                    loading="lazy"
                    className="h-full w-full object-fill transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                  />
                </div>
              </article>
            ))}
          </div>

          {achievementCertificates.length > 10 ? (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllCertificates((current) => !current)}
                className="motion-button inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.08] px-7 py-3 text-sm font-semibold text-fg-primary backdrop-blur-md hover:border-accent-gold/40 hover:text-accent-gold"
                aria-expanded={showAllCertificates}
              >
                {showAllCertificates ? "收起" : "点击查看更多"}
                <svg
                  className={`h-4 w-4 transition-transform duration-300 ${
                    showAllCertificates ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Join Us Section */}
      <section
        id="join"
        className="border-t border-white/[0.06] bg-transparent py-16 sm:py-20"
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20 flex flex-col items-center">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-block px-4 py-1 text-[13px] font-semibold text-fg-inverse bg-accent-primary rounded-full">
              加入我们
            </span>
            <h2 className="font-display text-3xl sm:text-[40px] text-fg-primary text-center">
              找到你的战位，一起征服星辰大海
            </h2>
            <p className="max-w-[600px] text-base text-fg-muted leading-relaxed text-center">
              我们欢迎来自各个专业的同学加入，无论你是零基础还是大佬，这里都有你的位置
            </p>
          </div>

          <div className="mb-12 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.name}
                className="motion-surface relative overflow-hidden rounded-[28px] border border-white/8 bg-surface-primary p-7 shadow-[0_18px_40px_-32px_rgba(2,6,23,0.68)]"
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${group.accent}`}
                />
                <div className="relative flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px] border border-white/12 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <img
                        src={group.logo}
                        alt={`${group.name} logo`}
                        loading="lazy"
                        className="h-12 w-12 object-contain"
                      />
                    </div>
                    <h3 className="text-lg font-bold text-fg-primary">
                      {group.name}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {group.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/register"
            className="motion-button inline-flex items-center gap-2 rounded-full bg-accent-primary px-10 py-4 text-lg font-semibold text-fg-inverse shadow-[0_18px_40px_-24px_rgba(0,98,255,0.78)] transition-opacity hover:opacity-90"
          >
            立即报名
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-transparent px-6 py-12 sm:px-10 lg:px-20">
        <div className="max-w-[1440px] mx-auto">
          {/* Footer top */}
          <div className="mb-8 grid gap-10 md:grid-cols-2 lg:grid-cols-[320px_120px_170px_140px] xl:grid-cols-[320px_120px_170px_130px_minmax(280px,1fr)]">
            {/* Brand */}
            <div className="w-full md:w-[320px] flex flex-col gap-4 shrink-0">
              <img
                src="/assets/images/Logo/JiJiaMaster.png"
                alt="吉甲大师"
                loading="lazy"
                className="h-14 w-fit max-w-[220px] object-contain"
              />
              <p className="text-[13px] text-fg-muted leading-relaxed max-w-[280px]">
                吉林大学吉甲大师双创基地
                <br />
                外在做事沉稳有序，内在思维活跃创新
              </p>
            </div>

            {/* Quick nav */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-fg-inverse">快速导航</h4>
              <a href="/#hero" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">首页</a>
              <a href="/#about" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">关于我们</a>
              <a href="/#achievements" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">团队历程</a>
              <a href="/#robots" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">机器人展示</a>
              <a href="/#certificates" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">成就展示</a>
              <a href="/#join" className="text-[13px] text-fg-muted hover:text-fg-primary transition-colors">加入我们</a>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-fg-inverse">联系我们</h4>
              <span className="text-[13px] text-fg-muted">吉林大学南湖校区</span>
              <span className="text-[13px] text-fg-muted">吉甲大师双创基地</span>
              <span className="text-[13px] text-fg-muted">tarsgo@jlu.edu.cn</span>
            </div>

            {/* Social */}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-bold text-fg-inverse">关注我们</h4>
              <div className="flex gap-3">
                <div className="w-9 h-9 bg-white/[0.08] rounded-lg flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" />
                  </svg>
                </div>
                <div className="w-9 h-9 bg-white/[0.08] rounded-lg flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                </div>
                <div className="w-9 h-9 bg-white/[0.08] rounded-lg flex items-center justify-center">
                  <svg className="w-[18px] h-[18px] text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Sponsors */}
            <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-4 xl:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-fg-inverse">赞助商支持</h4>
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-gold">
                  Sponsors
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                {sponsorLogos.map((sponsor) => (
                  <div
                    key={sponsor.name}
                    className="motion-surface flex h-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] p-1.5"
                  >
                    <img
                      src={sponsor.image}
                      alt={sponsor.name}
                      loading="lazy"
                      className="h-full w-full object-fill"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.08] mb-8" />

          {/* Copyright */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-white/[0.27]">
              &copy; {new Date().getFullYear()} TARS-Go 战队 · 吉林大学吉甲大师双创基地
            </span>
            <span className="text-xs text-white/[0.27]">
              Powered by RoboMaster
            </span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
