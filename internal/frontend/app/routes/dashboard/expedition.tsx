import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { assignmentClient, type Assignment } from "~/lib/assignment-client";
import { getGrowthProfile, growthEventLabel, formatGrowthDate, type GrowthEvent, type GrowthProfile } from "~/lib/growth-client";
import { buildExpeditionChallenges, getAcceptedExpeditionMilestones, getExpeditionEvolution, getPrimaryFacilityId, getPublicFacilityFAQs, type ExpeditionChallenge, type ExpeditionEvolutionTarget, type ExpeditionFacilityId } from "~/lib/expedition-data";
import { expeditionEvolutionTargetLabel, expeditionProjectClient, type ExpeditionProject } from "~/lib/expedition-project-client";
import { hasSkillGroupAccess, hasTechnicalGroupAccess, isTechnicalGroupName } from "~/lib/dashboard-navigation";
import { skillsClient, type SkillGroupProgress } from "~/lib/skills-client";
import { formatQuestionDate, trainingQuestionClient, type TrainingQuestion } from "~/lib/training-question-client";
import "./expedition.css";

export function meta() {
  return [{ title: "TARS BASE · 赛季远征 | TARSGO" }];
}

interface FacilityInfo {
  id: ExpeditionFacilityId;
  name: string;
  englishName: string;
  groupName: string | null;
  description: string;
  focus: string;
  x: number;
  y: number;
}

const FACILITIES: readonly FacilityInfo[] = [
  { id: "hangar", name: "总装机库", englishName: "ASSEMBLY HANGAR", groupName: null, description: "战队共同目标与个人成长记录汇集于此。", focus: "个人成长", x: 50, y: 51 },
  { id: "mechanical", name: "机械工坊", englishName: "MECHANICAL WORKSHOP", groupName: "机械组", description: "机械设计、建模、加工与结构实践。", focus: "技能路线 · 作业 · 答疑", x: 27, y: 27 },
  { id: "controls", name: "电控实验室", englishName: "CONTROL LAB", groupName: "电控组", description: "控制器、驱动、通信与整车联调。", focus: "技能路线 · 作业 · 答疑", x: 74, y: 27 },
  { id: "vision", name: "视觉研究所", englishName: "VISION INSTITUTE", groupName: "视觉组", description: "成像、标定、识别与环境感知。", focus: "技能路线 · 作业 · 答疑", x: 19, y: 58 },
  { id: "ai", name: "AI 研究中心", englishName: "AI RESEARCH CENTER", groupName: "AI组", description: "算法、仿真、决策与系统集成。", focus: "技能路线 · 作业 · 答疑", x: 81, y: 58 },
  { id: "operations", name: "战队指挥室", englishName: "TEAM OPERATIONS", groupName: "运营组", description: "活动策划、内容、协调与项目推进。", focus: "技能路线 · 工作周报", x: 50, y: 79 },
];

interface ExpeditionData {
  profile: GrowthProfile | null;
  skills: SkillGroupProgress[];
  assignments: Assignment[];
  questions: TrainingQuestion[];
  faqs: TrainingQuestion[];
  projects: ExpeditionProject[];
  loading: boolean;
  errors: { profile: boolean; skills: boolean; assignments: boolean; questions: boolean; faqs: boolean; projects: boolean };
}

const EMPTY_DATA: ExpeditionData = {
  profile: null,
  skills: [],
  assignments: [],
  questions: [],
  faqs: [],
  projects: [],
  loading: true,
  errors: { profile: false, skills: false, assignments: false, questions: false, faqs: false, projects: false },
};

