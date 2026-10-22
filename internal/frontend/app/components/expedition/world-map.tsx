import { useEffect, useState } from "react";
import type { ExpeditionEvolutionTarget, ExpeditionFacilityId } from "~/lib/expedition-data";
import { FACILITIES } from "./facilities";

export function WorldMap({ onSelect, masteredFacilityIds, hasPersonalRecord, acceptedEvolutionTargets, hasAcceptedJoint }: { onSelect: (id: ExpeditionFacilityId) => void; masteredFacilityIds: readonly ExpeditionFacilityId[]; hasPersonalRecord: boolean; acceptedEvolutionTargets: readonly ExpeditionEvolutionTarget[]; hasAcceptedJoint: boolean }) {
  const stateClass = (id: ExpeditionFacilityId) => masteredFacilityIds.includes(id) ? "has-mastered" : "";
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const media = matchMedia("(max-width: 640px)"); const update = () => setMobile(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  const offsets: Record<ExpeditionFacilityId, [number, number]> = { mechanical: [-70, 20], controls: [-30, 180], vision: [10, 200], ai: [-20, 500], operations: [0, 540], hangar: [0, 300] };
  const placement = (id: ExpeditionFacilityId, x: number, y: number) => `translate(${x + (mobile ? offsets[id][0] : 0)} ${y + (mobile ? offsets[id][1] : 0)})`;
  const roads = mobile ? "M500 730 200 270M500 730 705 420M500 730 200 690M500 730 790 980M500 730 500 1205" : "M500 430 270 242M500 430 735 240M500 430 190 478M500 430 810 480M500 430 500 665";

  return (
    <div className="expedition-map" data-scene="overview" data-season-joint={hasAcceptedJoint}>
      <svg className="expedition-map__art" viewBox={mobile ? "0 50 1000 1350" : "0 30 1000 800"} role="group" aria-label="基地世界地图">
        <defs>
          <linearGradient id="base-platform" x1=".2" x2=".85" y1="0" y2="1"><stop offset="0" stopColor="#394643" /><stop offset=".42" stopColor="#202b29" /><stop offset="1" stopColor="#141c1b" /></linearGradient>
          <linearGradient id="hangar-roof" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#d2b478" /><stop offset=".48" stopColor="#8a7853" /><stop offset="1" stopColor="#3d4a45" /></linearGradient>
          <linearGradient id="blue-glass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4c9fac" stopOpacity=".88" /><stop offset="1" stopColor="#1e4a52" stopOpacity=".8" /></linearGradient>
          <radialGradient id="base-core"><stop stopColor="#d9c08a" stopOpacity=".26" /><stop offset="1" stopColor="#d9c08a" stopOpacity="0" /></radialGradient>
          <filter id="facility-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <pattern id="floor-grid" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="skewY(-28) scale(1 .74)"><path d="M42 0H0V42" fill="none" stroke="#8bb0a3" strokeOpacity=".08" strokeWidth="1" /></pattern>
        </defs>
        <ellipse cx="500" cy={mobile ? 720 : 413} rx="470" ry={mobile ? 630 : 350} fill="url(#base-core)" />
        <path d={mobile ? "M500 85 950 650 500 1340 50 650Z" : "M500 64 948 369 500 784 52 369Z"} fill="url(#base-platform)" stroke="#6d8078" strokeOpacity=".52" strokeWidth="2" />
        <path d={mobile ? "M500 120 920 655 500 1300 80 655Z" : "M500 87 920 374 500 760 80 374Z"} fill="url(#floor-grid)" stroke="#c6ac70" strokeOpacity=".34" strokeWidth="1.5" />
        <path d={mobile ? "M500 180 876 660 500 1240 124 660Z" : "M500 127 876 383 500 724 124 383Z"} fill="none" stroke="#83a49b" strokeOpacity=".22" strokeWidth="1" strokeDasharray="3 9" />
        <path d={mobile ? "M500 85v35M950 650h-30M500 1340v-40M50 650h30" : "M500 64v23M948 369h-28M500 784v-24M52 369h28"} stroke="#e0c98d" strokeOpacity=".72" strokeWidth="3" />
        <path className="expedition-map__road" d={roads} />
        <path className="expedition-map__road expedition-map__road--signal" d={roads} />
        <g className="expedition-map__road-node" visibility={mobile ? "hidden" : undefined}><circle cx="391" cy="339" r="5" /><circle cx="619" cy="334" r="5" /><circle cx="346" cy="408" r="5" /><circle cx="660" cy="405" r="5" /><circle cx="500" cy="538" r="5" /></g>
        <g visibility={mobile ? "hidden" : undefined} className="expedition-map__environment" fill="none" stroke="#91aaa1" strokeOpacity=".5">
          <path d="m99 374 22-15 22 15-22 15zM864 642l21-14 21 14-21 14zM822 225l17-11 17 11-17 12zM191 658l17-11 17 11-17 12z" />
          <path d="M121 370v-28M884 638v-33M839 220v-31M208 654v-29" />
          <circle cx="121" cy="337" r="3" fill="#d8b96e" /><circle cx="884" cy="603" r="3" fill="#6cc6cf" /><circle cx="839" cy="186" r="3" fill="#6cc6cf" /><circle cx="208" cy="621" r="3" fill="#d8b96e" />
        </g>

        <g className={`expedition-map__building expedition-map__building--mechanical ${stateClass("mechanical")}`} transform={placement("mechanical", 183, 176)}>
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

        <g className={`expedition-map__building expedition-map__building--controls ${stateClass("controls")}`} transform={placement("controls", 645, 165)}>
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

        <g className={`expedition-map__building expedition-map__building--vision ${stateClass("vision")}`} transform={placement("vision", 70, 404)}>
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

        <g className={`expedition-map__building expedition-map__building--ai ${stateClass("ai")}`} transform={placement("ai", 658, 405)}>
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

        <g className={`expedition-map__building expedition-map__building--operations ${stateClass("operations")}`} transform={placement("operations", 373, 594)}>
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

        <g className={`expedition-map__building expedition-map__building--hangar ${hasPersonalRecord ? "has-personal-record" : ""}`} transform={placement("hangar", 373, 326)}>
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

        <g transform={mobile ? "translate(0 300)" : undefined}>
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
        </g>
        {FACILITIES.map((facility) => <g key={facility.id} className="world-building-entry" data-facility={facility.id} transform={placement(facility.id, facility.x * 10, facility.y * 8.5)} role="button" tabIndex={0} aria-label={`进入${facility.name}`} onClick={() => onSelect(facility.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(facility.id); } }}>
          <rect className="world-building-entry__target" x="-100" y="-65" width="200" height="130" rx="12" />
          <circle className="world-building-entry__beacon" cy="-28" r="7" />
          <path d="M0-18v30" stroke="#d3bc81" strokeOpacity=".65" />
          <rect className="world-building-entry__label" x="-78" y="14" width="156" height="36" rx="7" />
          <text y="38" textAnchor="middle">{facility.name}</text>
        </g>)}
      </svg>
    </div>
  );
}
