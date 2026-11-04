import "./brand-loader.css";

type BrandLoaderProps = {
  label?: string;
  size?: "sm" | "md";
};

const robotImage = "/assets/images/Logo/tarsgo-robot-loading.svg";

export function BrandLoader({ label = "正在加载内容", size = "md" }: BrandLoaderProps) {
  return (
    <div className={`brand-loader brand-loader--${size}`} role="status" aria-label={label}>
      <span className="brand-loader__symbol" aria-hidden="true">
        <img className="brand-loader__robot brand-loader__robot--base" src={robotImage} alt="" />
        <img className="brand-loader__robot brand-loader__robot--shine" src={robotImage} alt="" />
      </span>
    </div>
  );
}
