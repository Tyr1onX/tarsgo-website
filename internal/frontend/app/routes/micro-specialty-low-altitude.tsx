import { Link } from "react-router";

import type { Route } from "./+types/micro-specialty-low-altitude";
import { Navbar } from "~/components/navbar";
import {
  lowAltitudeCourseTerms,
  lowAltitudeFaqs,
  lowAltitudePractices,
} from "~/lib/micro-specialty-content";

const title = "低空智能感知与控制微专业 | TARSGO 吉甲大师";
const description =
  "了解吉林大学低空智能感知与控制微专业的课程结构、无人机实践内容和常见问题。";

export function meta({}: Route.MetaArgs) {
  return [
    { title },
    { name: "description", content: description },
  ];
}

export default function LowAltitudeMicroSpecialty() {
  return (
    <div className="micro-specialty-page min-h-screen overflow-hidden bg-surface-primary text-fg-primary">
      <Navbar />

      <main>
        <section className="relative isolate overflow-hidden border-b border-border-subtle bg-surface-primary">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="micro-specialty-glow absolute -right-24 top-20 h-72 w-72 rounded-full bg-sky-400/15 blur-[100px] sm:h-[28rem] sm:w-[28rem]" />
            <div className="micro-specialty-glow absolute -left-32 bottom-0 h-64 w-64 rounded-full bg-emerald-300/10 blur-[100px] sm:h-96 sm:w-96" />
            <div className="micro-specialty-grid absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
          </div>

          <div className="mx-auto grid min-h-[680px] max-w-7xl items-center gap-12 px-5 pb-16 pt-32 sm:px-8 sm:pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)] lg:px-12 lg:pt-36">
            <div className="max-w-3xl">
              <Link to="/" className="mb-8 inline-flex min-h-10 items-center gap-2 text-sm text-fg-muted transition hover:text-fg-primary">
                <span aria-hidden>←</span> 返回官网首页
              </Link>
              <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-accent-primary sm:text-sm">
                <span className="h-px w-8 bg-accent-primary/70" />
                MICRO SPECIALTY · LOW-ALTITUDE SYSTEMS
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.16] tracking-[-0.04em] text-fg-primary sm:text-5xl lg:text-[64px]">
                低空智能感知
                <span className="block text-accent-primary">与控制</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-fg-muted sm:text-lg">
                从认识无人机结构与飞行原理开始，逐步学习飞行控制、操控训练和应用实践，了解无人机如何服务不同任务。
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href="#curriculum" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border-subtle px-6 py-3 text-sm font-semibold text-fg-primary transition hover:border-border-subtle hover:bg-surface-dark">
                  查看课程安排
                </a>
                <a href="#practice" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border-subtle px-6 py-3 text-sm font-semibold text-fg-primary transition hover:border-border-subtle hover:bg-surface-dark">
                  了解实践内容
                </a>
              </div>
              <p className="mt-4 max-w-xl text-xs leading-6 text-fg-dim">
                本页面仅用于介绍微专业项目，不提供报名、账号注册或招生管理功能。
              </p>
            </div>

            <div aria-hidden className="relative mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center sm:max-w-[480px]">
              <div className="absolute inset-[8%] rounded-full border border-sky-200/15" />
              <div className="absolute inset-[20%] rounded-full border border-dashed border-sky-200/20" />
              <div className="absolute inset-[33%] rounded-full border border-emerald-200/25 bg-emerald-200/[0.03] shadow-[0_0_100px_rgba(110,231,183,.08)]" />
              <div className="absolute left-[16%] top-[23%] h-2.5 w-2.5 rounded-full bg-accent-primary shadow-[0_0_20px_#dfbd7c]" />
              <div className="absolute bottom-[20%] right-[17%] h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_20px_#bae6fd]" />
              <div className="relative flex h-36 w-36 flex-col items-center justify-center rounded-[2rem] border border-border-subtle bg-surface-light text-center shadow-[0_24px_100px_rgba(0,0,0,.45)] sm:h-44 sm:w-44">
                <svg className="mb-3 h-10 w-10 text-accent-primary sm:h-12 sm:w-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M24 8v10m0 12v10M8 24h10m12 0h10M15 15l7 7m4 4 7 7m0-18-7 7m-4 4-7 7" />
                  <circle cx="24" cy="24" r="7" />
                  <circle cx="24" cy="24" r="20" strokeOpacity=".35" />
                </svg>
                <span className="text-xs font-semibold tracking-[0.18em] text-fg-primary sm:text-sm">LEARN · PRACTICE · APPLY</span>
              </div>
              <span className="absolute left-[2%] top-1/2 max-w-24 -translate-y-1/2 text-right text-[10px] font-mono uppercase tracking-[0.16em] text-fg-muted sm:left-0 sm:text-xs">Basics</span>
              <span className="absolute right-[1%] top-[28%] max-w-24 text-left text-[10px] font-mono uppercase tracking-[0.16em] text-fg-muted sm:right-0 sm:text-xs">Control</span>
              <span className="absolute bottom-[8%] right-[9%] max-w-24 text-left text-[10px] font-mono uppercase tracking-[0.16em] text-accent-primary sm:bottom-[6%] sm:right-[12%] sm:text-xs">Practice</span>
            </div>
          </div>
        </section>

        <nav aria-label="低空微专业页面内容" className="micro-specialty-section-nav sticky top-[var(--site-nav-height)] z-30 overflow-x-auto border-b border-border-subtle bg-surface-primary/95 px-5 backdrop-blur sm:px-8 lg:px-12">
          <div className="mx-auto flex min-h-12 w-max max-w-7xl items-center gap-6 text-sm sm:gap-8">
            <a className="text-fg-muted transition hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary" href="#introduction">项目介绍</a>
            <a className="text-fg-muted transition hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary" href="#curriculum">课程安排</a>
            <a className="text-fg-muted transition hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary" href="#practice">实践内容</a>
            <a className="text-fg-muted transition hover:text-accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary" href="#faq">常见问题</a>
          </div>
        </nav>

        <section id="introduction" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
            <SectionLabel number="01" english="ABOUT THE PROGRAM" title="项目介绍" />
            <div>
              <h2 className="max-w-3xl text-2xl font-semibold leading-snug text-fg-primary sm:text-3xl">
                从认识无人机，到理解控制并探索应用
              </h2>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-fg-muted sm:text-base sm:leading-8">
                吉林大学「低空智能感知与控制」微专业围绕无人机基础认知、飞行控制、操控训练和应用实践展开。课程从了解无人机结构和飞行原理开始，逐步进入操控方法与安全规范，再认识无人机在实际任务中的应用。
              </p>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-muted sm:text-base sm:leading-8">
                理论学习以线上为主，实践安排会结合学生课表、教学资源、设备、场地和安全条件协调。具体课次、时间、学时、学分及考核方式以学校正式通知为准。
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["认识无人机", "理解飞行控制", "探索应用实践"].map((item, index) => (
                  <div key={item} className="rounded-xl border border-border-subtle bg-surface-light p-4">
                    <span className="font-mono text-xs text-accent-primary">0{index + 1}</span>
                    <p className="mt-2 text-sm font-medium text-fg-primary">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="curriculum" className="scroll-mt-24 border-y border-border-subtle bg-surface-light px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <SectionLabel number="02" english="CURRICULUM" title="课程安排" />
            <div className="mb-8 mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="max-w-2xl text-2xl font-semibold leading-snug text-fg-primary sm:text-3xl">一年两学期，从基础认知到实践应用</h2>
              <p className="max-w-sm text-xs leading-6 text-fg-muted sm:text-right">以下课程名称和学期结构依据现有教学资料整理；具体安排以学校正式通知为准。</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {lowAltitudeCourseTerms.map((term) => (
                <section key={term.semester} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-light p-4 sm:p-6">
                  <div className="mb-5">
                    <p className="text-xs font-semibold tracking-[0.16em] text-accent-primary">{term.semester}</p>
                    <h3 className="mt-2 text-xl font-semibold text-fg-primary">{term.focus}</h3>
                    <p className="mt-2 text-sm leading-6 text-fg-muted">{term.description}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {term.courses.map((course) => (
                      <article key={course.step} className="group min-w-0 rounded-xl border border-border-subtle bg-surface-light p-5 transition hover:-translate-y-1 hover:border-accent-primary/40">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-2xl font-semibold text-accent-primary/75">{course.step}</span>
                          <span className="h-px flex-1 bg-gradient-to-r from-fg-muted/15 to-transparent" />
                        </div>
                        <h4 className="mt-5 break-words text-base font-semibold leading-7 text-fg-primary">{course.title}</h4>
                        <p className="mt-3 text-sm leading-6 text-fg-muted">{course.description}</p>
                        <p className="mt-5 border-t border-border-subtle pt-4 text-xs leading-5 text-accent-tertiary">学习重点 · {course.outcome}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section id="practice" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <SectionLabel number="03" english="PROJECT PRACTICE" title="实践内容" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {lowAltitudePractices.map((practice, index) => (
                <article key={practice.title} className="relative min-w-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface-light p-5 sm:p-6">
                  <span aria-hidden className="absolute -right-2 -top-8 font-mono text-8xl font-bold text-fg-primary/[0.035]">0{index + 1}</span>
                  <div className="relative">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-accent-primary/25 bg-accent-primary/10 font-mono text-xs text-accent-primary">0{index + 1}</span>
                    <h3 className="mt-5 text-lg font-semibold text-fg-primary">{practice.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-fg-muted">{practice.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-y border-border-subtle bg-surface-light px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.7fr_1.3fr] lg:gap-16">
            <SectionLabel number="04" english="FAQ" title="常见问题" />
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {lowAltitudeFaqs.map((faq, index) => (
                <details key={faq.question} className="group py-5" open={index === 0}>
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium leading-6 text-fg-primary marker:content-none sm:text-base [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{faq.question}</span>
                    <span aria-hidden className="shrink-0 text-xl font-light text-accent-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-3xl pt-3 pr-8 text-sm leading-7 text-fg-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-border-subtle px-5 py-7 text-xs text-fg-dim sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>吉林大学吉甲大师双创基地 · TARSGO</span>
          <Link to="/" className="min-h-10 self-start py-3 transition hover:text-fg-primary sm:self-auto">返回官网首页</Link>
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({ number, english, title: sectionTitle }: { number: string; english: string; title: string }) {
  return (
    <div>
      <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-primary">
        <span className="font-mono">{number}</span>
        <span className="h-px w-7 bg-accent-primary/50" />
        {english}
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-fg-primary sm:text-3xl">{sectionTitle}</h2>
    </div>
  );
}
