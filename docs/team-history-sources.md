# 团队历程：事实与资料对应

页面故事与照片集中在 `internal/frontend/app/data/team-history.ts`，通过 `sourceIds` 标明对应材料。赛事结果使用 `honorIds` 引用 `internal/frontend/app/lib/events-and-honors-data.ts` 的获奖条目；页面直接展示对应结果和原始公告链接，避免在队史文件中重复维护赛果。

## 页面事实来源

| 年份 | 页面记录 | 主要依据 |
| --- | --- | --- |
| 2018 | TARS-Go 于年末组队；名称来自《星际穿越》中的 TARS 及其寓意 | [吉林大学起源报道](https://news.jlu.edu.cn/info/1306/52000.htm)；创队者口述（2026 年 9 月）；TARS-Go 2024 文化建设公开资料 |
| 2019 | ICRA RoboMaster AI Challenge 蒙特利尔站，全球并列第九、国际三等奖；转向 RoboMaster 对抗赛及早期夏令营回忆 | [吉林大学 ICRA 2019 报道](https://news.jlu.edu.cn/info/1021/48397.htm)；[RoboMaster 社区战队回顾](https://bbs.robomaster.com/article/6827)；创队者口述（2026 年 9 月） |
| 2020 | 疫情期间远程协作；RoboMaster 全国线上评审赛一等奖 | [吉林大学起源报道](https://news.jlu.edu.cn/info/1306/52000.htm) |
| 2021 | 梦工场的跨学科、学生主体实践平台形态；TARS-Go 与平台的组织关系；九节电控夏令营公开视频 | [吉林大学创新创业教育学院报道](https://cxcyjyxy.jlu.edu.cn/info/1099/1228.htm)；[吉林大学起源报道](https://news.jlu.edu.cn/info/1306/52000.htm)；[电控夏令营公开视频](https://www.bilibili.com/video/BV1nU4y1n7Xu/) |
| 2022 | S1 模拟对抗实践覆盖三个校区、近百名学生；TARS-Go 发布 AI 挑战赛算法资料 | [吉林大学 S1 活动报道](https://cxcyjyxy.jlu.edu.cn/info/1099/1614.htm)；[RoboMaster 社区算法开源记录](https://bbs.robomaster.com/article/9138) |
| 2023 | 公开英雄机器人机械设计资料、模型与说明 | [RoboMaster 社区英雄机器人开源记录](https://bbs.robomaster.com/article/9447) |
| 2024 | 东部赛区晋级；首次进入全国总决赛；东部赛区一等奖、全国赛二等奖 | [RoboMaster 2024 区域赛名单](https://www.robomaster.com/zh-CN/resource/pages/announcement/1736)；[RoboMaster 2024 全国赛名单](https://www.robomaster.com/zh-CN/resource/pages/announcement/1759) |
| 2025 | 步兵方案开源；区域赛晋级；全国赛二等奖、步兵机器人竞技奖二等奖；队史学习为文化建设规划内容 | [步兵开源记录](https://bbs.robomaster.com/article/716393)；[区域赛名单](https://www.robomaster.com/zh-CN/resource/pages/announcement/1847)；[全国赛名单](https://www.robomaster.com/zh-CN/resource/pages/announcement/1856)；[机器人竞技奖名单](https://www.robomaster.com/zh-CN/resource/pages/announcement/1853)；内部规划依据为 `tarsgo-operations/research/2025-culture-building-plan-source-notes.md`（仅说明规划，不作为已执行活动的证据） |
| 2026 | 官网机器人赛季档案、步兵与工程机器人开源资料；超级对抗赛全国赛三等奖；青少年科创研学报道 | [官网机器人展厅](/robots)；[步兵算法开源](https://bbs.robomaster.com/article/1883887)；[工程机器人机械结构开源](https://bbs.robomaster.com/article/1885239)；[全国赛获奖名单](https://www.robomaster.com/zh-CN/resource/pages/announcement/1925)；[吉林大学研学报道](https://news.jlu.edu.cn/info/1211/61778.htm) |

平台与战队身份的区分参考吉林大学 2020 年起源报道、2021 年梦工场平台报道，以及内部 `tarsgo-operations/operations/team-foundation-v1.0.md` 和 `publicity/brand-foundation.md`。内部资料用于核对组织定位，不将内部会议内容或成员评价写入页面。

资料整理还对照了 `tarsgo-operations/research/tarsgo-public-history-and-culture.md`、`research/oral-history/`、`research/team-history-culture-asset-system.md`、`operations/2024赛季规划历史沉淀.md` 和 `research/2025-culture-building-plan-source-notes.md`。其中口述与内部规划仅按页面标注的范围使用；2024 赛季内部规划中的会议和成员信息不对外发布。

## 页面照片

| 年份 | 使用素材 | 依据 |
| --- | --- | --- |
| 2019 | `/assets/images/Milestone/2019-breakthrough.webp` | 校方 ICRA 2019 报道与原始现场照片相互核对 |
| 2020 | `/assets/images/Milestone/2020-first-achievement-01.webp` | 原图内容及校方起源报道；不展示证书上的个人姓名 |
| 2022 | `/assets/images/Milestone/2022-inheritance-system-02.webp` | 原图中的 2022 赛季标识与机器人展厅已有档案 |
| 2024 | `/assets/images/Milestone/2024-national-competition.webp` | 官网既有赛季照片；赛事阶段与结果由 RoboMaster 官方名单核对。图片说明只称“2024 赛季赛场”，不推断拍摄于区域赛或全国赛 |
| 2025 | `/assets/images/Milestone/2025-legacy.webp` | 原图可辨认高校联盟赛辽宁站 3V3 对抗赛场景 |
| 2026 | `/assets/images/Robot/2026/hero-01-1440.webp` | 官网机器人赛季档案 |

未为 2018 年配置照片：现存同名图片无法证明拍摄于 2018 年。`2021-technological-iteration.webp`、`2022-inheritance-system-01.webp`、`2023-cultural-development-01.webp` 和 `2023-cultural-development-02.webp` 未用于页面；文件名不能作为其历史内容依据，部分图片实际内容与文件名年份或主题不符。

## 待核实

- 2018 年具体成立日期、首次报名日期，以及确定 TARS-Go 名称的准确时间；现有校方资料只支持“2018 年底”，月份与报名过程来自口述回忆。
- 吉甲大师平台第一次以该名称成立或运行的准确日期。页面不把平台成立时间等同于 TARS-Go 的成立时间。
- 2019 年早期交流地点及部分活动的准确日期。公开回顾与后续口述对地点说法不一致，页面不采用任何一方作为确定事实。
- 夏令营首次开展的准确时间、届次及覆盖校区；当前只按口述回忆标注为 2019 年暑期。
- 现存部分历史照片的拍摄日期、活动归属及成员授权；未确认的图片没有用作具体事件配图。

创队口述在页面明确标作口述材料，不作为独立的公开证明。2025 赛季规划明确标作规划；未据此推断执行情况。页面不显示未经授权的个人信息、证书姓名或内部评价。
