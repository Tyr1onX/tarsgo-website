export type RobotCategory = "英雄" | "工程" | "步兵" | "空中" | "哨兵" | "飞镖" | "雷达";

export type RobotSeasonEntry = {
  id: string;
  number: string;
  name: string;
  category: RobotCategory;
  sourceFilename: string;
  sourceSha256: string;
  image: {
    thumbnail: string;
    medium: string;
    large: string;
  };
  description?: string;
};

export type RobotSeason = {
  season: number;
  title: string;
  robots: readonly RobotSeasonEntry[];
};

const robotNumberCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function sortRobotsByNumber(robots: readonly RobotSeasonEntry[]): RobotSeasonEntry[] {
  return [...robots].sort((left, right) => {
    const numberOrder = robotNumberCollator.compare(left.number, right.number);
    if (numberOrder !== 0) return numberOrder;

    const leftIsBackup = left.name.includes("备车");
    const rightIsBackup = right.name.includes("备车");
    return Number(leftIsBackup) - Number(rightIsBackup);
  });
}

export const robotSeasons = [
  {
    season: 2026,
    title: "2026 赛季机器人阵容",
    robots: [
      {
        id: "2026-infantry-03",
        number: "03",
        name: "3号步兵机器人",
        category: "步兵",
        sourceFilename: "3.JPG",
        sourceSha256: "8fe1948a05805a2ca35edea2b784ec5832b454996f42cfdfa2bbbe7c3a3344ab",
        image: {
          thumbnail: "/assets/images/Robot/2026/infantry-03-720.webp",
          medium: "/assets/images/Robot/2026/infantry-03-1440.webp",
          large: "/assets/images/Robot/2026/infantry-03-2400.webp",
        },
      },
      {
        id: "2026-infantry-04",
        number: "04",
        name: "4号步兵机器人",
        category: "步兵",
        sourceFilename: "4.JPG",
        sourceSha256: "971928439327f842c7b21ce428427ddffb5c8cb17b3749d567514f2d22b69aa3",
        image: {
          thumbnail: "/assets/images/Robot/2026/infantry-04-720.webp",
          medium: "/assets/images/Robot/2026/infantry-04-1440.webp",
          large: "/assets/images/Robot/2026/infantry-04-2400.webp",
        },
      },
      {
        id: "2026-hero-01",
        number: "01",
        name: "1号英雄机器人",
        category: "英雄",
        sourceFilename: "1.JPG",
        sourceSha256: "deff8756929afb8bfc2599b5a8e235aae04322d58976db024db5f8f2cb061221",
        image: {
          thumbnail: "/assets/images/Robot/2026/hero-01-720.webp",
          medium: "/assets/images/Robot/2026/hero-01-1440.webp",
          large: "/assets/images/Robot/2026/hero-01-2400.webp",
        },
      },
      {
        id: "2026-hero-01-backup",
        number: "01B",
        name: "1号英雄机器人（备车）",
        category: "英雄",
        sourceFilename: "1（备车）.JPG",
        sourceSha256: "a4dce8cf60ea60eeafcde690aba97bdfc214e418a3ed84818f60c24e6ade0dbe",
        image: {
          thumbnail: "/assets/images/Robot/2026/hero-01-backup-720.webp",
          medium: "/assets/images/Robot/2026/hero-01-backup-1440.webp",
          large: "/assets/images/Robot/2026/hero-01-backup-2400.webp",
        },
      },
      {
        id: "2026-engineering-02",
        number: "02",
        name: "2号工程机器人",
        category: "工程",
        sourceFilename: "2.JPG",
        sourceSha256: "85ce924ad6d40cd378d7079669b5b6ca5c5f63e1ee0c1cb81b314a9f8cfb30b9",
        image: {
          thumbnail: "/assets/images/Robot/2026/engineering-02-720.webp",
          medium: "/assets/images/Robot/2026/engineering-02-1440.webp",
          large: "/assets/images/Robot/2026/engineering-02-2400.webp",
        },
      },
      {
        id: "2026-radar-09",
        number: "09",
        name: "9号雷达系统",
        category: "雷达",
        sourceFilename: "9.JPG",
        sourceSha256: "b15ab6cb538aba94fbb76dc8b4992f28c4c5a12a0d5f969bb4fe3a43a772c544",
        image: {
          thumbnail: "/assets/images/Robot/2026/radar-09-720.webp",
          medium: "/assets/images/Robot/2026/radar-09-1440.webp",
          large: "/assets/images/Robot/2026/radar-09-2400.webp",
        },
      },
      {
        id: "2026-infantry-03-backup",
        number: "03B",
        name: "3号步兵机器人（备车）",
        category: "步兵",
        sourceFilename: "3（备车）.JPG",
        sourceSha256: "d2adaaa83f7194fd3b5f34fcb60d5361f6cfe74519f90313fec420bf56a55aa2",
        image: {
          thumbnail: "/assets/images/Robot/2026/infantry-03-backup-720.webp",
          medium: "/assets/images/Robot/2026/infantry-03-backup-1440.webp",
          large: "/assets/images/Robot/2026/infantry-03-backup-2400.webp",
        },
      },
      {
        id: "2026-sentinel-07",
        number: "07",
        name: "7号哨兵机器人",
        category: "哨兵",
        sourceFilename: "7.JPG",
        sourceSha256: "8706779a673f511f0205b702d03d5d175d590be22df718826831fe6cc52e279d",
        image: {
          thumbnail: "/assets/images/Robot/2026/sentinel-07-720.webp",
          medium: "/assets/images/Robot/2026/sentinel-07-1440.webp",
          large: "/assets/images/Robot/2026/sentinel-07-2400.webp",
        },
      },
      {
        id: "2026-dart-08",
        number: "08",
        name: "8号飞镖系统",
        category: "飞镖",
        sourceFilename: "8.JPG",
        sourceSha256: "5ed4c1ef2c77a07cc03df31e24875db1086945ef50d0b0ab81bb765a90f56d86",
        image: {
          thumbnail: "/assets/images/Robot/2026/dart-08-720.webp",
          medium: "/assets/images/Robot/2026/dart-08-1440.webp",
          large: "/assets/images/Robot/2026/dart-08-2400.webp",
        },
      },
      {
        id: "2026-air-06",
        number: "06",
        name: "6号无人机",
        category: "空中",
        sourceFilename: "6.JPG",
        sourceSha256: "e8ab9d3a65dbc2fb793279aa1b9dcc94f4c3d587935a055cf510855670f106b0",
        image: {
          thumbnail: "/assets/images/Robot/2026/air-06-720.webp",
          medium: "/assets/images/Robot/2026/air-06-1440.webp",
          large: "/assets/images/Robot/2026/air-06-2400.webp",
        },
      },
    ] satisfies readonly RobotSeasonEntry[],
  },
  {
    season: 2025,
    title: "2025 赛季机器人阵容",
    robots: [
      {
        id: "2025-hero-01",
        number: "01",
        name: "1号英雄机器人",
        category: "英雄",
        sourceFilename: "1号英雄.JPG",
        sourceSha256: "fc8d730f223af18a77b3568d3f2d1b6953c626b106f06b0cbca8a2e1f9a338ce",
        image: {
          thumbnail: "/assets/images/Robot/2025/hero-01-720.webp",
          medium: "/assets/images/Robot/2025/hero-01-1440.webp",
          large: "/assets/images/Robot/2025/hero-01-2400.webp",
        },
      },
      {
        id: "2025-engineering-02",
        number: "02",
        name: "2号工程机器人",
        category: "工程",
        sourceFilename: "2号工程.JPG",
        sourceSha256: "9b9a66f6e7b36d190a91f8bd7e1901f05469360fd19456dbc41a67a0fac0ae7c",
        image: {
          thumbnail: "/assets/images/Robot/2025/engineering-02-720.webp",
          medium: "/assets/images/Robot/2025/engineering-02-1440.webp",
          large: "/assets/images/Robot/2025/engineering-02-2400.webp",
        },
      },
      {
        id: "2025-infantry-03",
        number: "03",
        name: "3号步兵机器人",
        category: "步兵",
        sourceFilename: "3号步兵.JPG",
        sourceSha256: "cd60761ad94eec8f0dbbb3d9d851c68107be46a2a0d11f455c6df4c6fc8af5a9",
        image: {
          thumbnail: "/assets/images/Robot/2025/infantry-03-720.webp",
          medium: "/assets/images/Robot/2025/infantry-03-1440.webp",
          large: "/assets/images/Robot/2025/infantry-03-2400.webp",
        },
      },
      {
        id: "2025-infantry-04",
        number: "04",
        name: "4号步兵机器人",
        category: "步兵",
        sourceFilename: "4号步兵.JPG",
        sourceSha256: "8082eef6beb720c86073e71388dfdf4085912bd9df37b0bc825b6d5d7512f361",
        image: {
          thumbnail: "/assets/images/Robot/2025/infantry-04-720.webp",
          medium: "/assets/images/Robot/2025/infantry-04-1440.webp",
          large: "/assets/images/Robot/2025/infantry-04-2400.webp",
        },
      },
      {
        id: "2025-sentinel-07",
        number: "07",
        name: "7号哨兵机器人",
        category: "哨兵",
        sourceFilename: "7号哨兵.JPG",
        sourceSha256: "ce546777721575f9a42bf216c61326ea5d7cfc782deef29d37e7fdc9d8d2836d",
        image: {
          thumbnail: "/assets/images/Robot/2025/sentinel-07-720.webp",
          medium: "/assets/images/Robot/2025/sentinel-07-1440.webp",
          large: "/assets/images/Robot/2025/sentinel-07-2400.webp",
        },
      },
      {
        id: "2025-radar-09",
        number: "09",
        name: "9号雷达系统",
        category: "雷达",
        sourceFilename: "9号雷达.JPG",
        sourceSha256: "431346fb302253bdad3eb0bb02c0fd380481cafbc1833bf4e218ee9620c6eb4c",
        image: {
          thumbnail: "/assets/images/Robot/2025/radar-09-720.webp",
          medium: "/assets/images/Robot/2025/radar-09-1440.webp",
          large: "/assets/images/Robot/2025/radar-09-2400.webp",
        },
      },
      {
        id: "2025-dart-08",
        number: "08",
        name: "8号飞镖系统",
        category: "飞镖",
        sourceFilename: "8号飞镖.JPG",
        sourceSha256: "3607c829e18365b31c5fb4fc195d93d13e08711c7a2f7998a3340b12313e9c47",
        image: {
          thumbnail: "/assets/images/Robot/2025/dart-08-720.webp",
          medium: "/assets/images/Robot/2025/dart-08-1440.webp",
          large: "/assets/images/Robot/2025/dart-08-2400.webp",
        },
      },
      {
        id: "2025-hero-backup",
        number: "备车",
        name: "英雄机器人（备车）",
        category: "英雄",
        sourceFilename: "英雄备车.JPG",
        sourceSha256: "ce10c9cad1718c681916306e8e04996594940ff44a02b7bb463c1e63c4ba76a8",
        image: {
          thumbnail: "/assets/images/Robot/2025/hero-backup-720.webp",
          medium: "/assets/images/Robot/2025/hero-backup-1440.webp",
          large: "/assets/images/Robot/2025/hero-backup-2400.webp",
        },
      },
      {
        id: "2025-air-06",
        number: "06",
        name: "6号无人机",
        category: "空中",
        sourceFilename: "6号无人机.JPG",
        sourceSha256: "d36395b1414506814f6a32ce3235a5da6fa3f9de4c2e5bd2712281231483df1a",
        image: {
          thumbnail: "/assets/images/Robot/2025/air-06-720.webp",
          medium: "/assets/images/Robot/2025/air-06-1440.webp",
          large: "/assets/images/Robot/2025/air-06-2400.webp",
        },
      },
    ] satisfies readonly RobotSeasonEntry[],
  },
  {
    season: 2024,
    title: "2024 赛季机器人阵容",
    robots: [
      {
        id: "hero-01",
        number: "01",
        name: "1号英雄机器人",
        category: "英雄",
        sourceFilename: "1号英雄.JPG",
        sourceSha256: "4dfd9c2ed790d7adf22ffd3a1e6f152395681e1ec4937157aaa42851a447aee8",
        image: {
          thumbnail: "/assets/images/Robot/2024/hero-01-720.webp",
          medium: "/assets/images/Robot/2024/hero-01-1440.webp",
          large: "/assets/images/Robot/2024/hero-01-2400.webp",
        },
      },
      {
        id: "hero-01-backup",
        number: "01",
        name: "1号英雄机器人（备车）",
        category: "英雄",
        sourceFilename: "1号英雄（备车）.JPG",
        sourceSha256: "d2fab0c5459cabd394a1636a17884744973a6efc352bad824308e41f8d9246b1",
        image: {
          thumbnail: "/assets/images/Robot/2024/hero-01-backup-720.webp",
          medium: "/assets/images/Robot/2024/hero-01-backup-1440.webp",
          large: "/assets/images/Robot/2024/hero-01-backup-2400.webp",
        },
      },
      {
        id: "engineering-02",
        number: "02",
        name: "2号工程机器人",
        category: "工程",
        sourceFilename: "2号工程.JPG",
        sourceSha256: "d21799e7285acc57f913c65aef417fda3acb99dd73bac832755dfebace270124",
        image: {
          thumbnail: "/assets/images/Robot/2024/engineering-02-720.webp",
          medium: "/assets/images/Robot/2024/engineering-02-1440.webp",
          large: "/assets/images/Robot/2024/engineering-02-2400.webp",
        },
      },
      {
        id: "infantry-04",
        number: "04",
        name: "4号步兵机器人",
        category: "步兵",
        sourceFilename: "4号步兵.JPG",
        sourceSha256: "7baf57d61b612eca47c6979d848e26bbeda7234c00a1c62d3dd9c71328440e93",
        image: {
          thumbnail: "/assets/images/Robot/2024/infantry-04-720.webp",
          medium: "/assets/images/Robot/2024/infantry-04-1440.webp",
          large: "/assets/images/Robot/2024/infantry-04-2400.webp",
        },
      },
      {
        id: "radar-09",
        number: "09",
        name: "9号雷达系统",
        category: "雷达",
        sourceFilename: "9号雷达.JPG",
        sourceSha256: "13e4294098a481109ab4a28fb9b3dcbf57440155f130fd4ee8604413877dba4e",
        image: {
          thumbnail: "/assets/images/Robot/2024/radar-09-720.webp",
          medium: "/assets/images/Robot/2024/radar-09-1440.webp",
          large: "/assets/images/Robot/2024/radar-09-2400.webp",
        },
      },
      {
        id: "infantry-03",
        number: "03",
        name: "3号步兵机器人",
        category: "步兵",
        sourceFilename: "3号步兵.JPG",
        sourceSha256: "b0bb195c310a327825792ff685156fdb953e67c3038634e7b400011b496037c5",
        image: {
          thumbnail: "/assets/images/Robot/2024/infantry-03-720.webp",
          medium: "/assets/images/Robot/2024/infantry-03-1440.webp",
          large: "/assets/images/Robot/2024/infantry-03-2400.webp",
        },
      },
      {
        id: "infantry-05-backup",
        number: "05",
        name: "5号步兵机器人（备车）",
        category: "步兵",
        sourceFilename: "5号步兵（备车）.JPG",
        sourceSha256: "dea219f376592687e587b3a3af9c39fd5c357a34170226a18249e8ffc661d14b",
        image: {
          thumbnail: "/assets/images/Robot/2024/infantry-05-backup-720.webp",
          medium: "/assets/images/Robot/2024/infantry-05-backup-1440.webp",
          large: "/assets/images/Robot/2024/infantry-05-backup-2400.webp",
        },
      },
      {
        id: "sentinel-07",
        number: "07",
        name: "7号哨兵机器人",
        category: "哨兵",
        sourceFilename: "7号哨兵.JPG",
        sourceSha256: "6a8c37841f7e3146e2b9acc4c3b0cf206c155dd3ea769dc575187465e6493905",
        image: {
          thumbnail: "/assets/images/Robot/2024/sentinel-07-720.webp",
          medium: "/assets/images/Robot/2024/sentinel-07-1440.webp",
          large: "/assets/images/Robot/2024/sentinel-07-2400.webp",
        },
      },
      {
        id: "infantry-05",
        number: "05",
        name: "5号步兵机器人",
        category: "步兵",
        sourceFilename: "5号步兵.JPG",
        sourceSha256: "0511ecb1231aa8d635a92b0c8459a024e598732149d127b450927ca4dcacd9b5",
        image: {
          thumbnail: "/assets/images/Robot/2024/infantry-05-720.webp",
          medium: "/assets/images/Robot/2024/infantry-05-1440.webp",
          large: "/assets/images/Robot/2024/infantry-05-2400.webp",
        },
      },
      {
        id: "dart-08",
        number: "08",
        name: "8号飞镖系统",
        category: "飞镖",
        sourceFilename: "8号飞镖.JPG",
        sourceSha256: "7100eed7ea0e58b8c6036dc2a339b5ec2de55306dbf10f0b846110fa47bfa273",
        image: {
          thumbnail: "/assets/images/Robot/2024/dart-08-720.webp",
          medium: "/assets/images/Robot/2024/dart-08-1440.webp",
          large: "/assets/images/Robot/2024/dart-08-2400.webp",
        },
      },
      {
        id: "air-06",
        number: "06",
        name: "6号空中机器人",
        category: "空中",
        sourceFilename: "6号无人机.JPG",
        sourceSha256: "f05197b7ac54ed29d32e6ad516b5e8d4120c9a6fd2541ff3827f9d2a0ed7e498",
        image: {
          thumbnail: "/assets/images/Robot/2024/air-06-720.webp",
          medium: "/assets/images/Robot/2024/air-06-1440.webp",
          large: "/assets/images/Robot/2024/air-06-2400.webp",
        },
      },
    ] satisfies readonly RobotSeasonEntry[],
  },
] satisfies readonly RobotSeason[];

export const robotArchive2025 = robotSeasons.find((season) => season.season === 2025)!;
export const robotArchive2024 = robotSeasons.find((season) => season.season === 2024)!;
