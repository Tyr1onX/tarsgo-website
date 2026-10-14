import { useEffect, useMemo, useRef, useState } from "react";
import { robotSeasons, type RobotCategory, type RobotSeasonEntry } from "~/data/robot-seasons";

const filters: readonly ({ value: "all"; label: string } | { value: RobotCategory; label: RobotCategory })[] = [
  { value: "all", label: "全部" },
  { value: "英雄", label: "英雄" },
  { value: "工程", label: "工程" },
  { value: "步兵", label: "步兵" },
  { value: "空中", label: "空中" },
  { value: "哨兵", label: "哨兵" },
  { value: "飞镖", label: "飞镖" },
  { value: "雷达", label: "雷达" },
];

function getImageSet(robot: RobotSeasonEntry, lightbox = false) {
  const image = robot.image;
  return lightbox
    ? `${image.medium} 1440w, ${image.large} 2400w`
    : `${image.thumbnail} 720w, ${image.medium} 1440w, ${image.large} 2400w`;
}

function getImageSizes(lightbox = false) {
  return lightbox ? "(max-width: 720px) 94vw, min(88vw, 960px)" : "(min-width: 1024px) 28vw, (min-width: 640px) 44vw, 94vw";
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="robot-gallery__arrow-icon">
      {direction === "left" ? <path d="m14.5 5-7 7 7 7" /> : <path d="m9.5 5 7 7-7 7" />}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="robot-gallery__close-icon">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function RobotPhotoGallery() {
  const [activeSeasonYear, setActiveSeasonYear] = useState(2026);
  const [activeCategory, setActiveCategory] = useState<"all" | RobotCategory>("all");
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeSeason = robotSeasons.find((season) => season.season === activeSeasonYear) ?? robotSeasons[0];
  const robots = activeSeason.robots;
  const visibleRobots = useMemo(
    () => activeCategory === "all"
      ? robots
      : robots.filter((robot) => robot.category === activeCategory),
    [activeCategory, robots],
  );
  const selectedRobotIndex = visibleRobots.findIndex((robot) => robot.id === selectedRobotId);
  const selectedRobot = selectedRobotIndex >= 0 ? visibleRobots[selectedRobotIndex] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selectedRobot && !dialog.open) {
      dialog.showModal();
    } else if (!selectedRobot && dialog.open) {
      dialog.close();
    }
  }, [selectedRobot]);

  function movePreview(direction: -1 | 1) {
    if (selectedRobotIndex < 0 || visibleRobots.length < 2) return;
    const nextIndex = (selectedRobotIndex + direction + visibleRobots.length) % visibleRobots.length;
    setSelectedRobotId(visibleRobots[nextIndex].id);
  }

  function closePreview() {
    dialogRef.current?.close();
  }

  function selectSeason(seasonYear: number) {
    if (seasonYear === activeSeasonYear) return;
    dialogRef.current?.close();
    setSelectedRobotId(null);
    setActiveCategory("all");
    setActiveSeasonYear(seasonYear);
  }

  return (
    <div className="robot-gallery" role="region" aria-label={`${activeSeason.season} 赛季机器人照片展厅`}>
      <div className="robot-gallery__season-heading">
        <div className="robot-gallery__season-copy">
          <p className="robot-gallery__season-kicker">ROBOT SEASON ARCHIVE · {activeSeason.season}</p>
          <h2>{activeSeason.title}</h2>
        </div>
        <div className="robot-gallery__season-switch" role="group" aria-label="选择机器人赛季">
          {robotSeasons.map((season) => (
            <button
              key={season.season}
              type="button"
              aria-pressed={activeSeasonYear === season.season}
              onClick={() => selectSeason(season.season)}
            >
              {season.season} 赛季
            </button>
          ))}
        </div>
      </div>

      <div className="robot-gallery__toolbar">
        <div className="robot-gallery__filters" role="group" aria-label="按机器人类别筛选">
          {filters.map((filter) => {
            const count = filter.value === "all"
              ? robots.length
              : robots.filter((robot) => robot.category === filter.value).length;
            const selected = activeCategory === filter.value;

            return (
              <button
                key={filter.value}
                type="button"
                className="robot-gallery__filter"
                aria-pressed={selected}
                onClick={() => setActiveCategory(filter.value)}
              >
                {filter.label}
                <span className="robot-gallery__filter-count" aria-hidden="true">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="robot-gallery__result-count" aria-live="polite">
          {activeCategory === "all" ? "全部影像" : `${activeCategory}类别`} · {visibleRobots.length} 张
        </p>
      </div>

      <div className="robot-gallery__grid">
        {visibleRobots.map((robot, index) => (
          <figure className="robot-gallery__card" key={robot.id}>
            <button
              className="robot-gallery__image-button"
              type="button"
              aria-label={`放大查看${robot.name}，${index + 1} / ${visibleRobots.length}`}
              onClick={() => setSelectedRobotId(robot.id)}
            >
              <img
                className="robot-gallery__image"
                src={robot.image.medium}
                srcSet={getImageSet(robot)}
                sizes={getImageSizes()}
                alt={`${robot.name}定妆照`}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
                width="1440"
                height="960"
              />
              <span className="robot-gallery__view-label" aria-hidden="true">查看照片</span>
            </button>
            <figcaption className="robot-gallery__caption">
              <span className="robot-gallery__number">{robot.number}</span>
              <div className="robot-gallery__caption-copy">
                <h2>{robot.name}</h2>
                <p>{robot.category}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="robot-gallery__dialog"
        aria-labelledby="robot-gallery-preview-title"
        onCancel={(event) => {
          event.preventDefault();
          closePreview();
        }}
        onClose={() => setSelectedRobotId(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            movePreview(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            movePreview(1);
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}
      >
        {selectedRobot ? (
          <div className="robot-gallery__dialog-content">
            <div className="robot-gallery__dialog-heading">
              <div>
                <p className="robot-gallery__dialog-kicker">{activeSeason.season} SEASON · {selectedRobot.category}</p>
                <h2 id="robot-gallery-preview-title">{selectedRobot.name}</h2>
              </div>
              <button
                className="robot-gallery__dialog-close"
                type="button"
                aria-label="关闭机器人照片预览"
                onClick={closePreview}
                autoFocus
              >
                <CloseIcon />
              </button>
            </div>

            <div className="robot-gallery__dialog-stage">
              <img
                key={selectedRobot.id}
                className="robot-gallery__dialog-image"
                src={selectedRobot.image.large}
                srcSet={getImageSet(selectedRobot, true)}
                sizes={getImageSizes(true)}
                alt={`${selectedRobot.name}定妆照`}
                decoding="async"
                fetchPriority="high"
                width="2400"
                height="1600"
              />
            </div>

            <div className="robot-gallery__dialog-controls">
              <button
                type="button"
                className="robot-gallery__dialog-nav"
                aria-label="查看上一张机器人照片（左方向键）"
                onClick={() => movePreview(-1)}
              >
                <ArrowIcon direction="left" />
                上一张
              </button>
              <p className="robot-gallery__dialog-position" aria-live="polite">
                {String(selectedRobotIndex + 1).padStart(2, "0")} / {String(visibleRobots.length).padStart(2, "0")}
              </p>
              <button
                type="button"
                className="robot-gallery__dialog-nav"
                aria-label="查看下一张机器人照片（右方向键）"
                onClick={() => movePreview(1)}
              >
                下一张
                <ArrowIcon direction="right" />
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
