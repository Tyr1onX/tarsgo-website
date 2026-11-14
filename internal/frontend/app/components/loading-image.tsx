import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import "./loading-image.css";

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  frameClassName: string;
};

export function LoadingImage({
  frameClassName,
  src,
  onLoad,
  onError,
  ...imageProps
}: LoadingImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [result, setResult] = useState<{ src: string; status: "loaded" | "error" } | null>(null);
  const status = result && result.src === src ? result.status : "loading";

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && src) {
      setResult({ src, status: image.naturalWidth > 0 ? "loaded" : "error" });
    }
  }, [src]);

  return (
    <span className={`loading-image ${frameClassName}`} data-status={status}>
      <img
        {...imageProps}
        src={src}
        ref={imageRef}
        onLoad={(event) => {
          if (src) setResult({ src, status: "loaded" });
          onLoad?.(event);
        }}
        onError={(event) => {
          if (src) setResult({ src, status: "error" });
          onError?.(event);
        }}
      />
      {status === "error" ? (
        <span className="loading-image__feedback loading-image__error" role="status">图片加载失败</span>
      ) : null}
    </span>
  );
}