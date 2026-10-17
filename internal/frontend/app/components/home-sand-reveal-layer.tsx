import { useEffect, useRef, useState, type RefObject } from "react";
import {
  calculateCoverRect,
  createSandParticles,
  particleFallAtProgress,
  particleLandingProgress,
  type SandParticle,
} from "~/lib/home-sand-reveal";

export type HomeImageTreatment = "original" | "sand";
export type SandRevealPhase = "idle" | "waiting" | "playing" | "settling" | "done" | "fallback";

type HomeSandRevealLayerProps = {
  imageRef: RefObject<HTMLImageElement | null>;
  mode: HomeImageTreatment;
  started: boolean;
  replayToken: number;
  staggerMs: number;
  frameOverride?: number;
  onPhaseChange: (phase: SandRevealPhase) => void;
};

const SAMPLE_MAX_EDGE = 320;
const SAMPLE_MAX_HEIGHT = 240;
const REVEAL_DURATION_MS = 2_800;
const FRAME_INTERVAL_MS = 1000 / 30;
const SETTLE_CROSSFADE_MS = 300;

export function HomeSandRevealLayer({
  imageRef,
  mode,
  started,
  replayToken,
  staggerMs,
  frameOverride,
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
    if (hasPlayedRef.current && !replayRequested && frameOverride === undefined) return;

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
    context.clearRect(0, 0, canvas.width, canvas.height);

    const finishWithFallback = () => {
      if (cancelled) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
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
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = sampleWidth;
      maskCanvas.height = sampleHeight;
      const maskContext = maskCanvas.getContext("2d");
      if (!sourceContext || !maskContext) {
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
        const particleLimit = Math.min(7_200, Math.max(3_200, Math.round((sampleWidth * sampleHeight) / 8)));
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
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        canvas.dataset.particleCount = String(particles.length);
        canvas.dataset.staggerMs = String(staggerMs);
        canvas.dataset.progress = "0";
        canvas.dataset.deposited = "0";
        canvas.dataset.inFlight = "0";

        const scaleX = bounds.width / sampleWidth;
        const scaleY = bounds.height / sampleHeight;
        const particlesByStart = [...particles].sort((left, right) => left.fallStart - right.fallStart);
        const particlesByLanding = [...particles].sort((left, right) => particleLandingProgress(left) - particleLandingProgress(right));

        const drawFrame = (progress: number, activeParticles: SandParticle[]) => {
          context.clearRect(0, 0, bounds.width, bounds.height);
          context.globalAlpha = 1;
          context.globalCompositeOperation = "source-over";
          context.drawImage(sourceCanvas, 0, 0, bounds.width, bounds.height);
          context.globalCompositeOperation = "destination-in";
          context.drawImage(maskCanvas, 0, 0, bounds.width, bounds.height);
          context.globalCompositeOperation = "source-over";

          let inFlightCount = 0;
          for (const particle of activeParticles) {
            const position = particleFallAtProgress(particle, progress);
            if (!position.visible) continue;
            inFlightCount += 1;
            drawFallingParticle(context, particle, position.x * scaleX, position.y * scaleY, position.fallProgress, scaleX, scaleY);
          }
          context.globalAlpha = 1;
          canvas.dataset.progress = progress.toFixed(4);
          canvas.dataset.revealPercent = String(Math.round(progress * 100));
          canvas.dataset.inFlight = String(inFlightCount);
          return inFlightCount;
        };

        const depositThrough = (progress: number, fromIndex = 0) => {
          let index = fromIndex;
          while (index < particlesByLanding.length && particleLandingProgress(particlesByLanding[index]) <= progress) {
            const particle = particlesByLanding[index];
            depositParticle(maskContext, particle);
            index += 1;
          }
          return index;
        };

        const drawStaticFrame = (progress: number) => {
          const deposited = depositThrough(progress);
          if (progress >= 1) {
            maskContext.fillStyle = "#fff";
            maskContext.fillRect(0, 0, sampleWidth, sampleHeight);
          }
          const activeParticles = particles.filter((particle) => {
            const landing = particleLandingProgress(particle);
            return particle.fallStart <= progress && landing > progress;
          });
          const drawStart = performance.now();
          const inFlight = drawFrame(progress, activeParticles);
          const drawCost = performance.now() - drawStart;
          canvas.dataset.deposited = String(progress >= 1 ? particles.length : deposited);
          recordFrameMetrics(canvas, 1, drawCost, drawCost);
          canvas.dataset.inFlight = String(inFlight);
          hasPlayedRef.current = true;
          if (progress >= 1) {
            onPhaseChange("settling");
            settleTimer = window.setTimeout(() => {
              context.clearRect(0, 0, bounds.width, bounds.height);
              onPhaseChange("done");
            }, SETTLE_CROSSFADE_MS);
          } else {
            onPhaseChange("playing");
          }
        };

        if (frameOverride !== undefined) {
          drawStaticFrame(clamp(frameOverride, 0, 1));
          return;
        }

        let startIndex = 0;
        let landingIndex = 0;
        const activeParticles: SandParticle[] = [];
        onPhaseChange("playing");
        startedAt = performance.now() + staggerMs;

        const animate = (time: number) => {
          if (cancelled) return;
          if (motionQuery.matches) {
            context.clearRect(0, 0, bounds.width, bounds.height);
            hasPlayedRef.current = true;
            onPhaseChange("done");
            return;
          }
          if (time - lastFrameAt < FRAME_INTERVAL_MS && time < startedAt + REVEAL_DURATION_MS) {
            animationFrame = requestAnimationFrame(animate);
            return;
          }
          lastFrameAt = time;
          const progress = clamp((time - startedAt) / REVEAL_DURATION_MS, 0, 1);
          const drawStart = performance.now();

          while (startIndex < particlesByStart.length && particlesByStart[startIndex].fallStart <= progress) {
            activeParticles.push(particlesByStart[startIndex]);
            startIndex += 1;
          }
          landingIndex = depositThrough(progress, landingIndex);
          compactActiveParticles(activeParticles, progress);
          if (progress >= 1) {
            maskContext.fillStyle = "#fff";
            maskContext.fillRect(0, 0, sampleWidth, sampleHeight);
          }

          drawFrame(progress, activeParticles);
          canvas.dataset.deposited = String(progress >= 1 ? particles.length : landingIndex);
          const drawCost = performance.now() - drawStart;
          frameCount += 1;
          totalDrawMs += drawCost;
          maxDrawMs = Math.max(maxDrawMs, drawCost);

          if (progress < 1) {
            animationFrame = requestAnimationFrame(animate);
            return;
          }

          recordFrameMetrics(canvas, frameCount, totalDrawMs / frameCount, maxDrawMs);
          canvas.dataset.revealMs = String(Math.round(time - startedAt));
          hasPlayedRef.current = true;
          onPhaseChange("settling");
          settleTimer = window.setTimeout(() => {
            context.clearRect(0, 0, bounds.width, bounds.height);
            onPhaseChange("done");
          }, SETTLE_CROSSFADE_MS);
        };

        animationFrame = requestAnimationFrame(animate);
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
  }, [frameOverride, imageRef, mode, onPhaseChange, replayToken, staggerMs, started, motionReduced]);

  return <canvas ref={canvasRef} className="home-sand-reveal-canvas" aria-hidden="true" />;
}

function compactActiveParticles(particles: SandParticle[], progress: number) {
  let writeIndex = 0;
  for (const particle of particles) {
    if (particleLandingProgress(particle) > progress) {
      particles[writeIndex] = particle;
      writeIndex += 1;
    }
  }
  particles.length = writeIndex;
}

function depositParticle(context: CanvasRenderingContext2D, particle: SandParticle) {
  context.fillStyle = "#fff";
  context.globalAlpha = 0.88;
  context.beginPath();
  context.ellipse(particle.x, particle.y, particle.depositRadius, particle.depositRadius * particle.aspect, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawFallingParticle(
  context: CanvasRenderingContext2D,
  particle: SandParticle,
  x: number,
  y: number,
  fallProgress: number,
  scaleX: number,
  scaleY: number,
) {
  const size = particle.size * Math.min(scaleX, scaleY);
  const stretch = 1 + (1 - fallProgress) * 0.42;
  const width = Math.max(0.55, size * particle.aspect * stretch);
  const height = Math.max(0.55, size / particle.aspect);
  context.globalAlpha = 0.9;
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
    context.ellipse(x, y, width * 0.42, height * 0.42, 0, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.ellipse(x, y, width * 0.5, height * 0.5, -0.2, 0, Math.PI * 2);
    context.fill();
  }
}

function recordFrameMetrics(canvas: HTMLCanvasElement, frames: number, averageDrawMs: number, maxDrawMs: number) {
  canvas.dataset.renderFrames = String(frames);
  canvas.dataset.avgDrawMs = averageDrawMs.toFixed(2);
  canvas.dataset.maxDrawMs = maxDrawMs.toFixed(2);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
