import { ModalDialog } from "./dialogs/modalDialog";

class ShortLivedDialog extends ModalDialog {
  resolve: (data: boolean) => void;
  modalDialog: ModalDialog;

  constructor() {
    super({
      container_tailwind_class: "w-fit h-fit",
      onClose: () => {
        return this.resolve(false);
      },

      onConfirm: () => {
        return this.resolve(true);
      },
    });
  }

  open() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      super.show();
    });
  }

  show() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      super.show();
    });
  }

  close() {
    super.close();
    return this.resolve(false);
  }
}

const shortLivedDialog = new ShortLivedDialog();
export { shortLivedDialog };
