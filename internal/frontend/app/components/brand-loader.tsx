import "./brand-loader.css";

type BrandLoaderProps = {
  label?: string;
  size?: "sm" | "md";
};

const robotSymbol = "/assets/images/Logo/tarsgo-logo-v5-light.svg#robot-TARS";

export function BrandLoader({ label = "正在加载内容", size = "md" }: BrandLoaderProps) {
  return (
    <div className={`brand-loader brand-loader--${size}`} role="status" aria-label={label}>
      <span className="brand-loader__symbol" aria-hidden="true">
        <svg className="brand-loader__robot brand-loader__robot--base" viewBox="10 0 104 104" focusable="false">
          <use href={robotSymbol} />
        </svg>
        <svg className="brand-loader__robot brand-loader__robot--shine" viewBox="10 0 104 104" focusable="false">
          <use href={robotSymbol} />
        </svg>
      </span>
    </div>
  );
}
