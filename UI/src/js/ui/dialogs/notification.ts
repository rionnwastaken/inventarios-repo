import { ModalDialog, ModalDialogOptions } from "./modalDialog";

export interface AutoDismissDialogOptions extends ModalDialogOptions {
  duration?: number; // Duration in milliseconds (e.g. 3000 for 3s)
  pauseOnHover?: boolean;
}

export class NotiDialog extends ModalDialog {
  private timer: number | null = null;
  private duration: number;
  private pauseOnHover: boolean;

  constructor(options: AutoDismissDialogOptions = {}) {
    super({
      showConfirm: false,
      showCancel: false,
      width: 'w-auto max-w-md',
      ...options,
    });

    this.duration = options.duration ?? 3000;
    this.pauseOnHover = options.pauseOnHover ?? true;

    if (this.pauseOnHover) {
      this._bindHoverEvents();
    }
  }

  public override show(): void {
    super.show();
    this.startTimer();
  }

  public override close(): void {
    this.clearTimer();
    super.close();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.close();
    }, this.duration);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private _bindHoverEvents(): void {
    const box = this.dialogEl.querySelector('.modal-box');
    if (!box) return;

    box.addEventListener('mouseenter', () => this.clearTimer());
    box.addEventListener('mouseleave', () => this.startTimer());
  }
}

export function errorNotiTopRight(title,body) {
  const notiDialog = new NotiDialog({
    title:title,
    persistent:true,
    body: body,
    container_tailwind_class:"top-6 right-6 bg-red-500 text-white",


    })
    notiDialog.show()
}