function ZoneGlyph({ id, className = "" }: { id: ExpeditionFacilityId; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...common}>
      {id === "hangar" ? <><path d="M3 10.5 12 4l9 6.5v9H3z" /><path d="M8 19.5v-6h8v6M5.5 10.5h13" /><path d="M12 4v3" /></> : null}
      {id === "mechanical" ? <><path d="M14.7 6.1a4.2 4.2 0 0 0-5.5 5.5l-5.6 5.6a1.8 1.8 0 0 0 2.5 2.5l5.6-5.6a4.2 4.2 0 0 0 5.5-5.5l-2.6 2.6-2.5-2.5z" /><path d="m17.2 4.5 2.3 2.3" /></> : null}
      {id === "controls" ? <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M7 8h3v3H7zM14 8h3M14 11h3M7 15h3M14 15h3" /><path d="M10 9.5h4M8.5 11v4" /></> : null}
      {id === "vision" ? <><path d="M2.8 12s3.3-5.1 9.2-5.1 9.2 5.1 9.2 5.1-3.3 5.1-9.2 5.1S2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="12" r=".7" /></> : null}
      {id === "ai" ? <><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 9h6v6H9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M6.2 6.2l-1.3-1.3M19.1 19.1l-1.3-1.3M17.8 6.2l1.3-1.3M4.9 19.1l1.3-1.3" /></> : null}
      {id === "operations" ? <><path d="M4 19h16M6 16V9l6-4 6 4v7" /><path d="M9 16v-4h6v4M12 5V2.8M8.5 7.3 7 5.8M15.5 7.3 17 5.8" /><circle cx="12" cy="2.7" r=".8" /></> : null}
    </svg>
  );
}

function ExpeditionMap({ selectedId, onSelect, masteredFacilityIds, hasPersonalRecord, acceptedEvolutionTargets, hasAcceptedJoint, detailsOpen, children }: { selectedId: ExpeditionFacilityId; onSelect: (id: ExpeditionFacilityId) => void; masteredFacilityIds: readonly ExpeditionFacilityId[]; hasPersonalRecord: boolean; acceptedEvolutionTargets: readonly ExpeditionEvolutionTarget[]; hasAcceptedJoint: boolean; detailsOpen: boolean; children?: ReactNode }) {
  const stateClass = (id: ExpeditionFacilityId) => masteredFacilityIds.includes(id) ? "has-mastered" : "";
  const selectedFacility = FACILITIES.find((facility) => facility.id === selectedId) ?? FACILITIES[0];
  return (
    <div className="expedition-map" aria-label="可探索的基地设施" data-selected={selectedId} data-focused={detailsOpen} data-season-joint={hasAcceptedJoint}>
      <svg className="expedition-map__art" style={{ transformOrigin: `${selectedFacility.x}% ${selectedFacility.y}%` }} viewBox="0 0 1000 850" role="img" aria-label="总装机库与五座专业设施以道路相连的等距基地地图">
        <defs>
          <linearGradient id="base-ground" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#202b2a" /><stop offset=".52" stopColor="#111918" /><stop offset="1" stopColor="#0a1010" /></linearGradient>
          <linearGradient id="base-platform" x1=".2" x2=".85" y1="0" y2="1"><stop offset="0" stopColor="#394643" /><stop offset=".42" stopColor="#202b29" /><stop offset="1" stopColor="#141c1b" /></linearGradient>
          <linearGradient id="hangar-roof" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#d2b478" /><stop offset=".48" stopColor="#8a7853" /><stop offset="1" stopColor="#3d4a45" /></linearGradient>
          <linearGradient id="blue-glass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4c9fac" stopOpacity=".88" /><stop offset="1" stopColor="#1e4a52" stopOpacity=".8" /></linearGradient>
          <radialGradient id="base-core"><stop stopColor="#d9c08a" stopOpacity=".26" /><stop offset="1" stopColor="#d9c08a" stopOpacity="0" /></radialGradient>
          <filter id="facility-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <pattern id="floor-grid" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="skewY(-28) scale(1 .74)"><path d="M42 0H0V42" fill="none" stroke="#8bb0a3" strokeOpacity=".08" strokeWidth="1" /></pattern>
        </defs>
        <rect width="1000" height="850" fill="url(#base-ground)" />
        <ellipse cx="500" cy="413" rx="470" ry="350" fill="url(#base-core)" />
        <path d="M500 64 948 369 500 784 52 369Z" fill="url(#base-platform)" stroke="#6d8078" strokeOpacity=".52" strokeWidth="2" />
        <path d="M500 87 920 374 500 760 80 374Z" fill="url(#floor-grid)" stroke="#c6ac70" strokeOpacity=".34" strokeWidth="1.5" />
        <path d="M500 127 876 383 500 724 124 383Z" fill="none" stroke="#83a49b" strokeOpacity=".22" strokeWidth="1" strokeDasharray="3 9" />
        <path d="M500 64v23M948 369h-28M500 784v-24M52 369h28" stroke="#e0c98d" strokeOpacity=".72" strokeWidth="3" />
        <path className="expedition-map__road" d="M500 430 270 242M500 430 735 240M500 430 190 478M500 430 810 480M500 430 500 665" />
        <path className="expedition-map__road expedition-map__road--signal" d="M500 430 270 242M500 430 735 240M500 430 190 478M500 430 810 480M500 430 500 665" />
        <g className="expedition-map__road-node"><circle cx="391" cy="339" r="5" /><circle cx="619" cy="334" r="5" /><circle cx="346" cy="408" r="5" /><circle cx="660" cy="405" r="5" /><circle cx="500" cy="538" r="5" /></g>
        <g className="expedition-map__environment" fill="none" stroke="#91aaa1" strokeOpacity=".5">
          <path d="m99 374 22-15 22 15-22 15zM864 642l21-14 21 14-21 14zM822 225l17-11 17 11-17 12zM191 658l17-11 17 11-17 12z" />
          <path d="M121 370v-28M884 638v-33M839 220v-31M208 654v-29" />
          <circle cx="121" cy="337" r="3" fill="#d8b96e" /><circle cx="884" cy="603" r="3" fill="#6cc6cf" /><circle cx="839" cy="186" r="3" fill="#6cc6cf" /><circle cx="208" cy="621" r="3" fill="#d8b96e" />
        </g>

        <g className={`expedition-map__building expedition-map__building--mechanical ${stateClass("mechanical")} ${selectedId === "mechanical" ? "is-selected" : ""}`} transform="translate(183 176)">
          <ellipse className="expedition-map__selection" cx="87" cy="85" rx="112" ry="55" />
          <path d="m0 85 87-48 174 48-87 51z" fill="#283330" stroke="#8d977f" strokeOpacity=".62" />
          <path d="m0 85 0 19 87 51v-19zM174 104l87-19v18l-87 52z" fill="#1b2624" stroke="#4b5b54" />
          <path d="m27 74 61-35 121 35-60 35z" fill="#96754e" stroke="#d1ad68" strokeOpacity=".68" />
          <path d="m27 74 0 33 61 35V108zM149 109l60-35v35l-60 33z" fill="#654f3b" stroke="#9c8056" />
          <path d="m29 73 20-13 18 10-20 13zM68 51l20-12 20 12-20 12zM108 50l19-11 20 11-19 12z" fill="#d1ad68" fillOpacity=".55" />
          <path d="M66 113v20M86 119v20M108 113v20" stroke="#edbd68" strokeWidth="4" />
          <path d="M48 92v23M133 113V91" stroke="#edbd68" strokeOpacity=".75" strokeWidth="2" />
          <path d="M204 94V51l11-7v50" fill="#384540" stroke="#8e9f8e" /><path d="M215 48h16v8h-16" fill="#d1ad68" />
          <path d="M108 111v24" stroke="#f2d78f" strokeWidth="2" filter="url(#facility-glow)" />
          <g className="expedition-machine-tooling" strokeLinejoin="round">
            <path d="m45 77 29-16 54 15-29 17z" fill="#313d37" stroke="#d0ad68" strokeOpacity=".86" />
            <path d="m45 77 0 18 29 17V94zM99 93l29-17v18l-29 18z" fill="#202a26" stroke="#846d49" />
            <path d="m56 76 18-10 35 10-18 10z" fill="#101817" stroke="#8ba398" />
            <path d="M61 75h36M65 73h27M70 71h18" stroke="#d0ad68" strokeWidth="1.5" />
            <g transform="translate(117 79)">
              <g className="expedition-lathe-spindle">
                <ellipse cx="0" cy="0" rx="7" ry="4" fill="#192321" stroke="#9bd3c6" strokeWidth="1.5" />
                <path d="M-2 0h18" stroke="#e5c982" strokeWidth="2" />
                <circle cx="17" cy="0" r="2.4" fill="#dbbc73" />
              </g>
            </g>
            <path d="M50 97h41M51 101h18M87 104h7" stroke="#68847b" strokeWidth="1.3" />
            <circle className="expedition-mastery-light" cx="54" cy="79" r="2.3" fill="#e8c979" />
          </g>
          <g className="expedition-robot-arm" strokeLinejoin="round">
            <path d="m164 94 13-8 17 8-13 8z" fill="#202a26" stroke="#b28e56" />
            <path d="M170 91 170 79l8-5 8 5v13" fill="#34423b" stroke="#d0ad68" strokeWidth="2" />
            <g className="expedition-robot-arm__reach">
              <path d="m173 78-5-13 9-7 10 8-4 7-6-4 1 10" fill="#92774d" stroke="#efcf81" strokeWidth="2" />
              <circle cx="177" cy="62" r="4" fill="#19211e" stroke="#e2bd70" strokeWidth="2" />
              <path d="m184 66 12-8 7 3-8 7M202 60l4-6M202 60l7 1" fill="none" stroke="#e4c77e" strokeWidth="2" />
              <circle cx="206" cy="53" r="2" fill="#80d4cc" />
            </g>
            <path d="M165 97h29" stroke="#63746a" strokeWidth="2" />
          </g>
        </g>

        <g className={`expedition-map__building expedition-map__building--controls ${stateClass("controls")} ${selectedId === "controls" ? "is-selected" : ""}`} transform="translate(645 165)">
          <ellipse className="expedition-map__selection" cx="89" cy="83" rx="111" ry="52" />
          <path d="m0 82 88-47 176 47-88 51z" fill="#263433" stroke="#658d8a" strokeOpacity=".8" />
          <path d="m0 82 0 18 88 51v-18zM176 100l88-18v18l-88 51z" fill="#182322" stroke="#3b6362" />
          <path d="m35 68 53-29 141 29-53 30z" fill="#376065" stroke="#6acbd1" strokeOpacity=".8" />
          <path d="m35 68 0 35 53 30V98zM176 98l53-30v35l-53 30z" fill="#294448" stroke="#4d8b91" />
          <rect x="79" y="53" width="54" height="28" rx="2" fill="#10191a" stroke="#8ae1df" strokeOpacity=".82" transform="skewY(16)" />
          <path d="m87 70 11-7 9 5 12-7" fill="none" stroke="#7bd9d4" strokeWidth="2" />
          <path d="M50 92v20M67 102v20M139 101v20M156 110v20" stroke="#6ecbd0" strokeWidth="3" />
          <path d="M25 76h28M213 91h28M96 42v-14M107 45v-8" stroke="#8be4de" strokeWidth="2" />
          <circle cx="96" cy="25" r="3" fill="#8be4de" /><circle cx="107" cy="34" r="2" fill="#d4b76c" />
          <g className="expedition-control-board" strokeLinejoin="round">
            <path d="m145 77 23-13 42 12-23 14z" fill="#102020" stroke="#77c8c5" strokeWidth="1.4" />
            <path d="m150 77 18-10M155 80l17-10M161 83l17-10M175 84l10-6" stroke="#69b8b0" strokeOpacity=".76" strokeWidth="1" />
            <path d="m173 72 6 2v6l-6-2zM186 76l5 2v5l-5-2zM196 73l5 2v5l-5-2z" fill="#8aab87" stroke="#d8c37f" strokeWidth=".8" />
            <circle className="expedition-mastery-light" cx="205" cy="83" r="2.2" fill="#e7c878" />
            <path d="M148 88v6m9-4v6m10-4v6m12-4v6" stroke="#8ae1df" strokeWidth="1" />
          </g>
          <g className="expedition-scope" transform="translate(45 54)">
            <path d="m0 8 15-8 23 7-15 9z" fill="#15201f" stroke="#729a91" />
            <path d="M0 8v17l23 8V16zM23 16l15-9v17l-15 9z" fill="#202d2a" stroke="#58756c" />
            <path d="m5 8 10-5 15 5-10 6z" fill="#203b3a" stroke="#80d7cf" />
            <path d="M8 21h9M8 25h13M27 21h6" stroke="#82d4cd" strokeWidth="1.2" />
            <circle className="expedition-control-led" cx="31" cy="29" r="1.7" fill="#e8c978" />
          </g>
        </g>

        <g className={`expedition-map__building expedition-map__building--vision ${stateClass("vision")} ${selectedId === "vision" ? "is-selected" : ""}`} transform="translate(70 404)">
          <ellipse className="expedition-map__selection" cx="104" cy="74" rx="115" ry="49" />
          <path d="m0 76 101-54 203 54-101 55z" fill="#28333a" stroke="#6d7d89" />
          <path d="m0 76v17l101 57V133zM203 133l101-57v17l-101 57z" fill="#1b2429" stroke="#495761" />
          <path d="m45 61 56-29 112 29-56 30z" fill="#52627a" stroke="#93a5d1" strokeOpacity=".8" />
          <path d="m45 61v40l56 32V93zM157 93l56-32v40l-56 32z" fill="#354452" stroke="#7385a7" />
          <ellipse cx="101" cy="57" rx="29" ry="15" fill="#171c27" stroke="#90b8d4" strokeWidth="3" />
          <ellipse cx="101" cy="57" rx="15" ry="8" fill="url(#blue-glass)" stroke="#c3e4e7" strokeWidth="1.5" />
          <circle cx="101" cy="57" r="4" fill="#d5bc7a" filter="url(#facility-glow)" />
          <path d="M232 99V47l14-8v52M246 39l26 4-13 8-27-4" fill="#394851" stroke="#8da7ba" />
          <path d="M254 55 294 68M252 65l40 15M249 77l37 17" stroke="#9be3eb" strokeOpacity=".46" />
          <g className="expedition-lidar" transform="translate(260 38)">
            <path d="M-10 18h20l5 5h-30z" fill="#273640" stroke="#8da7ba" />
            <path d="M0 18V4" stroke="#9db9c5" strokeWidth="2" />
            <circle cx="0" cy="1" r="11" fill="#17232a" stroke="#9fc6d1" strokeWidth="1.5" />
            <circle cx="0" cy="1" r="5" fill="#263d47" stroke="#7dd7e1" />
            <g className="expedition-lidar__sweep">
              <path d="M0 1 25-8A27 27 0 0 1 17 23Z" fill="#73d7df" fillOpacity=".14" />
              <path d="M0 1 24-9" stroke="#b2eced" strokeWidth="1.5" />
            </g>
            <circle className="expedition-lidar__pulse" cx="0" cy="1" r="17" fill="none" stroke="#83dce1" strokeWidth="1" />
            <circle className="expedition-mastery-light" cx="0" cy="1" r="2.4" fill="#efcf80" />
          </g>
          <g className="expedition-camera-array">
            <path d="M81 51v-16l13-7 16 7v17" fill="#263644" stroke="#a9c6d1" strokeWidth="1.5" />
            <path d="m87 37 7-4 8 4v7l-8 4-7-4z" fill="#10191e" stroke="#94cdd6" />
            <circle cx="95" cy="40" r="3.2" fill="#76c9d8" stroke="#d3edf0" />
            <path d="M84 52h23M90 56h13" stroke="#d1b875" strokeWidth="1.4" />
          </g>
        </g>

        <g className={`expedition-map__building expedition-map__building--ai ${stateClass("ai")} ${selectedId === "ai" ? "is-selected" : ""}`} transform="translate(658 405)">
          <ellipse className="expedition-map__selection" cx="113" cy="75" rx="125" ry="49" />
          <path d="m0 76 111-57 222 57-111 57z" fill="#292f3a" stroke="#727a91" />
          <path d="m0 76v18l111 58v-19zM222 133l111-57v18l-111 58z" fill="#1a2029" stroke="#4d5364" />
          <path d="m27 65 84-44 169 44-84 45z" fill="#54566e" stroke="#a09dcc" strokeOpacity=".76" />
          <path d="m27 65v35l84 48v-39zM196 109l84-44v35l-84 48z" fill="#33394b" stroke="#737695" />
          <path d="M55 59V35l23-12v24M87 68V28l22-12v44M119 77V36l23-12v65M151 86V44l22-12v43" fill="#151b25" stroke="#8b92bc" strokeWidth="2" />
          <path d="M63 44h7M95 37h7M127 46h7M159 54h7M63 53h7M95 48h7M127 57h7M159 65h7" stroke="#83d2df" strokeWidth="2" />
          <path d="M282 78v-40l14-8v41M296 30h18v9h-18" fill="#333849" stroke="#a4a2c8" />
          <circle cx="304" cy="27" r="3" fill="#a2dfe4" filter="url(#facility-glow)" />
          <g className="expedition-server-fans" fill="#141c25" stroke="#a4aacb" strokeWidth="1.4">
            <g transform="translate(70 49)"><circle r="7" /><g className="expedition-server-fan"><path d="M0-5v10M-5 0h10M-3.5-3.5l7 7M3.5-3.5l-7 7" stroke="#81d7df" strokeWidth="1" /></g></g>
            <g transform="translate(104 54)"><circle r="7" /><g className="expedition-server-fan"><path d="M0-5v10M-5 0h10M-3.5-3.5l7 7M3.5-3.5l-7 7" stroke="#81d7df" strokeWidth="1" /></g></g>
            <g transform="translate(136 63)"><circle r="7" /><g className="expedition-server-fan"><path d="M0-5v10M-5 0h10M-3.5-3.5l7 7M3.5-3.5l-7 7" stroke="#81d7df" strokeWidth="1" /></g></g>
          </g>
          <g className="expedition-compute-lights">
            <circle cx="78" cy="61" r="1.7" /><circle cx="112" cy="66" r="1.7" /><circle cx="144" cy="75" r="1.7" />
          </g>
          <path d="m184 65 21-11 22 11-22 11z" fill="#171d29" stroke="#a19ac9" />
          <path d="m193 65 12-6 12 6-12 6z" fill="#344e64" stroke="#81d6e1" />
          <circle className="expedition-mastery-light" cx="205" cy="65" r="2.5" fill="#edcc7e" />
        </g>

        <g className={`expedition-map__building expedition-map__building--operations ${stateClass("operations")} ${selectedId === "operations" ? "is-selected" : ""}`} transform="translate(373 594)">
          <ellipse className="expedition-map__selection" cx="128" cy="59" rx="142" ry="48" />
          <path d="m0 62 128-58 256 58-128 61z" fill="#37352d" stroke="#a09168" />
          <path d="M0 62v16l128 61V121zM256 121l128-59v16l-128 61z" fill="#23251f" stroke="#70684c" />
          <path d="m52 48 76-34 152 34-76 36z" fill="#75664d" stroke="#d3b56e" strokeOpacity=".74" />
          <path d="m52 48v39l76 36V83zM204 83l76-35v39l-76 36z" fill="#4c483b" stroke="#9b885a" />
          <path d="M117 26V-5l11-18 11 18v31M128-23v-22M108-14l-13-13M148-14l13-13" fill="none" stroke="#d5bf87" strokeWidth="3" />
          <circle cx="128" cy="-47" r="5" fill="#e7d79f" filter="url(#facility-glow)" />
          <path d="M89 66V37l16-7 16 7v31M136 75V44l16-7 16 7v31" fill="#171c1a" stroke="#d0ad69" />
          <path d="M94 44h21M141 51h21M100 51v9M147 58v9" stroke="#8cc6c2" strokeWidth="2" />
          <g className="expedition-comms-dish" transform="translate(248 48)">
            <path d="M-3 12v17m0-8-13 9m13-9 13 9" stroke="#958764" strokeWidth="2" />
            <path d="M-17 7a20 20 0 0 0 28 0L-3-5z" fill="#3c4540" stroke="#dec57f" strokeWidth="1.8" />
            <path d="M-3-4v14m0-1 12-11" stroke="#bce1da" strokeWidth="1.4" />
            <circle cx="-3" cy="10" r="2.5" fill="#d8c27b" />
            <path className="expedition-comms-wave" d="M13-3q10 12 0 24M19-9q16 18 0 36" fill="none" stroke="#79d6d0" strokeWidth="1.5" />
          </g>
          <g className="expedition-ops-console">
            <path d="m183 69 22-11 45 11-22 13z" fill="#242b24" stroke="#b8a171" />
            <path d="M189 68v17l17 8V76zM222 76v17l18-9V68z" fill="#181e1b" stroke="#877853" />
            <path d="m193 68 12-6 11 4-12 7zM224 69l12-6 10 3-12 7z" fill="#183638" stroke="#80c9c3" />
            <path d="m196 68 5-2m-1 5 6-3m21 1 5-2m-1 5 6-3" stroke="#9fe2d8" strokeWidth="1" />
            <circle className="expedition-mastery-light" cx="235" cy="80" r="2.2" fill="#edcc7e" />
          </g>
          {acceptedEvolutionTargets.includes("operations") ? <g className="expedition-evolution expedition-evolution--operations" aria-label="运营协作指挥设施已验收">
            <path d="m173 57 36-18 61 18-37 23z" fill="#171e1b" fillOpacity=".75" stroke="#e3c77d" strokeWidth="2" />
            <circle className="expedition-evolution__pulse" cx="226" cy="63" r="23" />
            <path className="expedition-evolution__signal" d="M242 46q16 16 0 32m6-39q23 23 0 46" fill="none" stroke="#83dcd5" strokeWidth="2" />
            <text x="178" y="105">协作节点</text>
          </g> : null}
        </g>

        <g className={`expedition-map__building expedition-map__building--hangar ${hasPersonalRecord ? "has-personal-record" : ""} ${selectedId === "hangar" ? "is-selected" : ""}`} transform="translate(373 326)">
          <ellipse className="expedition-map__selection" cx="128" cy="104" rx="169" ry="78" />
          <path d="m0 112 128-70 256 70-128 75z" fill="#2a3431" stroke="#9c916f" strokeOpacity=".9" />
          <path d="m0 112v22l128 75v-22zM256 187l128-75v22l-128 75z" fill="#1c2523" stroke="#5a6558" />
          <path d="m36 95 92-50 184 50-92 53z" fill="url(#hangar-roof)" stroke="#ddc78e" strokeWidth="1.5" />
          <path d="m36 95v62l92 52v-61zM220 148l92-53v62l-92 52z" fill="#3b4540" stroke="#899181" />
          <path d="m114 56 14-8 14 8v83l-14 8-14-8z" fill="#1c2524" stroke="#dcc27f" strokeWidth="2" />
          <path d="M121 63v70M135 63v70" stroke="#6fbac0" strokeWidth="2" />
          <path d="M49 91v47M62 84v54M85 71v54M269 83v52M289 94v49" stroke="#ead192" strokeOpacity=".62" strokeWidth="3" />
          <path d="M78 128 94 119l16 9M257 145l17-10 17 9" fill="none" stroke="#dfb864" strokeWidth="3" />
          <path d="M128 40V18M128 18h31M256 103l22-13 18 7" fill="none" stroke="#9eb8ac" strokeWidth="2" />
          <circle cx="161" cy="18" r="3" fill="#e8d28f" filter="url(#facility-glow)" />
          <path d="m112 159 16-9 16 9v15l-16 9-16-9z" fill="#102022" stroke="#67b9bd" strokeWidth="2" />
          <g className="expedition-hangar-robot" transform="translate(145 78) scale(1.25)" strokeLinejoin="round">
            <ellipse cx="42" cy="55" rx="49" ry="10" fill="#0d1211" fillOpacity=".72" />
            <path d="m3 36 32-18 58 17-33 20z" fill="#353a37" stroke="#d0b46f" strokeWidth="1.8" />
            <path d="M3 36v13l29 18V53zM60 55l33-20v14L64 69z" fill="#1a211f" stroke="#77827a" />
            <path d="m16 34 19-11 41 12-20 12z" fill="#222f2d" stroke="#9cb8a9" />
            <path d="M20 50v13m50-8v14" stroke="#121716" strokeWidth="7" />
            <g transform="translate(20 55)" className="expedition-hangar-robot__wheel" fill="#18201f" stroke="#88c9c3" strokeWidth="1.6">
              <ellipse rx="5" ry="8" /><g className="expedition-hangar-robot__wheel-spokes"><path d="M-4-3h8m-8 6h8" /></g>
            </g>
            <g transform="translate(71 62)" className="expedition-hangar-robot__wheel" fill="#18201f" stroke="#88c9c3" strokeWidth="1.6">
              <ellipse rx="5" ry="8" /><g className="expedition-hangar-robot__wheel-spokes"><path d="M-4-3h8m-8 6h8" /></g>
            </g>
            <path d="m35 20 13-8 20 7-13 9z" fill="#d0ad68" stroke="#f0d895" />
            <path d="M40 20v-8l8-5 11 4v8" fill="#344642" stroke="#dec77f" strokeWidth="1.5" />
            <path d="M45 12V4l15-5 13 4v6" fill="#243331" stroke="#9ac8bd" strokeWidth="1.5" />
            <path d="M72 4 88-1l7 3-18 8" fill="none" stroke="#e7cb80" strokeWidth="3" />
            <circle cx="88" cy="0" r="2.4" fill="#83d9d2" />
            <path d="m44 34 13-7 14 5-14 8z" fill="#10282a" stroke="#70c7c5" />
            <circle className="expedition-mastery-light" cx="58" cy="34" r="3" fill="#edcc7e" />
            <path d="M29 44h6m20 8h7" stroke="#b8d8ca" strokeWidth="1.5" />
          </g>
        </g>

        {acceptedEvolutionTargets.includes("chassis") ? <g className="expedition-evolution expedition-evolution--mechanical" transform="translate(-102 -108) scale(1.2)" aria-label="底盘组件已验收">
          <path d="m453 524 47-26 67 27-49 29z" fill="#18201d" stroke="#e0bd70" strokeWidth="2" />
          <path d="m466 524 34-18 52 20-35 20z" fill="#344039" stroke="#a9b392" strokeWidth="1.5" />
          <path d="M475 540v13m62-23v13M482 548l-8 8m70-23 9 8" stroke="#d7b66c" strokeWidth="3" />
          <circle cx="481" cy="558" r="5" fill="#101716" stroke="#83ccc4" strokeWidth="2" /><circle cx="538" cy="538" r="5" fill="#101716" stroke="#83ccc4" strokeWidth="2" />
          <text x="461" y="579">底盘阶段</text>
        </g> : null}
        {acceptedEvolutionTargets.includes("control") ? <g className="expedition-evolution expedition-evolution--controls" transform="translate(-84 -67.5) scale(1.15)" aria-label="控制系统已验收">
          <path d="m539 436 20-12 24 12v21l-22 13-22-13z" fill="#0a1c1c" stroke="#74d6d2" strokeWidth="2" />
          <path d="m548 442 11-6 14 7-13 8z" fill="#25606a" stroke="#9becdf" />
          <path d="M552 456v7m12-10v9m10-12v8" stroke="#89e7de" strokeWidth="2" />
          <circle className="expedition-evolution__pulse" cx="561" cy="447" r="23" />
          <text x="540" y="484">控制系统</text>
        </g> : null}
        {acceptedEvolutionTargets.includes("perception") ? <g className="expedition-evolution expedition-evolution--vision" transform="translate(-91.8 -71.5) scale(1.18)" aria-label="感知系统已验收">
          <path d="M498 409v-22l10-8 12 7v23" fill="#253840" stroke="#8ad4e0" strokeWidth="2" />
          <path d="m503 389 6-5 7 4v7l-7 4-6-4z" fill="#101b23" stroke="#d3e8da" />
          <circle cx="510" cy="393" r="2.5" fill="#7ee7ef" />
          <path className="expedition-evolution__scan" d="M510 393q28-18 44 5M510 393q-20-17-33-1" fill="none" stroke="#8de6ef" strokeWidth="1.6" />
          <text x="489" y="421">感知系统</text>
        </g> : null}
        {acceptedEvolutionTargets.includes("decision") ? <g className="expedition-evolution expedition-evolution--ai" transform="translate(-91 -74.1) scale(1.15)" aria-label="决策模块已验收">
          <path d="m588 484 19-11 22 11v18l-21 12-20-11z" fill="#252337" stroke="#b5a9ef" strokeWidth="2" />
          <path d="m596 484 11-6 13 7-12 7z" fill="#344e67" stroke="#93e1ea" />
          <path d="M600 497h16m-14 4h12m-10 4h8" stroke="#a4e5eb" strokeWidth="1.6" />
          <circle cx="608" cy="492" r="15" fill="none" stroke="#a9a1e3" strokeOpacity=".65" />
          <text x="585" y="526">决策模块</text>
        </g> : null}
        {hasAcceptedJoint ? <g className="expedition-evolution expedition-evolution--joint" aria-label="联合成果已验收">
          <circle cx="536" cy="446" r="38" fill="none" stroke="#efce7c" strokeWidth="2" />
          <circle className="expedition-evolution__halo" cx="536" cy="446" r="49" fill="none" stroke="#8be3dc" strokeWidth="1.5" />
          <path d="m536 401 6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="#efd087" fillOpacity=".92" />
        </g> : null}
        <g className="expedition-map__lights"><circle cx="333" cy="315" r="3" /><circle cx="669" cy="306" r="3" /><circle cx="306" cy="510" r="3" /><circle cx="696" cy="510" r="3" /><circle cx="500" cy="574" r="3" /></g>
        <path d="M466 427h68M500 393v68" stroke="#e0c98d" strokeOpacity=".5" strokeWidth="1" />
      </svg>

      <span className="expedition-map__focus-field" aria-hidden="true" style={{ left: `${selectedFacility.x}%`, top: `${selectedFacility.y}%` }} />

      <div className="expedition-map__pins" style={{ transformOrigin: `${selectedFacility.x}% ${selectedFacility.y}%` }}>
        {FACILITIES.map((facility) => (
          <button
            className={`expedition-map__pin ${selectedId === facility.id ? "is-selected" : ""}`}
            key={facility.id}
            data-facility={facility.id}
            type="button"
            style={{ left: `${facility.x}%`, top: `${facility.y}%` }}
            onClick={() => onSelect(facility.id)}
            aria-pressed={selectedId === facility.id}
            aria-label={`探索${facility.name}`}
          >
            <span className="expedition-map__pin-ring"><span /></span>
            <span className="expedition-map__pin-label">{facility.name}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

function challengeStatusLabel(task: ExpeditionChallenge) {
  if (task.kind === "assignment") {
    if (task.status === "needs_redo") return "重新提交";
    if (task.status === "overdue") return "已逾期";
    return "待提交";
  }
  if (task.kind === "skill") return task.status === "practiced" ? "继续实践" : "可挑战";
  if (task.kind === "question") return "待跟进";
  return "本周";
}

function taskGlyph(kind: ExpeditionChallenge["kind"]) {
  if (kind === "assignment") return "A";
  if (kind === "skill") return "S";
  if (kind === "question") return "Q";
  return "R";
}

function formatDueDate(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" }).format(parsed);
}

function eventHref(event: GrowthEvent) {
  return event.href?.startsWith("/dashboard/") && !event.href.startsWith("//") ? event.href : undefined;
}

function facilityGroupProgress(facility: FacilityInfo, groups: readonly SkillGroupProgress[]) {
  if (!facility.groupName) return null;
  return groups.find((group) => group.name === facility.groupName) ?? null;
}

export default function ExpeditionRoute() {
  const { currentUser, groupResolution, groupResolutionError } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupNames = groupResolution?.groups.map((group) => group.name) ?? [];
  const groupKey = groupNames.join("|");
  const technicalMember = hasTechnicalGroupAccess(groupResolution?.groups);
  const skillMember = hasSkillGroupAccess(groupResolution?.groups);
  const canReadBase = skillMember || currentUser.role.name === "super_admin";
  const [selectedId, setSelectedId] = useState<ExpeditionFacilityId>(() => getPrimaryFacilityId(groupNames));
  const [detailMode, setDetailMode] = useState<"closed" | "collapsed" | "expanded">("closed");
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<ExpeditionData>(EMPTY_DATA);
  const requestId = useRef(0);

  useEffect(() => {
    setSelectedId(getPrimaryFacilityId(groupNames));
    setDetailMode("closed");
  }, [groupKey]);

  useEffect(() => {
    if (detailMode === "closed") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailMode("closed");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailMode]);

  useEffect(() => {
    const activeRequest = ++requestId.current;
    const questionGroups = groupResolution?.groups.filter((group) => ["机械组", "电控组", "视觉组", "AI组"].includes(group.name)) ?? [];
    setData({ ...EMPTY_DATA, loading: true });

    const profileRequest = getGrowthProfile().then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true }));
    const skillsRequest = skillMember
      ? skillsClient.listMine().then((value) => ({ value: value.groups, error: false })).catch(() => ({ value: [] as SkillGroupProgress[], error: true }))
      : Promise.resolve({ value: [] as SkillGroupProgress[], error: false });
    const assignmentsRequest = technicalMember
      ? assignmentClient.listMine().then((value) => ({ value, error: false })).catch(() => ({ value: [] as Assignment[], error: true }))
      : Promise.resolve({ value: [] as Assignment[], error: false });
    const questionsRequest = technicalMember
      ? Promise.all(questionGroups.map((group) => trainingQuestionClient.listMember({ groupId: group.groupId, mineOnly: true, status: "open" })))
        .then((values) => ({ value: values.flat(), error: false }))
        .catch(() => ({ value: [] as TrainingQuestion[], error: true }))
      : Promise.resolve({ value: [] as TrainingQuestion[], error: false });
    const faqsRequest = technicalMember
      ? Promise.all(questionGroups.map((group) => trainingQuestionClient.listMember({ groupId: group.groupId, faqOnly: true })))
        .then((values) => ({ value: values.flat(), error: false }))
        .catch(() => ({ value: [] as TrainingQuestion[], error: true }))
      : Promise.resolve({ value: [] as TrainingQuestion[], error: false });
    const projectsRequest = expeditionProjectClient.listMine().then((value) => ({ value, error: false })).catch(() => ({ value: [] as ExpeditionProject[], error: true }));

    void Promise.all([profileRequest, skillsRequest, assignmentsRequest, questionsRequest, faqsRequest, projectsRequest]).then(([profile, skills, assignments, questions, faqs, projects]) => {
      if (requestId.current !== activeRequest) return;
      setData({
        profile: profile.value,
        skills: skills.value,
        assignments: assignments.value,
        questions: questions.value,
        faqs: faqs.value,
        projects: projects.value,
        loading: false,
        errors: { profile: profile.error, skills: skills.error, assignments: assignments.error, questions: questions.error, faqs: faqs.error, projects: projects.error },
      });
    });

    return () => { requestId.current++; };
  }, [currentUser.id, groupKey, refreshKey, skillMember, technicalMember]);

  const requestedProjectId = Number(searchParams.get("projectId")) || 0;
  const assemblyProject = data.projects.find((project) => project.id === requestedProjectId) ?? data.projects[0] ?? null;
  useEffect(() => {
    if (data.loading) return;
    const nextProjectId = assemblyProject?.id;
    if (nextProjectId === requestedProjectId) return;
    const next = new URLSearchParams(searchParams);
    if (nextProjectId) next.set("projectId", String(nextProjectId));
    else next.delete("projectId");
    setSearchParams(next, { replace: true });
  }, [assemblyProject, data.loading, requestedProjectId, searchParams, setSearchParams]);

  const selectAssemblyProject = (projectId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("projectId", projectId);
    setSearchParams(next);
  };

  const exploreFacility = (facilityId: ExpeditionFacilityId) => {
    setSelectedId(facilityId);
    setDetailMode("expanded");
  };

  const selectedFacility = FACILITIES.find((facility) => facility.id === selectedId) ?? FACILITIES[0];
  const isMemberOfSelectedGroup = selectedFacility.groupName === null || groupNames.includes(selectedFacility.groupName);
  const activeSkillGroup = facilityGroupProgress(selectedFacility, data.skills);
  const selectedNodes = activeSkillGroup?.nodes ?? [];
  const masteredCount = selectedNodes.filter((node) => node.state === "mastered").length;
  const practicedCount = selectedNodes.filter((node) => node.state === "practiced").length;
  const availableCount = selectedNodes.filter((node) => node.state === "available").length;
  const lockedCount = selectedNodes.filter((node) => node.state === "locked").length;
  const masteredNodes = selectedNodes.filter((node) => node.state === "mastered");
  const masteredFacilityIds = data.skills
    .filter((group) => group.nodes.some((node) => node.state === "mastered"))
    .map((group) => FACILITIES.find((facility) => facility.groupName === group.name)?.id)
    .filter((id): id is ExpeditionFacilityId => Boolean(id));
  const challenges = useMemo(() => buildExpeditionChallenges({
    assignments: data.assignments,
    skillGroups: data.skills,
    questions: data.questions,
    profile: data.profile,
    groupNames,
  }), [data.assignments, data.profile, data.questions, data.skills, groupKey]);
  const selectedChallenges = selectedFacility.groupName
    ? challenges.filter((challenge) => challenge.groupName === selectedFacility.groupName)
    : [];
  const selectedFAQs = getPublicFacilityFAQs(data.faqs, selectedFacility.groupName);
  const selectedProjects = data.projects.filter((project) => selectedFacility.groupName ? project.participantGroups.includes(selectedFacility.groupName) : true).slice(0, 3);
  const { acceptedTargets: acceptedEvolutionTargets, hasAcceptedJoint } = getExpeditionEvolution(assemblyProject);
  const acceptedEvolutionLabels = acceptedEvolutionTargets.map(expeditionEvolutionTargetLabel);
  const acceptedMilestones = getAcceptedExpeditionMilestones(data.projects).slice(0, 4);
  const recentEvents = [...(data.profile?.events ?? [])].reverse().slice(0, 4);
  const availableLinks = selectedFacility.id === "hangar"
    ? [{ label: "个人成长", href: "/dashboard/growth" }, { label: "赛季协作", href: "/dashboard/expedition/projects" }]
    : selectedFacility.groupName === "运营组" && isMemberOfSelectedGroup
      ? [
          { label: "技能路线", href: "/dashboard/skills" },
          { label: "工作周报", href: "/dashboard/weekly-reports" },
          { label: "个人成长", href: "/dashboard/growth" },
          { label: "赛季协作", href: "/dashboard/expedition/projects" },
        ]
      : selectedFacility.groupName && isMemberOfSelectedGroup
        ? [
            { label: "技能路线", href: "/dashboard/skills" },
            { label: "训练作业", href: "/dashboard/assignments" },
            { label: "提问答疑", href: "/dashboard/questions" },
            { label: "个人成长", href: "/dashboard/growth" },
            { label: "赛季协作", href: "/dashboard/expedition/projects" },
          ]
        : [];

  if (!canReadBase) {
    return (
      <section className="expedition-page admin-design" aria-labelledby="expedition-title">
        <header className="expedition-heading expedition-heading--brand"><div><h1 id="expedition-title">TARS BASE</h1><span>赛季远征</span></div></header>
        <div className="expedition-access-state" role="status">
          <span className="expedition-access-state__mark" aria-hidden="true">⌁</span>
          <h2>{groupResolutionError ? "基地权限暂不可确认" : "基地尚未开放"}</h2>
          <p>{groupResolutionError ? "稍后重新进入工作台查看。" : "确认加入技术组或运营组后，即可进入对应区域。"}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="expedition-page admin-design" aria-labelledby="expedition-title">
      <header className="expedition-heading">
        <div>
          <p className="expedition-heading__kicker">SEASON EXPEDITION <span>·</span> 赛季远征</p>
          <h1 id="expedition-title">TARS BASE</h1>
          <div className="expedition-heading__identity">
            <strong>{data.profile?.displayName ?? currentUser.nickname ?? currentUser.email}</strong>
            <span>{data.profile?.groups.join(" · ") || groupNames.join(" · ") || "基地成员"}</span>
          </div>
        </div>
        <div className="expedition-heading__signal" aria-label="当前探索区域">
          <span>当前区域</span>
          <strong><ZoneGlyph id={selectedFacility.id} />{selectedFacility.name}</strong>
        </div>
      </header>

      {groupResolutionError ? <div className="expedition-inline-error" role="status">组别暂时无法确认，业务入口将在权限恢复后显示。</div> : null}

      <section className="expedition-scene" aria-labelledby="expedition-map-title">
        <div className="expedition-scene__topline">
          <div><span>BASE MAP</span><h2 id="expedition-map-title">基地地图</h2></div>
          <button type="button" className="expedition-scene__overview" onClick={() => { setSelectedId("hangar"); setDetailMode("closed"); }} aria-label="返回基地总览">总览</button>
        </div>
        <ExpeditionMap selectedId={selectedId} onSelect={exploreFacility} masteredFacilityIds={masteredFacilityIds} hasPersonalRecord={Boolean(data.profile?.events.length)} acceptedEvolutionTargets={acceptedEvolutionTargets} hasAcceptedJoint={hasAcceptedJoint} detailsOpen={detailMode !== "closed"}>
          <div className="expedition-project-control">
            <label htmlFor="expedition-assembly-project"><span>总装项目</span><select id="expedition-assembly-project" value={assemblyProject ? String(assemblyProject.id) : ""} disabled={data.loading || data.errors.projects || data.projects.length === 0} onChange={(event) => selectAssemblyProject(event.target.value)}>
              {assemblyProject ? null : <option value="">{data.errors.projects ? "项目暂不可读取" : data.loading ? "正在读取项目…" : "当前没有可见项目"}</option>}
              {data.projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}
            </select></label>
            <span className="expedition-project-control__state" aria-live="polite">{data.loading ? "读取中" : data.errors.projects ? "项目暂不可读取" : !assemblyProject ? "尚无项目成果" : hasAcceptedJoint ? "联合验收完成" : acceptedEvolutionLabels.length ? `已验收：${acceptedEvolutionLabels.join("、")}` : "暂无装置验收"}</span>
          </div>
          {detailMode !== "closed" ? (
            <aside key={selectedFacility.id} className={`expedition-facility expedition-facility--${selectedFacility.x > 55 ? "left" : "right"}`} data-mode={detailMode} aria-labelledby="expedition-facility-title" aria-live="polite">
              <div className="expedition-facility__header">
                <div className={`expedition-facility__art expedition-facility__art--${selectedFacility.id}`} aria-hidden="true"><ZoneGlyph id={selectedFacility.id} /></div>
                <div className="expedition-facility__title"><p className="expedition-eyebrow">{selectedFacility.englishName}</p><h2 id="expedition-facility-title">{selectedFacility.name}</h2></div>
                <div className="expedition-facility__actions">
                  <button type="button" onClick={() => setDetailMode(detailMode === "expanded" ? "collapsed" : "expanded")} aria-controls="expedition-facility-details" aria-expanded={detailMode === "expanded"} aria-label={detailMode === "expanded" ? "收起设施详情" : "展开设施详情"}>{detailMode === "expanded" ? "收起" : "展开"}</button>
                  <button type="button" onClick={() => setDetailMode("closed")} aria-label="关闭设施详情">关闭</button>
                </div>
              </div>
              {detailMode === "collapsed" ? <p className="expedition-facility__peek">{selectedFacility.description}</p> : null}
              <div id="expedition-facility-details" className="expedition-facility__body" hidden={detailMode === "collapsed"}>
                <p className="expedition-facility__description">{selectedFacility.description}</p>
                {selectedFacility.groupName && !isMemberOfSelectedGroup ? (
                  <div className="expedition-facility__locked"><span aria-hidden="true">◈</span><div><strong>{selectedFacility.groupName}专属区域</strong><small>加入所属组别后可查看个人训练与成长。</small></div></div>
                ) : null}
                {selectedFacility.groupName && isMemberOfSelectedGroup ? (
                  <>
                    <div className="expedition-facility__focus"><span>本区入口</span><strong>{selectedFacility.focus}</strong></div>
                    {data.loading ? <p className="expedition-facility__quiet" role="status">正在读取个人成长状态…</p> : data.errors.skills ? <p className="expedition-facility__quiet">技能路线暂时无法读取。</p> : selectedNodes.length > 0 ? (
                      <div className="expedition-skill-state" aria-label={`${selectedFacility.groupName}技能状态`}>
                        <div><strong>{lockedCount}</strong><span>未解锁</span></div>
                        <div><strong>{availableCount}</strong><span>可挑战</span></div>
                        <div><strong>{practicedCount}</strong><span>已实践</span></div>
                        <div><strong>{masteredCount}</strong><span>已掌握</span></div>
                      </div>
                    ) : <p className="expedition-facility__quiet">该组技能路线尚未配置。</p>}
                    {masteredNodes.length > 0 ? <div className="expedition-mastered-list"><span>已确认技能</span><ul>{masteredNodes.slice(0, 3).map((node) => <li key={node.id}>{node.name}</li>)}</ul></div> : null}
                    {!data.loading && selectedChallenges.length > 0 ? <div className="expedition-facility__challenge"><span>本区待跟进</span><Link to={selectedChallenges[0].href}>{selectedChallenges[0].title}<small>{challengeStatusLabel(selectedChallenges[0])} <i aria-hidden="true">↗</i></small></Link></div> : null}
                    {isTechnicalGroupName(selectedFacility.groupName!) ? (
                      <div className="expedition-faqs" aria-label={`${selectedFacility.groupName}公开 FAQ`}>
                        <span>本组知识动态</span>
                        {data.loading ? <small>读取中</small> : data.errors.faqs ? <small>知识动态暂不可读取。</small> : selectedFAQs.length > 0 ? (
                          <ul>{selectedFAQs.map((question) => <li key={question.id}><Link to={`/dashboard/questions?groupId=${question.groupId}&questionId=${question.id}`}>{question.title}<small>{question.lastReplyAt ? formatQuestionDate(question.lastReplyAt) : formatQuestionDate(question.createdAt)}</small></Link></li>)}</ul>
                        ) : <small>暂无公开 FAQ。</small>}
                      </div>
                    ) : null}
                    <div className="expedition-facility__challenge expedition-facility__projects">
                      <span>相关协作项目</span>
                      {data.loading ? <small>读取中</small> : data.errors.projects ? <small>协作项目暂不可读取。</small> : selectedProjects.length ? <ul>{selectedProjects.map((project) => <li key={project.id}><Link to={`/dashboard/expedition/projects?projectId=${project.id}`}>{project.title}<small>{project.hasAcceptedJoint ? "联合验收完成" : `${project.milestones.filter((milestone) => milestone.state === "accepted").length} 个阶段已验收`} <i aria-hidden="true">↗</i></small></Link></li>)}</ul> : <small>暂无相关协作项目。</small>}
                    </div>
                  </>
                ) : null}
                {selectedFacility.id === "hangar" ? (
                  <>
                    <div className="expedition-hangar-note"><span>个人远征记录</span>{data.loading ? <strong>读取中</strong> : data.errors.profile ? <strong>暂不可读取</strong> : <strong>{data.profile?.events.length ?? 0} 条</strong>}</div>
                    <div className="expedition-facility__challenge expedition-facility__projects"><span>赛季协作</span>{data.loading ? <small>读取中</small> : data.errors.projects ? <small>协作项目暂不可读取。</small> : selectedProjects.length ? <ul>{selectedProjects.map((project) => <li key={project.id}><Link to={`/dashboard/expedition/projects?projectId=${project.id}`}>{project.title}<small>{project.hasAcceptedJoint ? "联合验收完成" : `${project.milestones.filter((milestone) => milestone.state === "accepted").length} 个阶段已验收`} <i aria-hidden="true">↗</i></small></Link></li>)}</ul> : <small>暂无协作项目。</small>}</div>
                  </>
                ) : null}
                {availableLinks.length > 0 ? <nav className="expedition-facility__links" aria-label={`${selectedFacility.name}业务入口`}>{availableLinks.map((link) => <Link key={link.href} to={link.href}>{link.label}<span aria-hidden="true">↗</span></Link>)}</nav> : null}
              </div>
            </aside>
          ) : null}
          <div className="expedition-map__legend" aria-label="技能状态"><span><i className="expedition-state-dot expedition-state-dot--locked" />未解锁</span><span><i className="expedition-state-dot expedition-state-dot--available" />可挑战</span><span><i className="expedition-state-dot expedition-state-dot--practice" />已实践</span><span><i className="expedition-state-dot expedition-state-dot--mastered" />已掌握</span></div>
        </ExpeditionMap>
      </section>

      <div className="expedition-lower-grid">
        <section className="expedition-panel expedition-challenges" aria-labelledby="expedition-challenges-title">
          <div className="expedition-panel__heading">
            <div><p className="expedition-eyebrow">PERSONAL OBJECTIVES</p><h2 id="expedition-challenges-title">我的下一项挑战</h2></div>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={data.loading} aria-label="刷新基地个人数据">{data.loading ? "读取中" : "刷新"}</button>
          </div>
          {data.loading ? <p className="expedition-empty" role="status">正在读取个人挑战…</p> : challenges.length > 0 ? (
            <ul className="expedition-challenge-list">
              {challenges.slice(0, 5).map((task) => (
                <li key={task.key}>
                  <Link to={task.href} className={`expedition-challenge expedition-challenge--${task.kind}`}>
                    <span className="expedition-challenge__glyph" aria-hidden="true">{taskGlyph(task.kind)}</span>
                    <span className="expedition-challenge__body"><strong>{task.title}</strong><small>{task.detail}{task.kind === "assignment" && task.status !== "needs_redo" && task.status !== "overdue" ? ` · 截止 ${formatDueDate(task.dueAt) || "待定"}` : ""}</small></span>
                    <span className="expedition-challenge__status">{challengeStatusLabel(task)}</span>
                    <span className="expedition-challenge__arrow" aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="expedition-empty"><span className="expedition-empty__mark" aria-hidden="true">⌁</span><strong>当前没有待处理挑战</strong>{technicalMember ? <Link to="/dashboard/assignments">查看训练作业 <span aria-hidden="true">↗</span></Link> : groupNames.includes("运营组") ? <Link to="/dashboard/weekly-reports">打开工作周报 <span aria-hidden="true">↗</span></Link> : null}</div>
          )}
          {(data.errors.assignments || data.errors.questions || data.errors.skills || data.errors.faqs || data.errors.projects) ? <p className="expedition-data-note" role="status">部分个人数据暂不可读取，刷新后可重试。</p> : null}
        </section>

        <section className="expedition-panel expedition-chronicle" aria-labelledby="expedition-chronicle-title">
          <div className="expedition-panel__heading"><div><p className="expedition-eyebrow">PRIVATE FIELD LOG</p><h2 id="expedition-chronicle-title">我的远征记录</h2></div><Link to="/dashboard/growth">完整档案 <span aria-hidden="true">↗</span></Link></div>
          {data.loading ? <p className="expedition-empty" role="status">正在读取个人记录…</p> : data.errors.profile ? <p className="expedition-empty">个人成长记录暂不可读取。</p> : recentEvents.length > 0 ? (
            <ol className="expedition-event-list">
              {recentEvents.map((event) => {
                const content = <><span className="expedition-event-list__dot" aria-hidden="true" /><span className="expedition-event-list__body"><small>{growthEventLabel(event.kind)} · {formatGrowthDate(event.occurredAt)}</small><strong>{event.title}</strong></span><span className="expedition-event-list__arrow" aria-hidden="true">{eventHref(event) ? "↗" : ""}</span></>;
                return <li key={event.key}>{eventHref(event) ? <Link to={eventHref(event)!}>{content}</Link> : <div>{content}</div>}</li>;
              })}
            </ol>
          ) : <div className="expedition-empty"><span className="expedition-empty__mark" aria-hidden="true">＋</span><strong>远征记录从真实行动开始</strong><small>{groupNames.includes("运营组") ? "保存工作周报后，会在个人成长档案中留下记录。" : "完成训练、技能确认或技术讨论后，记录会出现在这里。"}</small>{groupNames.includes("运营组") ? <Link to="/dashboard/weekly-reports">打开工作周报 <span aria-hidden="true">↗</span></Link> : technicalMember ? <Link to="/dashboard/assignments">查看训练作业 <span aria-hidden="true">↗</span></Link> : null}</div>}
        </section>
      </div>

      <section className="expedition-panel expedition-season-chronicle" aria-labelledby="expedition-season-title">
        <div className="expedition-panel__heading"><div><p className="expedition-eyebrow">SEASON CHRONICLE</p><h2 id="expedition-season-title">赛季编年史</h2></div><Link to="/dashboard/expedition/projects">全部协作项目 <span aria-hidden="true">↗</span></Link></div>
        {data.loading ? <p className="expedition-empty" role="status">正在读取赛季记录…</p> : data.errors.projects ? <p className="expedition-empty">赛季记录暂不可读取。</p> : acceptedMilestones.length ? <ol>{acceptedMilestones.map(({ project, milestone }) => <li key={`${project.id}:${milestone.id}`}><span className="expedition-season-chronicle__signal" /><Link to={`/dashboard/expedition/projects?projectId=${project.id}`}><small>{milestone.groupName || "联合验收"} · {formatQuestionDate(milestone.acceptedAt!)}</small><strong>{project.title} · {milestone.name}</strong><span>{milestone.criteria}</span></Link></li>)}</ol> : <p className="expedition-empty">真实验收完成后，重要成果会记录在这里。</p>}
      </section>

    </section>
  );
}
