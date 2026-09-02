import { FabricDeduction } from "../../schema";
import { Fabric, ItemState } from "../../typeObj";
import { ModalState } from "../../typeObj";
import { ModalDialog } from "../dialogs/modalDialog";
import {
  calc_remaining_fabric_measurements,
  createElementFromHTML,
  get_partial_data,
  num,
  ObjectChanged,
} from "../utils";
import { CoreAPI } from "../../api/core";
import { NotiDialog, errorNotiTopRight } from "../dialogs/notification";

interface InputComponent {
  input: HTMLInputElement;
  error: HTMLParagraphElement;
}

interface ComponentValues {
  form_width: string | null;
  form_height: string | null;
  form_comment: string | null;
}

export class Form {
  public width_obj!: InputComponent;
  public height_obj!: InputComponent;
  public comment_obj!: InputComponent;
  public global_error!: HTMLParagraphElement;

  component: HTMLElement;
  modalDialog: ModalDialog;
  modal_state: ModalState;
  fabric: Fabric;
  deduction: FabricDeduction;
  resolve_promise?: (result: {
    deduction?: FabricDeduction;
    fabric?: Fabric;
    mode?: ModalState;
  }) => void;

  constructor() {
    this.init_elements();
  }

  private init_elements(): void {
    function createComp(label_name, measure: boolean, id) {
      let input = "";
      if (measure) {
        input = `<input type="number" step="0.01" pattern="[0-9.]" name="height" placeholder="0.00" class="input input-bordered w-full" required />`;
      } else {
        input = `<input type="text" name="comment" placeholder="Comentario o nota..." class="input input-bordered w-full" />`;
      }
      return `

	<label class="form-control">
	  <span class="label label-text font-semibold">${label_name}</span>
	  <div id="${id}"> 
	    ${input}
	    <p class="text-red-500"></p>
	  </div>
	</label>

      `;
    }

    function getFieldElements(
      root: HTMLElement,
      containerId: string,
    ): { input: HTMLInputElement; error: HTMLParagraphElement } | null {
      const container = root.querySelector(`#${containerId}`);
      if (!container) return null;

      const input = container.querySelector<HTMLInputElement>("input");
      const error = container.querySelector<HTMLParagraphElement>("p");

      if (!input || !error) return null;

      return { input, error };
    }

    function number_event_liesteners(obj: InputComponent) {
      obj.input.addEventListener("focus", (e) => {
        obj.error.textContent = "";
        // this.global_error.textContent = ""
      });

      obj.input.addEventListener("keydown", (e) => {
        if (["e", "E", "+", "-"].includes(e.key)) {
          e.preventDefault();
        }
      });
    }

    this.component = createElementFromHTML(`

  <div class="flex flex-col gap-4">
    <p id="global-error" class="text-red-500"></p>
    <div class="grid grid-cols-2 gap-4">
      ${createComp("Ancho (m)", true, "ancho_component")}
      ${createComp("Alto (m)", true, "alto_component")}
    </div>
    ${createComp("Comentario", false, "comentario_component")}
  </div>
`);

    // Directly swap slot placeholders with actual input instances
    this.width_obj = getFieldElements(this.component, "ancho_component");
    this.height_obj = getFieldElements(this.component, "alto_component");
    this.comment_obj = getFieldElements(this.component, "comentario_component");
    this.global_error = this.component.querySelector("#global-error");

    number_event_liesteners(this.width_obj);
    number_event_liesteners(this.height_obj);
  }

  public body(): HTMLElement {
    return this.component;
  }

  /**
   * Helper method to reset form inputs
   */
  public reset(): void {
    this.width_obj.input.value = "";
    this.height_obj.input.value = "";
    this.comment_obj.input.value = null;
  }

  data_change_in_update(data: ComponentValues) {
    let changed = false;

    if (this.deduction.removed_width != data.form_width) {
      return true;
    }

    if (this.deduction.removed_height != data.form_height) {
      return true;
    }

    if (this.deduction.comment != data.form_comment) {
      return true;
    }
    return false;
  }

