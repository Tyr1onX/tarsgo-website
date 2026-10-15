import { useRef, useState } from "react";
import {
  honorAwards,
  honorCategoryLabels,
  honorMaterials,
  type HonorAward,
  type HonorCategory,
  type HonorMaterial,
} from "~/lib/events-and-honors-data";
import "./events-and-honors-archive.css";

const featuredAwards = honorAwards.filter((award) => award.featured);
const archiveYears = [...new Set(honorAwards.map((award) => award.year))].sort((a, b) => b - a);
const yearsWithMaterials = [...new Set(honorMaterials.map((material) => material.year))].sort((a, b) => b - a);
const categoryOrder: HonorCategory[] = ["team", "robot", "project", "instructor"];

function getAwardsForYear(year: number) {
  return honorAwards.filter((award) => award.year === year);
}

function getMaterialsForYear(year: number) {
  return honorMaterials.filter((material) => material.year === year);
}

function getAwardForMaterial(material: HonorMaterial) {
  return material.awardId
    ? honorAwards.find((award) => award.id === material.awardId)
    : undefined;
}

function getCategoryClass(category: HonorCategory) {
  return "honors-category honors-category--" + category;
}

function ArchiveSources({ award }: { award: HonorAward }) {
  if (award.sources.length === 0) {
    return award.certificateIds.length > 0 ? (
      <span className="honors-source-list">
        <a href={"#certificates-" + award.year}>查看证书原件 <span aria-hidden="true">↓</span></a>
      </span>
    ) : null;
  }

  return (
    <span className="honors-source-list">
      {award.sources.map((source) => (
        <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
          {source.label} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </span>
  );
}

export function EventsAndHonorsArchive() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number | null>(null);
  const activeMaterial = selectedMaterialIndex === null ? null : honorMaterials[selectedMaterialIndex];
  const activeAward = activeMaterial ? getAwardForMaterial(activeMaterial) : undefined;
  const isPendingMaterial = activeMaterial?.relation === "pending";

  function openMaterial(material: HonorMaterial) {
    const index = honorMaterials.findIndex((candidate) => candidate.id === material.id);
    setSelectedMaterialIndex(index);
    dialogRef.current?.showModal();
  }

  function moveMaterial(direction: -1 | 1) {
    setSelectedMaterialIndex((current) => {
      if (current === null) return current;
      return (current + direction + honorMaterials.length) % honorMaterials.length;
    });
  }

  function scrollToCertificates(year: number) {
    document.getElementById("certificates-" + year)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <main className="events-archive">
      <section id="highlights" className="honors-section honors-featured">
        <div className="public-home-container">
          <div className="honors-section-heading">
            <h2>精选成果</h2>
          </div>
          <div className="honors-featured-list">
            {featuredAwards.map((award) => (
              <article className="honors-featured-item" key={award.id}>
                <div>
                  <span className={getCategoryClass(award.category)}>{honorCategoryLabels[award.category]}</span>
                  <p className="honors-featured-result">{award.result}</p>
                  <h3>{award.title}</h3>
                  <p className="honors-featured-event">{award.year} · {award.event}</p>
                </div>
                <ArchiveSources award={award} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="competition-records" className="honors-section honors-history">
        <div className="public-home-container">
          <div className="honors-section-heading">
            <h2>历年赛事</h2>
          </div>
          <div className="honors-year-timeline">
            {archiveYears.map((year) => {
              const yearAwards = getAwardsForYear(year);
              return (
                <section className="honors-year-row" key={year} aria-labelledby={"honors-year-" + year}>
                  <h3 id={"honors-year-" + year} className="honors-year-label">{year}</h3>
                  <div className="honors-year-content">
                    {categoryOrder.map((category) => {
                      const awards = yearAwards.filter((award) => award.category === category);
                      if (awards.length === 0) return null;
                      return (
                        <div className="honors-year-category" key={category}>
                          <h4>{honorCategoryLabels[category]}</h4>
                          <ul>
                            {awards.map((award) => (
                              <li key={award.id}>
                                <div className="honors-record-line">
                                  <strong>{award.result}</strong>
                                  <span>{award.title}</span>
                                  {award.certificateIds.length > 0 ? (
                                    <button type="button" onClick={() => scrollToCertificates(year)}>
                                      查看证书原件 <span aria-hidden="true">↓</span>
                                    </button>
                                  ) : null}
                                </div>
                                <p>{award.event}</p>
                                {award.sources.length > 0 ? <ArchiveSources award={award} /> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <section id="certificates" className="honors-section honors-certificates">
        <div className="public-home-container">
          <div className="honors-section-heading">
            <h2>荣誉证书</h2>
          </div>
          <nav className="honors-year-index" aria-label="跳转至证书年份">
            {yearsWithMaterials.map((year) => (
              <a key={year} href={"#certificates-" + year}>{year}</a>
            ))}
          </nav>
          <div className="honors-material-years">
            {yearsWithMaterials.map((year) => (
              <section className="honors-material-year" id={"certificates-" + year} key={year}>
                <div className="honors-material-year-heading">
                  <h3>{year}</h3>
                </div>
                <div className="honors-material-grid">
                  {getMaterialsForYear(year).map((material) => {
                    const award = getAwardForMaterial(material);
                    const relationLabel = material.relation === "duplicate"
                      ? "重复扫描"
                      : material.relation === "supporting"
                        ? "关联材料"
                        : material.relation === "pending"
                          ? "归属待核"
                          : "证书原件";
                    return (
                      <article className="honors-material" key={material.id}>
                        <button
                          className="honors-material-open"
                          type="button"
                          onClick={() => openMaterial(material)}
                          aria-haspopup="dialog"
                          aria-label={relationLabel + "：" + material.title + "，查看原图"}
                        >
                          <span className="honors-material-image">
                            <img src={material.src} alt="" loading="lazy" decoding="async" />
                          </span>
                          <span className="honors-material-meta">
                            <span className="honors-material-number">{material.id.replace("certificate-", "#")}</span>
                            <span className="honors-material-relation">{relationLabel}</span>
                          </span>
                          <strong>{material.title}</strong>
                          {award ? <span className="honors-material-result">{award.result}</span> : null}
                          {material.note ? <span className="honors-material-note">{material.note}</span> : null}
                          {material.sources?.map((source) => (
                            <span className="honors-material-note" key={source.href}>{source.label} ↗</span>
                          ))}
                          <span className="honors-view-original">查看原图 <span aria-hidden="true">↗</span></span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        className="honors-preview-dialog"
        aria-label="荣誉原始材料预览"
        onClose={() => setSelectedMaterialIndex(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveMaterial(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveMaterial(1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setSelectedMaterialIndex(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setSelectedMaterialIndex(honorMaterials.length - 1);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        {activeMaterial ? (
          <div className="honors-preview-content">
            <div className="honors-preview-heading">
              <div>
                <span>{activeMaterial.id.replace("certificate-", "原始材料 #")}</span>
                <h2>{activeMaterial.title}</h2>
                {activeAward ? <p>{activeAward.year} · {activeAward.event} · {activeAward.result}</p> : null}
                {isPendingMaterial ? <p className="honors-pending-message">归属待核：此材料暂不计入 TARSGO 的已确认成果。</p> : null}
                {activeMaterial.sources?.map((source) => (
                  <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label} ↗</a>
                ))}
              </div>
              <button type="button" className="honors-preview-close" onClick={() => dialogRef.current?.close()}>关闭</button>
            </div>
            <img className="honors-preview-image" src={activeMaterial.src} alt={activeMaterial.title + "原图"} />
            {activeMaterial.note ? <p className="honors-preview-note">{activeMaterial.note}</p> : null}
            <div className="honors-preview-controls">
              <button type="button" onClick={() => moveMaterial(-1)} aria-label="查看上一份原始材料">上一份</button>
              <span aria-live="polite">{String(selectedMaterialIndex! + 1).padStart(2, "0")} / {honorMaterials.length}</span>
              <button type="button" onClick={() => moveMaterial(1)} aria-label="查看下一份原始材料">下一份</button>
            </div>
          </div>
        ) : null}
      </dialog>
    </main>
  );
}
