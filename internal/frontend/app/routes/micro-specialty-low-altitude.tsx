import { useEffect, useState } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/micro-specialty-low-altitude";
import { Navbar } from "~/components/navbar";
import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  subscribeAuthStateChange,
  type AuthUser,
} from "~/lib/auth-client";
import {
  lowAltitudeCourses,
  lowAltitudeFaqs,
  lowAltitudePractices,
} from "~/lib/micro-specialty-content";

const title = "低空智能感知与控制微专业 | TARS-Go 吉甲大师";
const description =
  "了解低空智能感知与控制微专业的项目方向、课程模块、实践内容和报名方式。";

export function meta({}: Route.MetaArgs) {
  return [
    { title },
    { name: "description", content: description },
  ];
}

export default function LowAltitudeMicroSpecialty() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCachedCurrentUser());

  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeAuthStateChange((user) => {
      if (!disposed) setCurrentUser(user);
    });

    void getOptionalCurrentUser()
      .then((user) => {
        if (!disposed) setCurrentUser(user);
      })
      .catch(() => {
        if (!disposed) setCurrentUser(null);
      });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen overflow-hidden bg-[#0b1013] text-fg-primary">
      <Navbar currentUser={currentUser} />

      <main>
        <section className="relative isolate overflow-hidden border-b border-white/[0.08] bg-[#0b1013]">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -right-24 top-20 h-72 w-72 rounded-full bg-sky-400/15 blur-[100px] sm:h-[28rem] sm:w-[28rem]" />
            <div className="absolute -left-32 bottom-0 h-64 w-64 rounded-full bg-emerald-300/10 blur-[100px] sm:h-96 sm:w-96" />
            <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
          </div>

          <div className="mx-auto grid min-h-[680px] max-w-7xl items-center gap-12 px-5 pb-16 pt-32 sm:px-8 sm:pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)] lg:px-12 lg:pt-36">
            <div className="max-w-3xl">
              <Link to="/" className="mb-8 inline-flex min-h-10 items-center gap-2 text-sm text-white/60 transition hover:text-white">
                <span aria-hidden>←</span> 返回官网首页
              </Link>
              <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#dfbd7c] sm:text-sm">
                <span className="h-px w-8 bg-[#dfbd7c]/70" />
                MICRO SPECIALTY · LOW-ALTITUDE SYSTEMS
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.16] tracking-[-0.04em] text-white sm:text-5xl lg:text-[64px]">
                低空智能感知
                <span className="block text-[#dfbd7c]">与控制</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
                从环境感知、状态理解到运动控制，走进低空智能系统的完整技术链路，用项目实践把算法、硬件与真实任务连接起来。
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#d0ad69] px-6 py-3 text-sm font-semibold text-[#141813] transition hover:bg-[#e0c17e]">
                  前往现有报名入口 <span aria-hidden>↗</span>
                </Link>
                <a href="#curriculum" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/[0.06]">
                  查看课程安排
                </a>
              </div>
              <p className="mt-4 max-w-xl text-xs leading-6 text-white/45">
                报名入口沿用官网现有流程；报名表、账号及联系方式等信息仅在原流程中处理。
              </p>
            </div>

            <div aria-hidden className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center sm:max-w-[480px]">
              <div className="absolute inset-[8%] rounded-full border border-sky-200/15" />
              <div className="absolute inset-[20%] rounded-full border border-dashed border-sky-200/20" />
              <div className="absolute inset-[33%] rounded-full border border-emerald-200/25 bg-emerald-200/[0.03] shadow-[0_0_100px_rgba(110,231,183,.08)]" />
              <div className="absolute left-[16%] top-[23%] h-2.5 w-2.5 rounded-full bg-[#dfbd7c] shadow-[0_0_20px_#dfbd7c]" />
              <div className="absolute bottom-[20%] right-[17%] h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_20px_#bae6fd]" />
              <div className="relative flex h-36 w-36 flex-col items-center justify-center rounded-[2rem] border border-white/15 bg-[#10191d]/90 text-center shadow-[0_24px_100px_rgba(0,0,0,.45)] sm:h-44 sm:w-44">
                <svg className="mb-3 h-10 w-10 text-[#dfbd7c] sm:h-12 sm:w-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M24 8v10m0 12v10M8 24h10m12 0h10M15 15l7 7m4 4 7 7m0-18-7 7m-4 4-7 7" />
                  <circle cx="24" cy="24" r="7" />
                  <circle cx="24" cy="24" r="20" strokeOpacity=".35" />
                </svg>
                <span className="text-xs font-semibold tracking-[0.18em] text-white/75 sm:text-sm">SENSE · PLAN · CONTROL</span>
              </div>
              <span className="absolute left-[2%] top-1/2 max-w-24 -translate-y-1/2 text-right text-[10px] font-mono uppercase tracking-[0.16em] text-sky-100/55 sm:left-0 sm:text-xs">Perception</span>
              <span className="absolute right-[1%] top-[28%] max-w-24 text-left text-[10px] font-mono uppercase tracking-[0.16em] text-emerald-100/55 sm:right-0 sm:text-xs">Estimation</span>
              <span className="absolute bottom-[8%] right-[9%] max-w-24 text-left text-[10px] font-mono uppercase tracking-[0.16em] text-[#dfbd7c]/70 sm:bottom-[6%] sm:right-[12%] sm:text-xs">Control</span>
            </div>
          </div>
        </section>

        <section id="introduction" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
            <SectionLabel number="01" english="ABOUT THE PROGRAM" title="项目介绍" />
            <div>
              <h2 className="max-w-3xl text-2xl font-semibold leading-snug text-white sm:text-3xl">
                让低空智能从“看见环境”走向“理解并行动”
              </h2>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-white/65 sm:text-base sm:leading-8">
                微专业围绕低空智能设备在复杂环境中的自主作业需求，聚焦环境感知、状态估计、任务规划与运动控制。学习路径从系统基础出发，逐步进入关键技术和项目实践，帮助同学建立从传感器输入到控制执行的整体认识。
              </p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55 sm:text-base sm:leading-8">
                课程模块为方向介绍，具体开课安排、学时、先修要求及考核方式以当期正式通知为准。
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["理解低空系统", "掌握感知链路", "完成项目闭环"].map((item, index) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <span className="font-mono text-xs text-[#dfbd7c]">0{index + 1}</span>
                    <p className="mt-2 text-sm font-medium text-white/80">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="curriculum" className="scroll-mt-24 border-y border-white/[0.08] bg-white/[0.02] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <SectionLabel number="02" english="CURRICULUM" title="课程安排" />
            <div className="mb-8 mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="max-w-2xl text-2xl font-semibold leading-snug text-white sm:text-3xl">从系统基础到综合项目，逐步搭起技术闭环</h2>
              <p className="max-w-sm text-xs leading-6 text-white/50 sm:text-right">模块顺序用于介绍学习路径；具体课次和时间以当期教学安排为准。</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {lowAltitudeCourses.map((course) => (
                <article key={course.step} className="group min-w-0 rounded-2xl border border-white/10 bg-[#101619] p-5 transition hover:-translate-y-1 hover:border-[#dfbd7c]/40 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-3xl font-semibold text-[#dfbd7c]/75">{course.step}</span>
                    <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                  </div>
                  <h3 className="mt-6 break-words text-lg font-semibold leading-7 text-white">{course.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">{course.description}</p>
                  <p className="mt-5 border-t border-white/[0.08] pt-4 text-xs leading-5 text-emerald-100/70">学习重点 · {course.outcome}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="practice" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <SectionLabel number="03" english="PROJECT PRACTICE" title="实践内容" />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {lowAltitudePractices.map((practice, index) => (
                <article key={practice.title} className="relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#172124] to-[#101416] p-5 sm:p-6">
                  <span aria-hidden className="absolute -right-2 -top-8 font-mono text-8xl font-bold text-white/[0.035]">0{index + 1}</span>
                  <div className="relative">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfbd7c]/25 bg-[#dfbd7c]/10 font-mono text-xs text-[#dfbd7c]">0{index + 1}</span>
                    <h3 className="mt-5 text-lg font-semibold text-white">{practice.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-white/60">{practice.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-y border-white/[0.08] bg-white/[0.02] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
            <SectionLabel number="04" english="FAQ" title="常见问题" />
            <div className="divide-y divide-white/10 border-y border-white/10">
              {lowAltitudeFaqs.map((faq, index) => (
                <details key={faq.question} className="group py-5" open={index === 0}>
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium leading-6 text-white marker:content-none sm:text-base [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{faq.question}</span>
                    <span aria-hidden className="shrink-0 text-xl font-light text-[#dfbd7c] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-3xl pt-3 pr-8 text-sm leading-7 text-white/60">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="apply" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-3xl border border-[#dfbd7c]/20 bg-[radial-gradient(ellipse_at_top_right,rgba(208,173,105,.13),transparent_55%),#111719] p-6 sm:flex-row sm:items-center sm:p-10">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#dfbd7c]">NEXT STEP</p>
              <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">通过官网现有入口了解报名流程</h2>
              <p className="mt-3 text-sm leading-6 text-white/60">账号注册和报名信息继续由原有页面处理，本介绍页不会收集个人资料。</p>
            </div>
            <Link to="/register" className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#d0ad69] px-6 py-3 text-sm font-semibold text-[#141813] transition hover:bg-[#e0c17e] sm:w-auto">
              前往现有报名入口 <span aria-hidden>↗</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] px-5 py-7 text-xs text-white/45 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>吉林大学吉甲大师双创基地 · TARS-Go</span>
          <Link to="/" className="min-h-10 self-start py-3 transition hover:text-white sm:self-auto">返回官网首页</Link>
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({ number, english, title: sectionTitle }: { number: string; english: string; title: string }) {
  return (
    <div>
      <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#dfbd7c]">
        <span className="font-mono">{number}</span>
        <span className="h-px w-7 bg-[#dfbd7c]/50" />
        {english}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{sectionTitle}</h2>
    </div>
  );
}
