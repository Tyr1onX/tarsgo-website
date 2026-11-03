import { Link } from "react-router";
import { SalonShell, salonPanel } from "~/components/ai-salon-shared";
export function meta() {
  return [{ title: "基地项目 | TARSGO" }];
}
export default function Programs() {
  return (
    <SalonShell>
      <h1 className="mb-10 text-4xl font-semibold tracking-tight sm:text-5xl">
        基地项目
      </h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Link
          className={`${salonPanel} group flex min-h-64 flex-col justify-between gap-8 hover:border-accent-primary`}
          to="/micro-specialties/low-altitude-intelligent-sensing-control"
        >
          <div>
            <p className="mb-4 text-sm text-accent-primary">微专业</p>
            <h2 className="text-2xl font-semibold leading-snug">
              低空智能感知与控制微专业
            </h2>
            <p className="mt-5 leading-7 text-fg-muted">
              无人机原理、飞行控制与应用实践。
            </p>
          </div>
          <span className="text-sm text-accent-primary">了解项目 →</span>
        </Link>
        <Link
          className={`${salonPanel} group flex min-h-64 flex-col justify-between gap-8 hover:border-accent-primary`}
          to="/programs/ai-salon"
        >
          <div>
            <p className="mb-4 text-sm text-accent-primary">线下交流</p>
            <h2 className="text-2xl font-semibold">吉甲 AI 沙龙</h2>
            <p className="mt-5 leading-7 text-fg-muted">
              围绕 AI 技术与实践，分享想法，交流经验。
            </p>
          </div>
          <span className="text-sm text-accent-primary">查看活动 →</span>
        </Link>
      </div>
    </SalonShell>
  );
}
