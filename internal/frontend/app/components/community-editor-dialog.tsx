import { useEffect, useRef, type ReactNode } from "react";

export function CommunityEditorDialog({ labelledBy, onClose, children }: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialogRef} className="community-editor-dialog" aria-labelledby={labelledBy} onCancel={(event) => {
    event.preventDefault();
    onClose();
  }} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className="community-editor-dialog__panel">
      {children}
    </div>
  </dialog>;
}
