import { ModalDialog } from "./dialogs/modalDialog";

class ShortLivedDialog extends ModalDialog {
  resolve: (boolean) => void;

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
      this.show();
    });
  }
}

const shortLivedDialog = new ShortLivedDialog();
export { shortLivedDialog };
