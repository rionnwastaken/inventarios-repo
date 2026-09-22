import { createElementFromHTML } from "../utils";

export type DialogCallback = (
  instance: ModalDialog,
) => boolean | void | Promise<boolean | void>;

export interface ModalDialogOptions {
  title?: string | HTMLElement;
  body?: string | HTMLElement;
  width?: string;
  height?: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  cancelClass?: string;
  showCancel?: boolean;
  showConfirm?: boolean;
  onConfirm?: DialogCallback | null;
  onCancel?: DialogCallback | null;
  onClose?: DialogCallback | null;
  container_tailwind_class?: string | null;
  footerContainer_tailwind_class?: string | null;
  footer?: string | null;
}

export class ModalDialog {
  private options: Required<ModalDialogOptions>;
  public dialogEl!: HTMLDialogElement;
  cancelBtn: HTMLButtonElement;
  confirmBtn: HTMLButtonElement;
  footerContainer: HTMLElement;

  constructor(options: ModalDialogOptions = {}) {
    this.options = {
      container_tailwind_class: options.container_tailwind_class ?? "",
      footerContainer_tailwind_class:
        options.footerContainer_tailwind_class ?? null,

      title: options.title ?? "Dialog",
      body: options.body ?? "",
      width: options.width ?? "",
      height: options.height ?? "",
      confirmText: options.confirmText ?? "Aceptar",
      cancelText: options.cancelText ?? "Cancelar",
      confirmClass: options.confirmClass ?? "btn-primary",
      cancelClass: options.cancelClass ?? "btn-ghost",
      showCancel: options.showCancel ?? true,
      showConfirm: options.showConfirm ?? true,
      onConfirm: options.onConfirm ?? null,
      onCancel: options.onCancel ?? null,
      onClose: options.onClose ?? null,
      footer: options.footer ?? null,
    };

    this._init();
  }

  private _init(): void {
    // 1. Create native <dialog> element
    this.dialogEl = document.createElement("dialog");
    this.dialogEl.className = "modal";

    // 2. Build dimensions class string
    const widthClass = this.options.width ? this.options.width : "";
    const heightClass = this.options.height ? this.options.height : "";

    let footer_classes =
      this.options.footerContainer_tailwind_class ||
      "flex justify-end gap-2 mt-4";

    // const containerClasses =
    // `modal-box absolute ${this.options.container_tailwind_class}  ${widthClass} ${heightClass} flex flex-col gap-4  overflow-visible`.trim();
    const containerClasses =
      `modal-box absolute ${this.options.container_tailwind_class} ${widthClass} ${heightClass} flex flex-col gap-4 overflow-visible`.trim();

    // 3. Build layout template using DaisyUI structure
    this.dialogEl.innerHTML = `
      <div class="${containerClasses}">
        <!-- Header -->
        <div class="modal-header">
          <h3 class="text-lg font-bold dialog-title-container"></h3>
        </div>

        <!-- Body -->
        <div class="modal-body dialog-body-container"></div>

        <!-- Footer Actions -->
        <div class="dialog-footer-container ${footer_classes}"></div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit">close</button>
      </form>
    `;

    this._renderHeader();
    this._renderBody();
    this._renderFooter();
    this._bindEvents();
  }

  private _renderHeader(): void {
    const titleContainer = this.dialogEl.querySelector<HTMLElement>(
      ".dialog-title-container",
    );
    if (!titleContainer) return;

    if (this.options.title instanceof HTMLElement) {
      titleContainer.replaceChildren(this.options.title);
    } else {
      titleContainer.innerHTML = this.options.title;
    }
  }

  private _renderBody(): void {
    const bodyContainer = this.dialogEl.querySelector<HTMLElement>(
      ".dialog-body-container",
    );
    if (!bodyContainer) return;

    if (this.options.body instanceof HTMLElement) {
      bodyContainer.replaceChildren(this.options.body);
    } else {
      bodyContainer.innerHTML = this.options.body;
    }
  }

  private _renderFooter(): void {
    console.log("rendering footer");
    this.footerContainer = this.dialogEl.querySelector<HTMLElement>(
      ".dialog-footer-container",
    );
    if (!this.footerContainer) return;

    if (this.options.footer != null) {
      console.log("appending footer?");
      this.footerContainer.appendChild(
        createElementFromHTML(this.options.footer),
      );
      return;
    }

    if (this.options.showCancel) {
      this.cancelBtn = document.createElement("button");
      this.cancelBtn.type = "button";
      this.cancelBtn.className = `btn ${this.options.cancelClass}`;
      this.cancelBtn.textContent = this.options.cancelText;
      this.cancelBtn.addEventListener("click", () => void this.handleCancel());
      this.footerContainer.appendChild(this.cancelBtn);
    }

    if (this.options.showConfirm) {
      this.confirmBtn = document.createElement("button");
      this.confirmBtn.type = "button";
      this.confirmBtn.className = `btn ${this.options.confirmClass}`;
      this.confirmBtn.textContent = this.options.confirmText;
      this.confirmBtn.addEventListener(
        "click",
        () => void this.handleConfirm(),
      );
      this.footerContainer.appendChild(this.confirmBtn);
    }
  }

  private _bindEvents(): void {
    this.dialogEl.addEventListener("cancel", (e) => {
      e.preventDefault();
      void this.handleCancel();
    });

    // 2. Clean up DOM when dialog actually closes
    this.dialogEl.addEventListener("close", async (e) => {
      e.preventDefault();
      log.debug("dialog closing");
      if (typeof this.options.onClose === "function") {
        let value = await this.options.onClose(this);
        if (value == false) {
          return;
        }
      }
      this.dialogEl.remove();
    });

    this.dialogEl.addEventListener("submit", (e) => {
      e.preventDefault();
    });

    this.dialogEl.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          void this.handleCancel();
          log.debug("Escape key captured and blocked");
        }
      },
      true,
    );
  }

  public async handleConfirm(): Promise<void> {
    if (typeof this.options.onConfirm === "function") {
      const result = await this.options.onConfirm(this);
      if (result === false) return;
    }
    // this.close();
  }

  public async handleCancel(): Promise<void> {
    if (typeof this.options.onCancel === "function") {
      const result = await this.options.onCancel(this);
      if (result === false) return;
    }
    this.close();
  }

  public show(): void {
    document.body.appendChild(this.dialogEl);
    this.dialogEl.showModal();
  }

  public close(): void {
    if (this.dialogEl && this.dialogEl.open) {
      this.dialogEl.close();
    }
  }

  public getElement(): HTMLDialogElement {
    return this.dialogEl;
  }
}
