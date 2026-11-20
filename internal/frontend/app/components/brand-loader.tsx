import { TARS_ROBOT_PATHS } from "./tarsgo-motion-marks";
import "./brand-loader.css";

type BrandLoaderProps = {
  label?: string;
  size?: "sm" | "md" | "inline";
};

export function BrandLoader({ label = "正在加载内容", size = "md" }: BrandLoaderProps) {
  return (
    <div className={`brand-loader brand-loader--${size}`} role="status" aria-label={label}>
      <span className="brand-loader__symbol" aria-hidden="true">
        <svg
          className="brand-loader__robot"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="18 6 84 94"
        >
          {TARS_ROBOT_PATHS.map((item, index) => (
            <path
              key={index}
              className={`brand-loader__pillar brand-loader__pillar--${item.pillar}`}
              d={item.d}
              fillRule="evenodd"
            />
          ))}
        </svg>
        {size !== "inline" ? (
          <span className="brand-loader__rail">
            <span className="brand-loader__rail-seg" />
            <span className="brand-loader__rail-seg" />
            <span className="brand-loader__rail-seg" />
          </span>
        ) : null}
      </span>
    </div>
  );
}
