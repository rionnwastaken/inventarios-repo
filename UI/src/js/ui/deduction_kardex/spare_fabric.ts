import { CoreAPI } from "../../api/core";
import { SpareFabric } from "../../schema";
import { Fabric } from "../../typeObj";
import { ModalDialog } from "../dialogs/modalDialog";
import { showRecycleDialog } from "../utils";

const checkbox_id = "archive-fabric-checkbox-container";
const width_span_id = "width-fabric";
const height_span_id = "height-fabric";

const bg_archive = "!bg-red-500";
const bg_not_archive = "!bg-green-500";

const archive_colors = {
  text: "Marcar como utilizado",
  bg: bg_archive,
};
const un_archive_colors = {
  text: "Desmarcar como utilizado",
  bg: bg_not_archive,
};

const rele = new Map();
rele.set(false, archive_colors);
rele.set(true, un_archive_colors);

type lePromise = { spare_fabric: SpareFabric } | null;

export class SpareFabricView {
  modal_dialog: ModalDialog;
  width_span: HTMLSpanElement;
  height_span: HTMLSpanElement;
  checkbox: HTMLInputElement;
  confirmbtn: HTMLButtonElement;

  fabric: Fabric;
  spareFabric: SpareFabric;

  promise: (result: lePromise) => void;

  constructor() {
    this.modal_dialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      container_tailwind_class: "w-fit h-fit",

      onClose: () => {
        this.promise(null);
      },

      onConfirm: async () => {
        let data: Partial<SpareFabric> = {
          archive: !this.spareFabric.archive,
        };

        this.spareFabric.archive = !this.spareFabric.archive;

        const res = await CoreAPI.update_spare_fabric(
          this.spareFabric.id,
          data,
        );

        if (res.success) {
          this.spareFabric = res.data.spare_fabric;
          let previous = rele.get(!this.spareFabric.archive);
          let cd = rele.get(this.spareFabric.archive);

          this.confirmbtn.classList.remove(previous.bg);
          this.confirmbtn.classList.toggle(cd.bg);
          this.confirmbtn.textContent = cd.text;

          this.confirmbtn.classList.remove(bg_archive);
          this.confirmbtn.classList.remove(bg_not_archive);
          this.modal_dialog.close();
          this.promise({
            spare_fabric: res.data.spare_fabric,
          });

          return;
        }
        showRecycleDialog({ header: "Error", message: res.data });
      },
    });

    let d = this.modal_dialog.dialogEl;

    this.width_span = d.querySelector(`#${width_span_id}`);
    this.height_span = d.querySelector(`#${height_span_id}`);
    this.checkbox = d.querySelector(`.${checkbox_id} input`);
    this.confirmbtn = this.modal_dialog.confirmBtn;
  }

  body() {
    return `
    <div class="flex"> 
      <p> <span id="${width_span_id}"> </span>X<span id="${height_span_id}"> </span> mts  </p>

    </div> 

    `;
  }
  title() {
    return `Tela sobrante de de deducción`;
  }

  show(fabric: Fabric, spareFabric: SpareFabric) {
    return new Promise<lePromise>((resolve) => {
      this.promise = resolve;
      this.fabric = fabric;
      this.spareFabric = spareFabric;

      this.width_span.innerText = spareFabric.width;
      this.height_span.innerText = spareFabric.height;
      this.modal_dialog.show();

      let cd = rele.get(spareFabric.archive);

      this.confirmbtn.classList.add(cd.bg);
      this.confirmbtn.textContent = cd.text;
    });
    // this.checkbox.checked =  spareFabric.archive
  }
}
