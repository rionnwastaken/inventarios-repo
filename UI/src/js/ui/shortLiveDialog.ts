import { ModalDialog } from "./dialogs/modalDialog";

class ShortLivedDialog extends ModalDialog {
  resolve: (data: boolean) => void;
  modalDialog: ModalDialog;
  modal_dialog_show: any;

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

    this.modal_dialog_show = super.show;
  }

  open() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.modal_dialog_show();
    });
  }

  show() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.modal_dialog_show();
    });
  }

  close() {
    super.close();
    return this.resolve(false);
  }
}

const shortLivedDialog = new ShortLivedDialog();
export { shortLivedDialog };
