import { useEffect, useRef, useState, type RefObject } from "react";
import { calculateCoverRect, createSandParticles, particleProgress, type SandParticle } from "~/lib/home-sand-reveal";

export type HomeImageTreatment = "original" | "sand";
export type SandRevealPhase = "idle" | "waiting" | "playing" | "settling" | "done" | "fallback";

type HomeSandRevealLayerProps = {
  imageRef: RefObject<HTMLImageElement | null>;
  mode: HomeImageTreatment;
  started: boolean;
  replayToken: number;
  staggerMs: number;
  onPhaseChange: (phase: SandRevealPhase) => void;
};

const SAMPLE_MAX_EDGE = 240;
const SAMPLE_MAX_HEIGHT = 180;
const REVEAL_DURATION_MS = 1_520;
const FRAME_INTERVAL_MS = 1000 / 30;
const SETTLE_CROSSFADE_MS = 260;

export function HomeSandRevealLayer({
  imageRef,
  mode,
  started,
  replayToken,
  staggerMs,
  onPhaseChange,
}: HomeSandRevealLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasPlayedRef = useRef(false);
  const lastReplayTokenRef = useRef(replayToken);
  const [motionReduced, setMotionReduced] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setMotionReduced(motionQuery.matches);
    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);
    return () => motionQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    const replayRequested = replayToken !== lastReplayTokenRef.current;
    if (replayRequested) {
      lastReplayTokenRef.current = replayToken;
      hasPlayedRef.current = false;
    }

    if (mode !== "sand") {
      if (hasPlayedRef.current) onPhaseChange("done");
      return;
    }
    if (!started) {
      onPhaseChange("idle");
      return;
    }
    if (motionReduced) {
      hasPlayedRef.current = true;
      onPhaseChange("done");
      return;
    }
    if (hasPlayedRef.current && !replayRequested) return;

    const image = imageRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!image || !canvas || !context) {
      hasPlayedRef.current = true;
      onPhaseChange("fallback");
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    let settleTimer = 0;
    let loadListener: (() => void) | null = null;
    let errorListener: (() => void) | null = null;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastFrameAt = 0;
    let frameCount = 0;
    let totalDrawMs = 0;
    let maxDrawMs = 0;
    let startedAt = 0;

    onPhaseChange("waiting");

    const finishWithFallback = () => {
      if (cancelled) return;
      hasPlayedRef.current = true;
      onPhaseChange("fallback");
    };

    const waitForImage = () => new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        if (loadListener) image.removeEventListener("load", loadListener);
        if (errorListener) image.removeEventListener("error", errorListener);
        resolve(loaded);
      };
      loadListener = () => finish(image.naturalWidth > 0);
      errorListener = () => finish(false);
      image.addEventListener("load", loadListener, { once: true });
      image.addEventListener("error", errorListener, { once: true });
      if (image.complete) finish(image.naturalWidth > 0);
    });

    const prepareAndPlay = async () => {
      const loaded = image.complete ? image.naturalWidth > 0 : await waitForImage();
      if (!loaded) {
        finishWithFallback();
        return;
      }
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch {
          if (image.naturalWidth <= 0) {
            finishWithFallback();
            return;
          }
        }
      }
      if (cancelled) return;
      if (motionQuery.matches) {
        hasPlayedRef.current = true;
        onPhaseChange("done");
        return;
      }

      const bounds = image.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        finishWithFallback();
        return;
      }
      const sampleScale = Math.min(1, SAMPLE_MAX_EDGE / bounds.width, SAMPLE_MAX_HEIGHT / bounds.height);
      const sampleWidth = Math.max(1, Math.round(bounds.width * sampleScale));
      const sampleHeight = Math.max(1, Math.round(bounds.height * sampleScale));
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = sampleWidth;
      sourceCanvas.height = sampleHeight;
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) {
        finishWithFallback();
        return;
      }

      const [objectPositionX, objectPositionY] = readObjectPosition(image);
      const coverRect = calculateCoverRect(
        image.naturalWidth,
        image.naturalHeight,
        sampleWidth,
        sampleHeight,
        objectPositionX,
        objectPositionY,
      );
      try {
        sourceContext.drawImage(image, coverRect.x, coverRect.y, coverRect.width, coverRect.height);
        const imageData = sourceContext.getImageData(0, 0, sampleWidth, sampleHeight);
        const particleLimit = Math.min(2_200, Math.max(800, Math.round((sampleWidth * sampleHeight) / 14)));
        const particles = createSandParticles(
          imageData.data,
          sampleWidth,
          sampleHeight,
          2025 + staggerMs * 17 + replayToken * 29,
          particleLimit,
        );
        if (particles.length === 0) {
          finishWithFallback();
          return;
        }

        const pixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(bounds.width * pixelRatio));
        canvas.height = Math.max(1, Math.round(bounds.height * pixelRatio));
        canvas.style.width = `${bounds.width}px`;
        canvas.style.height = `${bounds.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        canvas.dataset.particleCount = String(particles.length);
        canvas.dataset.staggerMs = String(staggerMs);
        hasPlayedRef.current = true;
        onPhaseChange("playing");
        startedAt = performance.now() + staggerMs;

        const drawFrame = (time: number) => {
          if (cancelled) return;
          if (motionQuery.matches) {
            context.clearRect(0, 0, bounds.width, bounds.height);
            hasPlayedRef.current = true;
            onPhaseChange("done");
            return;
          }
          if (time - lastFrameAt < FRAME_INTERVAL_MS && time < startedAt + REVEAL_DURATION_MS) {
            animationFrame = requestAnimationFrame(drawFrame);
            return;
          }
          lastFrameAt = time;
          const progress = Math.min(1, Math.max(0, (time - startedAt) / REVEAL_DURATION_MS));
          const drawStart = performance.now();
          context.clearRect(0, 0, bounds.width, bounds.height);
          drawParticles(context, particles, progress, bounds.width / sampleWidth, bounds.height / sampleHeight);
          const drawCost = performance.now() - drawStart;
          frameCount += 1;
          totalDrawMs += drawCost;
          maxDrawMs = Math.max(maxDrawMs, drawCost);

          if (progress < 1) {
            animationFrame = requestAnimationFrame(drawFrame);
            return;
          }

          canvas.dataset.renderFrames = String(frameCount);
          canvas.dataset.avgDrawMs = (totalDrawMs / frameCount).toFixed(2);
          canvas.dataset.maxDrawMs = maxDrawMs.toFixed(2);
          canvas.dataset.revealMs = String(Math.round(time - startedAt));
          onPhaseChange("settling");
          settleTimer = window.setTimeout(() => {
            context.clearRect(0, 0, bounds.width, bounds.height);
            onPhaseChange("done");
          }, SETTLE_CROSSFADE_MS);
        };

        animationFrame = requestAnimationFrame(drawFrame);
      } catch {
        finishWithFallback();
      }
    };

    void prepareAndPlay();
    const handleMotionChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      context.clearRect(0, 0, canvas.width, canvas.height);
      hasPlayedRef.current = true;
      onPhaseChange("done");
    };
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      if (loadListener) image.removeEventListener("load", loadListener);
      if (errorListener) image.removeEventListener("error", errorListener);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, [imageRef, mode, onPhaseChange, replayToken, staggerMs, started, motionReduced]);

  return <canvas ref={canvasRef} className="home-sand-reveal-canvas" aria-hidden="true" />;
}

function drawParticles(
  context: CanvasRenderingContext2D,
  particles: SandParticle[],
  progress: number,
  scaleX: number,
  scaleY: number,
) {
  for (const particle of particles) {
    const eased = particleProgress(progress, particle.delay);
    if (eased <= 0.01) continue;
    const x = (particle.startX + (particle.x - particle.startX) * eased) * scaleX;
    const y = (particle.startY + (particle.y - particle.startY) * eased) * scaleY;
    const size = particle.size * (0.45 + eased * 0.55) * Math.min(scaleX, scaleY);
    const width = Math.max(0.55, size * particle.aspect);
    const height = Math.max(0.55, size / particle.aspect);
    context.globalAlpha = Math.min(1, eased * 1.12);
    context.fillStyle = particle.color;

    if (particle.kind === 1) {
      context.beginPath();
      context.moveTo(x, y - height * 0.64);
      context.lineTo(x + width * 0.58, y - height * 0.12);
      context.lineTo(x + width * 0.16, y + height * 0.58);
      context.lineTo(x - width * 0.55, y + height * 0.08);
      context.closePath();
      context.fill();
    } else if (particle.kind === 2) {
      context.beginPath();
      context.moveTo(x - width * 0.5, y + height * 0.36);
      context.lineTo(x + width * 0.42, y - height * 0.5);
      context.lineTo(x + width * 0.58, y + height * 0.36);
      context.closePath();
      context.fill();
    } else {
      context.fillRect(x - width / 2, y - height / 2, width, height);
    }
  }
  context.globalAlpha = 1;
}

function readObjectPosition(image: HTMLImageElement) {
  const parts = window.getComputedStyle(image).objectPosition.trim().split(/\s+/);
  return [parsePosition(parts[0], 0.5), parsePosition(parts[1] ?? parts[0], 0.5)] as const;
}

function parsePosition(value: string, fallback: number) {
  if (!value) return fallback;
  if (value === "left" || value === "top") return 0;
  if (value === "right" || value === "bottom") return 1;
  if (value === "center") return 0.5;
  if (value.endsWith("%")) {
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? percent / 100 : fallback;
  }
  return fallback;
}
