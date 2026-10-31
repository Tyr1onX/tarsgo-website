import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { mergeFileUploadSelection } from "~/lib/file-upload-selection";

export type FileUploadStatus = "pending" | "uploading" | "uploaded" | "failed";

const statusLabels: Record<FileUploadStatus, string> = {
  pending: "待提交",
  uploading: "上传中",
  uploaded: "已上传",
  failed: "上传失败",
};

export function FileUploadField({
  label,
  id,
  files,
  onFilesChange,
  accept,
  multiple = false,
  variant = "dropzone",
  triggerLabel,
  hint,
  error,
  disabled = false,
  status = "pending",
  progress,
  validateSelection,
  onRetry,
  className = "",
}: {
  label: string;
  id?: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  variant?: "dropzone" | "compact";
  triggerLabel?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  status?: FileUploadStatus;
  progress?: number | null;
  validateSelection?: (nextFiles: File[], incomingFiles: File[]) => string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId().replaceAll(":", "");
  const helperId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const [selectionError, setSelectionError] = useState("");
  const [dragging, setDragging] = useState(false);
  const visibleError = selectionError || error || "";
  const retryUpload = onRetry ?? (() => inputRef.current?.form?.requestSubmit());
  const canRetry = Boolean(onRetry || inputRef.current?.form);

  function addFiles(incomingFiles: File[]) {
    if (incomingFiles.length === 0 || disabled) return;
    const selection = mergeFileUploadSelection(files, incomingFiles, multiple);
    if (selection.error) {
      setSelectionError(selection.error);
      return;
    }
    const nextFiles = selection.files;
    const validationError = validateSelection?.(nextFiles, incomingFiles) ?? null;
    if (validationError) {
      setSelectionError(validationError);
      return;
    }
    setSelectionError("");
    onFilesChange(nextFiles);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={`file-upload-field file-upload-field--${variant}${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""} ${className}`.trim()}
      role="group"
      aria-label={label}
      onDragEnter={variant === "dropzone" ? (event) => { event.preventDefault(); if (!disabled) setDragging(true); } : undefined}
      onDragOver={variant === "dropzone" ? (event) => { event.preventDefault(); if (!disabled) setDragging(true); } : undefined}
      onDragLeave={variant === "dropzone" ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      } : undefined}
      onDrop={variant === "dropzone" ? handleDrop : undefined}
    >
      <input
        id={id}
        ref={inputRef}
        className="file-upload-field__input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        tabIndex={-1}
        onChange={(event) => {
          addFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      <div
        className="file-upload-field__chooser"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button")) inputRef.current?.click();
        }}
      >
        {variant === "dropzone" ? (
          <span className="file-upload-field__upload-icon" aria-hidden="true"><UploadIcon /></span>
        ) : null}
        <div className="file-upload-field__chooser-copy">
          {variant === "dropzone" ? <strong>{files.length ? "继续添加文件" : triggerLabel ?? "选择文件"}</strong> : null}
          {hint ? <span id={helperId}>{hint}</span> : variant === "dropzone" ? <span>点击选择{multiple ? "或拖入文件" : "文件"}</span> : null}
        </div>
        <button
          type="button"
          className="file-upload-field__choose-button"
          disabled={disabled}
          aria-label={triggerLabel ? `${triggerLabel}：${label}` : `选择${label}`}
          aria-describedby={[hint ? helperId : "", visibleError ? errorId : ""].filter(Boolean).join(" ") || undefined}
          aria-invalid={visibleError ? true : undefined}
          onClick={() => inputRef.current?.click()}
        >
          {variant === "compact" ? triggerLabel ?? (files.length ? "重新选择" : "选择文件") : "浏览"}
        </button>
      </div>

      {files.length > 0 ? (
        <ul className="file-upload-field__list" aria-label={`${label}已选择文件`}>
          {files.map((file, index) => (
            <li className="file-upload-field__item" data-status={status} key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              <FilePreview file={file} />
              <span className="file-upload-field__name" title={file.name}>{file.name}</span>
              <span className="file-upload-field__size">{formatFileUploadSize(file.size)}</span>
              <span className={`file-upload-field__status file-upload-field__status--${status}`} aria-label={`状态：${statusLabels[status]}`}>
                {statusLabels[status]}
              </span>
              {status === "failed" && canRetry ? (
                <button type="button" className="file-upload-field__action" disabled={disabled} onClick={retryUpload}>重试</button>
              ) : null}
              {status !== "uploaded" ? (
                <button
                  type="button"
                  className="file-upload-field__action"
                  disabled={disabled || status === "uploading"}
                  aria-label={`移除${file.name}`}
                  onClick={() => { setSelectionError(""); onFilesChange(files.filter((_, fileIndex) => fileIndex !== index)); }}
                >
                  移除
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {status === "uploading" && progress != null ? (
        <div className="file-upload-field__progress" role="status" aria-label={`${label}上传进度 ${progress}%`}>
          <div><span>上传中</span><span>{progress}%</span></div>
          <progress max={100} value={progress} />
        </div>
      ) : null}
      {visibleError ? <p id={errorId} className="file-upload-field__error" role="alert">{visibleError}</p> : null}
    </div>
  );
}

function FilePreview({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(extension);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  if (previewUrl) return <img className="file-upload-field__preview" src={previewUrl} alt="" aria-hidden="true" />;
  const fileType = extension.slice(0, 4).toUpperCase() || "FILE";
  return <span className="file-upload-field__file-icon" aria-hidden="true"><DocumentIcon /><small>{fileType}</small></span>;
}

function formatFileUploadSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3"/></svg>;
}

function DocumentIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.75h7l5 5v11.5H6z"/><path d="M13 3.75v5h5M9 13h6m-6 3h6"/></svg>;
}
