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
  description: string;
  robots: readonly RobotSeasonEntry[];
};

export const robotSeasons = [
  {
    season: 2024,
    title: "2024 赛季机器人阵容",
    description: "收录 2024 赛季的 11 台机器人与设备定妆照。按类别浏览，或打开大图查看完整影像。",
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

export const robotArchive2024 = robotSeasons[0];
