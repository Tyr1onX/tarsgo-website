import { Link } from "react-router";

import type { Route } from "./+types/micro-specialty-low-altitude";
import { Navbar } from "~/components/navbar";
import { PublicFooter } from "~/components/public-footer";
import {
  lowAltitudeCourseTerms,
  lowAltitudeFaqs,
  lowAltitudeLearningModes,
} from "~/lib/micro-specialty-content";

const title = "低空智能感知与控制微专业 | TARSGO";
const description =
  "了解吉林大学低空智能感知与控制微专业的一年四门课程、教学方式、真实课堂和招生信息。";

const photoGroups = [
  {
    title: "微专业宣讲会",
    photos: [
      { file: "DSC05745", alt: "宣讲会现场，主讲人面向同学介绍项目" },
      { file: "DSC05861", alt: "宣讲会现场，师生在实验室交流" },
      { file: "DSC05867", alt: "宣讲会现场，同学们围绕设备交流" },
      { file: "DSC06440", alt: "参与宣讲会的师生在实验室合影" },
    ],
  },
  {
    title: "首堂课现场",
    photos: [
      { file: "IMG_1042", alt: "首堂课上，老师面向同学讲解" },
      { file: "IMG_1043", alt: "首堂课现场，同学们在实验室学习" },
      { file: "IMG_1044", alt: "同学在桌前进行动手操作" },
      { file: "IMG_1046", alt: "同学在老师指导下进行实践" },
    ],
  },
] as const;

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
      <main className="public-route-content">
        <section className="border-b border-border-subtle">
          <div className="mx-auto grid max-w-7xl min-[1920px]:max-w-[min(80vw,120rem)] items-center gap-10 px-5 pb-16 pt-28 sm:px-8 sm:pt-32 lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)] lg:gap-14 lg:px-12 lg:pb-20">
            <div className="min-w-0">
              <Link to="/" className="mb-8 inline-flex min-h-10 items-center gap-2 text-sm text-fg-muted transition hover:text-fg-primary">
                <span aria-hidden>←</span> 返回官网首页
              </Link>
              <p className="mb-5 text-sm font-semibold tracking-[0.12em] text-accent-primary">
                吉林大学 · 微专业
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[1.18] tracking-tight text-fg-primary sm:text-5xl xl:text-[60px]">
                低空智能感知<span className="block text-accent-primary">与控制</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-fg-muted sm:text-lg">
                从认识无人机的结构和飞行原理开始，逐步学习控制、模拟操控和应用实践。
              </p>
              <div className="mt-8 grid grid-cols-3 gap-3 border-t border-border-subtle pt-6">
                <div>
                  <p className="text-lg font-semibold text-fg-primary sm:text-2xl">1 年</p>
                  <p className="mt-1 text-xs text-fg-muted sm:text-sm">2 个学期</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-fg-primary sm:text-2xl">4 门</p>
                  <p className="mt-1 text-xs text-fg-muted sm:text-sm">核心课程</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-fg-primary sm:text-2xl">理论 + 实践</p>
                  <p className="mt-1 text-xs text-fg-muted sm:text-sm">从认知到应用</p>
                </div>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#curriculum" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent-primary px-6 py-3 text-sm font-semibold text-fg-inverse transition hover:opacity-90">
                  查看四门课程
                </a>
                <a href="#moments" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border-subtle px-6 py-3 text-sm font-semibold text-fg-primary transition hover:bg-surface-light">
                  看看真实课堂
                </a>
              </div>
            </div>
            <div className="relative min-w-0 pb-6">
              <div className="relative aspect-[5/4] overflow-hidden rounded-2xl border border-border-subtle bg-surface-light">
                <img
                  src="/assets/images/MicroSpecialty/IMG_1043-1280.webp"
                  srcSet="/assets/images/MicroSpecialty/IMG_1043-640.webp 640w, /assets/images/MicroSpecialty/IMG_1043-1280.webp 1280w"
                  sizes="(min-width: 1024px) 42vw, calc(100vw - 2.5rem)"
                  alt="微专业首堂课，师生在实验室交流学习"
                  width="1280"
                  height="720"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-6 pb-5 pt-16 text-sm font-medium text-white">
                  首堂课 · 真实课堂记录
                </div>
              </div>
              <div className="absolute -bottom-1 right-4 w-[30%] max-w-44 rotate-3 overflow-hidden rounded-xl border-4 border-surface-primary bg-surface-light shadow-xl sm:right-8">
                <img
                  src="/assets/images/MicroSpecialty/IMG_1044-640.webp"
                  alt="首堂课上，同学进行动手实践"
                  width="640"
                  height="886"
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/4] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        <nav aria-label="微专业页面内容" className="micro-specialty-section-nav sticky top-[var(--site-nav-height)] z-30 overflow-x-auto border-b border-border-subtle bg-surface-primary/95 px-5 backdrop-blur sm:px-8 lg:px-12">
          <div className="mx-auto flex min-h-12 w-max max-w-7xl items-center gap-6 text-sm sm:gap-9">
            <a href="#curriculum" className="text-fg-muted transition hover:text-accent-primary">学什么</a>
            <a href="#learning" className="text-fg-muted transition hover:text-accent-primary">怎么学</a>
            <a href="#moments" className="text-fg-muted transition hover:text-accent-primary">课堂现场</a>
            <a href="#faq" className="text-fg-muted transition hover:text-accent-primary">报名与答疑</a>
          </div>
        </nav>

        <section id="curriculum" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl min-[1920px]:max-w-[min(80vw,120rem)]">
            <p className="text-xs font-semibold tracking-widest text-accent-primary">01 · 学什么</p>
            <h2 className="mt-3 text-2xl font-semibold text-fg-primary sm:text-3xl">四门课，从认识无人机到探索应用</h2>
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {lowAltitudeCourseTerms.map((term) => (
                <div key={term.semester} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-light p-5 sm:p-7">
                  <p className="text-sm font-semibold text-accent-primary">{term.semester}</p>
                  <h3 className="mt-2 text-xl font-semibold text-fg-primary">{term.focus}</h3>
                  <div className="mt-5 divide-y divide-border-subtle">
                    {term.courses.map((course) => (
                      <article key={course.step} className="flex min-w-0 gap-4 py-5 first:pt-0 last:pb-0">
                        <span className="shrink-0 font-mono text-sm text-accent-primary">{course.step}</span>
                        <div className="min-w-0">
                          <h4 className="text-base font-semibold text-fg-primary">{course.title}</h4>
                          <p className="mt-2 text-sm leading-6 text-fg-muted">{course.description}</p>
                          <p className="mt-2 text-sm font-medium text-accent-tertiary">{course.outcome}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="learning" className="scroll-mt-24 border-y border-border-subtle bg-surface-light px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl min-[1920px]:max-w-[min(80vw,120rem)]">
            <p className="text-xs font-semibold tracking-widest text-accent-primary">02 · 怎么学</p>
            <h2 className="mt-3 text-2xl font-semibold text-fg-primary sm:text-3xl">理论打基础，实践接触真实设备</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {lowAltitudeLearningModes.map((mode, index) => (
                <article key={mode.title} className="min-w-0 border-t-2 border-accent-primary/50 pt-5">
                  <p className="text-xs font-medium text-accent-primary">0{index + 1}</p>
                  <h3 className="mt-3 text-lg font-semibold text-fg-primary">{mode.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-fg-muted">{mode.description}</p>
                </article>
              ))}
            </div>
            <p className="mt-8 text-sm leading-6 text-fg-muted">
              线下实践时间会结合学生课表、设备、场地与安全条件协调，具体课次以学校通知为准。
            </p>
          </div>
        </section>

        <section id="moments" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-7xl min-[1920px]:max-w-[min(80vw,120rem)]">
            <p className="text-xs font-semibold tracking-widest text-accent-primary">03 · 课堂现场</p>
            <h2 className="mt-3 text-2xl font-semibold text-fg-primary sm:text-3xl">看看我们已经开展的活动</h2>
            <div className="mt-8 space-y-9">
              {photoGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="mb-4 text-lg font-semibold text-fg-primary">{group.title}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    {group.photos.map((photo) => (
                      <a
                        key={photo.file}
                        href={"/assets/images/MicroSpecialty/" + photo.file + "-1280.webp"}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={"查看照片：" + photo.alt}
                        className="block min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-surface-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary"
                      >
                        <img
                          src={"/assets/images/MicroSpecialty/" + photo.file + "-640.webp"}
                          srcSet={"/assets/images/MicroSpecialty/" + photo.file + "-640.webp 640w, /assets/images/MicroSpecialty/" + photo.file + "-1280.webp 1280w"}
                          sizes="(min-width: 1280px) 300px, (min-width: 1024px) 23vw, (min-width: 640px) 46vw, 45vw"
                          alt={photo.alt}
                          loading="lazy"
                          decoding="async"
                          width="640"
                          height="420"
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 border-t border-border-subtle bg-surface-light px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto grid max-w-7xl min-[1920px]:max-w-[min(80vw,120rem)] gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-xs font-semibold tracking-widest text-accent-primary">04 · 报名与答疑</p>
              <h2 className="mt-3 text-2xl font-semibold text-fg-primary sm:text-3xl">你可能还关心这些</h2>
            </div>
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {lowAltitudeFaqs.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 text-base font-medium leading-7 text-fg-primary marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{faq.question}</span>
                    <span aria-hidden className="shrink-0 text-xl font-light text-accent-primary transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="max-w-3xl pb-2 pr-8 pt-2 text-sm leading-7 text-fg-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