  async update_deduction() {
    log.debug("update_deduction()");
    const values = this.validate_fileds();
    if (values == null) {
      this.global_error.textContent = "No se han realizado modificaciones";
      return;
    }

    if (!this.data_change_in_update(values)) {
      this.global_error.textContent = "No se han realizado modificaciones";
      return;
    }

    let modified_deduction: FabricDeduction = {
      removed_width: values.form_width,
      removed_height: values.form_height,
      comment: values.form_comment,
    };

    let changed = ObjectChanged(
      this.deduction,
      modified_deduction,
      new Set(["id", "fabric_id", "updated_at", "created_at"]),
    );
    if (!changed) {
      log.debug("Deduction unchanged");
      return;
    }

    let partial_data = get_partial_data(this.deduction, modified_deduction, {
      onlyKeys: ["removed_width", "removed_height", "comment"],
    });

    log.debug(this.deduction);
    log.debug(modified_deduction);
    log.debug("isModified is ", changed);
    log.debug("partial data is ", partial_data);

    const res = await CoreAPI.update_deduction(
      this.fabric.id,
      this.deduction.id,
      partial_data,
    );

    if (res.status != 200) {
      log.debug(res.data);
      errorNotiTopRight(
        "Error",
        createElementFromHTML(`<p>${res.data.error}</p>`),
      );
      return;
    }

    const data = res.data;
    log.debug("data in update deduction", data);
    return {
      fabric: data["fabric"],
      deduction: data["deduction"],
    };
  }
  validate_fileds() {
    let comment = null;
    let original_width = num(this.fabric.original_width);
    if (this.comment_obj.input.value.trim() !== "") {
      comment = this.comment_obj.input.value.trim();
    }

    const values: ComponentValues = {
      form_width: this.width_obj.input.value || null,
      form_height: this.height_obj.input.value || null,
      form_comment: comment,
    };
    let width = num(values.form_width);
    let height = num(values.form_height);

    const mss_campo_vacio = "El campo no puede estar vacio";
    if (values.form_width == null) {
      this.width_obj.error.textContent = mss_campo_vacio;
      return null;
    }

    if (values.form_height == null) {
      this.height_obj.error.textContent = mss_campo_vacio;
      return null;
    }

    if (width > original_width) {
      this.width_obj.error.textContent = `El ancho no puede ser mayor a ${original_width}`;
      return null;
    }

    const deductions = this.fabric?.deductions || [];
    const measurement = calc_remaining_fabric_measurements(this.fabric);

    let height_limit;
    const remainingHeight = measurement.remaining_height || 0;

    if (this.modal_state === "editing") {
      const currentRemovedHeight: number = num(this.deduction.removed_height);
      height_limit = remainingHeight + currentRemovedHeight;
    } else {
      height_limit = remainingHeight;
    }

    if (height > height_limit) {
      this.height_obj.error.textContent = `La altura no puede excederse de ${height_limit} m`;
      return null;
    }

    return values;
  }

  async create_deduction() {
    log.debug("create_deduction()");
    let values = this.validate_fileds();

    log.debug(values);
    if (values == null) {
      return;
    }

    let fabricDeduction: FabricDeduction = {
      removed_width: values.form_width,
      removed_height: values.form_height,
      comment: values.form_comment,
      fabric_id: this.fabric.id,
    };

    const res = await CoreAPI.create_deduction(fabricDeduction);

    log.debug("data here is ", res);
    if (!res.success) {
      errorNotiTopRight(
        "Error",
        createElementFromHTML(`<p>${res.data.error}</p>`),
      );
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
      this.deduction = deduction;
      this.resolve_promise = resolve;

      this.create_dialog();
      this.modalDialog.show();

      if (this.modal_state == "editing") {
        if (!deduction) {
          log.error("Deduction must be passed in editing mode");
          throw Error("Deduction must be passed in editing mode");
        }
        this.modalDialog.confirmBtn.innerText = "Actualizar deduccion";
        this.start_editing_mode(deduction);
        return;
      }
      this.width_obj.input.value = this.fabric.original_width;
    });
  }

  start_editing_mode(deduction: FabricDeduction) {
    let comment = "";
    if (deduction.comment != null) {
      comment = String(deduction.comment);
    }

    this.width_obj.input.value = String(deduction.removed_width) || "";
    this.height_obj.input.value = String(deduction.removed_height) || "";
    this.comment_obj.input.value = comment;
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
          return;
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
