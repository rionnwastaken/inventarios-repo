import { FabricDeduction } from "../../schema";
import { Fabric, ItemState } from "../../typeObj";
import { ModalState } from "../../typeObj";
import { ModalDialog } from "../dialogs/modalDialog";
import { createElementFromHTML, get_partial_data, ObjectChanged } from "../utils";
import { CoreAPI } from "../../api/core";
import { NotiDialog } from "../dialogs/notification";

export class Form {
  public widthInput!: HTMLInputElement;
  public heightInput!: HTMLInputElement;
  public commentInput!: HTMLInputElement;

  component: HTMLElement;
  modalDialog: ModalDialog;
  modal_state: ModalState;
  fabric: Fabric;
  deduction:FabricDeduction
  resolve_promise?: (result: {
    deduction?: FabricDeduction;
    fabric?: Fabric;
    mode?: ModalState;
  }) => void;

  constructor() {
    this.init_elements();
  }

  private init_elements(): void {
    // Parse strings into direct HTMLInputElement references
    this.widthInput = createElementFromHTML<HTMLInputElement>(`
      <input type="number" step="0.01" name="width" placeholder="0.00" class="input input-bordered w-full" required />
    `);

    this.heightInput = createElementFromHTML<HTMLInputElement>(`
      <input type="number" step="0.01" name="height" placeholder="0.00" class="input input-bordered w-full" required />
    `);

    this.commentInput = createElementFromHTML<HTMLInputElement>(`
      <input type="text" name="comment" placeholder="Comentario o nota..." class="input input-bordered w-full" />
    `);

    this.component = createElementFromHTML(`
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-4">
      <label class="form-control">
        <span class="label label-text font-semibold">Ancho (m)</span>
        <slot id="width"></slot>
      </label>

      <label class="form-control">
        <span class="label label-text font-semibold">Alto (m)</span>
        <slot id="height"></slot>
      </label>
    </div>

    <label class="form-control w-full">
      <span class="label label-text font-semibold">Comentario</span>
      <slot id="comment"></slot>
    </label>
  </div>
`);

    // Directly swap slot placeholders with actual input instances
    this.component.querySelector("#width")?.replaceWith(this.widthInput);
    this.component.querySelector("#height")?.replaceWith(this.heightInput);
    this.component.querySelector("#comment")?.replaceWith(this.commentInput);
  }

  public body(): HTMLElement {
    return this.component;
  }

  /**
   * Helper method to extract typed form values
   */
  public getValues() {

    let comment = null
    if (this.commentInput.value.trim() !== "") {
      comment = this.commentInput.value.trim()
    }

    return {
      width: parseFloat(this.widthInput.value) || null,
      height: parseFloat(this.heightInput.value) || null,
      comment: comment,
    };
  }

  /**
   * Helper method to reset form inputs
   */
  public reset(): void {
    this.widthInput.value = "";
    this.heightInput.value = "";
    this.commentInput.value = null;
  }


  async update_deduction() {
    log.debug("update_deduction()")
    const values = this.getValues();

    let modified_deduction:FabricDeduction = {
      removed_width:values.width,
      removed_height:values.height,
      comment:values.comment
    }

    let changed = ObjectChanged(this.deduction,modified_deduction,new Set(["id","fabric_id","updated_at","created_at"]))
    if (!changed) {
      log.debug("Deduction unchanged")
      return
    }

    let partial_data = get_partial_data(this.deduction,modified_deduction,{onlyKeys:["removed_width","removed_height","comment"]})


    log.debug(this.deduction)
    log.debug(modified_deduction)
    log.debug("isModified is ",changed)
    log.debug("partial data is ",partial_data)

    
    const res = await CoreAPI.update_deduction(this.fabric.id,this.deduction.id,partial_data);

    if (res.status != 200) {
      log.debug(res.data)
      errorNotiTopRight("Error",createElementFromHTML(`<p>${res.data.error}</p>`))
      return;
    }

    const data = res.data;
    log.debug("data in update deduction",data);
    return {
      fabric: data["fabric"],
      deduction: data["deduction"],
    };
  }


  async create_deduction() {
    log.debug("create_deduction()")
    const values = this.getValues();
    log.debug(values)

    let changed  = false
    for ( const [key,value] of Object.entries(values)) {
      if (value != null) {
	changed = true
      }
    }
    if (!changed) {
      return
    }


    let fabricDeduction: FabricDeduction = {
      removed_width: values.width,
      removed_height: values.height,
      comment: values.comment,
      fabric_id: this.fabric.id,
    };

    const res = await CoreAPI.create_deduction(fabricDeduction);

    if (!res.success) {
      log.error("error here is ",res.error.error);
      let body = createElementFromHTML(`<p>${res.error.error}</p>`)
      const notiDialog = new NotiDialog({
	title:"Error shit",
	body: body,
	tailwind_class:"top-6 right-6"
	}
      )
      notiDialog.show()
      return null;
    }

    const data = res.data;
    log.debug(data);

    return {
      fabric: data["fabric"],
      deduction: data["deduction"],
    };
  }

  close() {
    this.modalDialog.close();
    this.reset();
  }

  async show(mode: ModalState, fabric: Fabric, deduction?: FabricDeduction) {
    return new Promise<{
      deduction?: FabricDeduction;
      fabric?: Fabric;
      mode?: ModalState;
    }>((resolve) => {
      this.modal_state = mode;
      this.fabric = fabric;
      this.deduction = deduction
      this.resolve_promise = resolve;

      this.create_dialog();
      this.modalDialog.show();

      if (this.modal_state == "editing") {
        if (!deduction) {
          log.error("Deduction must be passed in editing mode");
          return;
        }

        this.modalDialog.confirmBtn.innerText = "Actualizar deduccion";
        this.start_editing_mode(deduction);
      }
    });
  }

  start_editing_mode(deduction: FabricDeduction) {
    let comment = ""
    if (deduction.comment != null) {
      comment = String(deduction.comment)
    }


    this.widthInput.value = String(deduction.removed_width) || "";
    this.heightInput.value = String(deduction.removed_height) || "";
    this.commentInput.value = comment
  }

  create_dialog() {
    this.modalDialog = new ModalDialog({
      title: "Crear Deduccion",
      body: this.body(),
      width: "", // Custom Tailwind classes
      height: "h-auto max-h-[80vh]",
      cancelText: "Volver",
      cancelClass: "btn",
      confirmText: "Crear deduccion",
      confirmClass: "btn",
      onConfirm: async () => {
        let data = null;
        if (this.modal_state == "creating") {
          data = await this.create_deduction();
          if (!data) {
            return;
          }
          log.debug("Data here before resolving", data, this.modal_state);
        }

        if (this.modal_state == "editing") {
          data = await this.update_deduction();
          if (!data) {
            return;
          }
        }
	if (!data) {
	  return
	}
        this.resolve_promise({
          deduction: data.deduction,
          fabric: data.fabric,
          mode: this.modal_state,
        });
        this.close();
      },
      onCancel: () => {
        this.close();
      },
    });
  }
}
