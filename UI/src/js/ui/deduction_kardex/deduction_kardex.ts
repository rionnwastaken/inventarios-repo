// import { FabricDeduction } from "../../schema";
import {
  FabricData,
  Fabric,
  ModalState,
  FabricDeduction,
  Tube,
} from "../../typeObj";
import { ModalDialog } from "../dialogs/modalDialog";
import {
  column2,
  createElementFromHTML,
  inspect_row,
  RenderingInfo,
} from "../utils";
import { state } from "../../state";
import { Api, ColumnsConfig } from "datatables.net-dt";

import {
  createIconHTML,
  format_measurement,
  render_datecell,
  render_plain,
  render_plain2,
} from "../renderUtils";
import { Form } from "./form";
import { TypedEventEmitter } from "../../emitter";
import { column } from "../utils";
import edit_icon from "../../../assets/icons/edit.png";
import { CoreAPI } from "../../api/core";
import { Comments } from "./comments/comments";
import { FabricComment } from "../../schema";
import { KardexTable } from "./table";

const title_catalago_id = "title-catalago-text-id";
const initial_measurement_container_id = "initial-measurement-container";
const fabric_available_percent = "fabric_available_percent";

export interface DeductionKardexEvents {
  "deduction:modified": (fabric: Fabric) => void;
  "deduction:deleted": (fabric: Fabric, deduction_id) => void;
  "comment:edited": (fabric: Fabric, comment: FabricComment) => void;
  "comment:deleted": (fabric: Fabric, comment: FabricComment) => void;
  "kardex:closing": (tube: Tube) => void;
  "open:vista-tubos": (tube: Tube) => void;
}

class DeductionKardex {
  table_element: HTMLTableElement;
  table: Api<FabricDeduction>;
  fabric: Fabric;
  modalDialog: ModalDialog;
  title_el: HTMLElement;

  title_catalago_p: HTMLParagraphElement;
  initial_measurement_span: HTMLSpanElement;
  fabric_available_percent_p: HTMLSpanElement;
  remaining_measurement_span: HTMLSpanElement;

  deductionForm: Form;
  commentsForm: Comments;
  wrapper: HTMLElement;

  public events = new TypedEventEmitter<DeductionKardexEvents>();

  goback: HTMLButtonElement;
  deduct: HTMLButtonElement;
  comments: HTMLButtonElement;

  recent_comment_p: HTMLParagraphElement;

  kardexTable: KardexTable;

  constructor() {}
  init() {
    this.deductionForm = new Form();
    this.commentsForm = new Comments(this.events);
    this.create_dialog();
    this.kardexTable = new KardexTable({
      on_delete: async (data, row) => {
        const res = await CoreAPI.delete_deduction(this.fabric.id, data.id);
        if (!res.success) {
          log.debug(res.data);
          return;
        }
        this.fabric = res.data.fabric;
        row.remove();
        this.table.draw();

        this.update_display_initial_measurements();
        this.events.emit(
          "deduction:deleted",
          this.fabric,
          res.data.deduction_id,
        );
        log.debug(`Deduction removed ${res.data.deduction_id}`);
      },
    });
    this.kardexTable.init(this.table_element);
    this.table = this.kardexTable.dt;

    this.kardexTable.actionOverlay.cb_samerow_2clicks = async (data, row) => {
      log.debug("deleting deductionn");
      await this.open_deduction_form("editing", data);
      this.table.draw(false);
    };
  }

  cb_update_fabric_data(fabric: Fabric) {
    this.fabric = fabric;
    this.update_display();
  }

  update_title(fabric: Fabric) {
    const tablenames = [
      "blind_model",
      "color",
      "fabric_classification",
      "supplier",
    ];
    let text = "";

    for (let tablename of tablenames) {
      let id = fabric[`${tablename}_id`];
      let name = state.catalagoData.catalagoValue(tablename, id);

      if (name) {
        text += `${name} | `;
      }
    }
    text = text.slice(0, text.length - 2);
    log.debug(text);
    this.title_catalago_p.textContent = text;
  }

  title(): HTMLElement {
    this.title_el = createElementFromHTML(`
  <div class="flex justify-between"> 
    <div> 
      <h1>Kardex de Salida de Tela</h1>
      <h2 id="${title_catalago_id}"></h2>
    </div>
    
<!-- Measurements Section -->
<div class="flex items-center gap-3"> 

  <!-- Medidas Iniciales Card (Black/Dark Slate Theme) -->
  <div class="flex flex-col p-2.5 rounded-lg bg-white   text-xs"> 
    <span class="font-semibold uppercase tracking-wider text-zinc-800 mb-1 flex items-center gap-1">
      Medidas Iniciales
    </span>
    <div id="${initial_measurement_container_id}" class="flex flex-col justify-start font-mono text-zinc-800">
      <span class="font-bold text-black"></span> 
    </div>
  </div>

  <div> 
    <p>Disponible</p>
    <p id="${fabric_available_percent}"></p>
  </div>



    </div>
  </div>
`);

    return this.title_el;
  }

  body(): HTMLElement {
    this.wrapper = createElementFromHTML(`
    <div class="flex   flex-col gap-4">
      <div class="top-container"> 

      </div>
      <div class="table-container mr-20">
	<table id='duduction-table' class="display"> 
	    <thead></thead>
	    <tbody></tbody>
	</table>
      </div>

      <div class="bottom-container flex flex-col"> 
      <p id='recent-comment'>Comentario reciente:</p>
      </div>
    </div>
  `);

    this.table_element = this.wrapper.querySelector("table");
    this.recent_comment_p = this.wrapper.querySelector("#recent-comment");

    return this.wrapper;
  }

  update_display_initial_measurements() {
    let original_width = this.fabric.original_width;
    let original_height = this.fabric.original_height;
    this.initial_measurement_span.textContent = `${original_width} x ${original_height} mts`;
    this.fabric_available_percent_p.textContent = `${this.fabric.remaining_percent}%`;
  }

  async open_deduction_form(mode: ModalState, deduction?: FabricDeduction) {
    const result = await this.deductionForm.show(mode, this.fabric, deduction);

    if (!result) {
      log.debug("No result in open_deduction_form");
      return;
    }
    log.info("Fabric dat after updating deduction ", result.fabric);
    this.fabric = result.fabric;
    this.update_display_initial_measurements();

    if (mode == "creating") {
      log.debug("result her eshit is ", result);
      this.table.row.add(result.deduction);
    }

    if (mode == "editing") {
      let row = this.table.row((index, data, node) => {
        if (data.id == result.deduction.id) {
          return true;
        }
      });

      if (!row) {
        log.debug(
          `Row in datatable was not found with id ${result.deduction.id}`,
        );
        return;
      }
      log.debug("result here ", result);
      row.data(result.deduction);
    }

    state.tableData.update_fabric_by_id(result.fabric);
    console.log("result here in kardex:", result);
    this.table.draw();
    this.events.emit("deduction:modified", this.fabric);
  }

  async show_comments() {
    const result = await this.commentsForm.show(this.fabric);
  }

  close() {
    this.kardexTable.clear();
    this.modalDialog.close();
    this.recent_comment_p.textContent = "";
  }

  create_dialog() {
    const a_tw = "min-w-7xl min-h-5xl";
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      width: "w-full min-w-7xl", // Custom Tailwind classes
      container_tailwind_class: a_tw,
      height: "h-auto max-h-[80vh]",

      showCancel: false,
      showConfirm: false,

      onClose: () => {
        this.table.data().clear();

        let tube = state.tableData.tubes.find(
          (el) => el.id == this.fabric.tube_id,
        );
        this.events.emit("kardex:closing", tube);
      },
    });

    let boco = this.modalDialog.dialogEl.querySelector(".bottom-container");

    let buttons = createElementFromHTML(`
	<div class="flex justify-left"> 
	    <button class="btn" id="kardex-goback">Vista Tubo</button>
	    <button class="btn" id="kardex-deduct">Crear Salida</button>
	    <button class="btn" id="kardex-comments">Ver comentarios</button>
	</div>
    `);

    this.goback = buttons.querySelector("#kardex-goback");
    this.deduct = buttons.querySelector("#kardex-deduct");
    this.comments = buttons.querySelector("#kardex-comments");

    boco.prepend(buttons);

    this.goback.addEventListener("click", () => {
      this.kardexTable.clear();
      this.modalDialog.close();
      this.recent_comment_p.textContent = "";

      let tube = state.tableData.tubes.find(
        (el) => el.id == this.fabric.tube_id,
      );
      this.events.emit("open:vista-tubos", tube);
      this.close();
    });

    this.deduct.addEventListener("click", async () => {
      await this.open_deduction_form("creating");
    });

    this.comments.addEventListener("click", async () => {
      this.show_comments();
      log.debug("Comments");
    });

    let d = this.modalDialog.dialogEl;
    this.title_catalago_p = d.querySelector(`#${title_catalago_id}`);
    this.initial_measurement_span = d.querySelector(
      `#${initial_measurement_container_id} span`,
    );
    this.fabric_available_percent_p = d.querySelector(
      `#${fabric_available_percent}`,
    );
  }
  update_display() {
    if (this.fabric.comments.length > 0) {
      this.recent_comment_p.textContent = `Comentario Reciente: ${this.fabric.comments[0].comment} `;
    }
  }

  cb_show_kardex(fabric: Fabric) {
    this.fabric = fabric;
    this.update_title(fabric);
    this.update_display_initial_measurements();
    log.debug("Fabric received in kardex", fabric);
    this.update_display();

    this.insert_deductions_to_table(fabric.deductions);

    this.modalDialog.show();
  }

  insert_deductions_to_table(deductions: FabricDeduction[]) {
    deductions = deductions || [];

    log.debug("insert_deductions_to_table()");
    log.debug("deductions: ", deductions);

    deductions.forEach((element) => {
      this.table.row.add(element);
    });
    this.table.draw();
  }
}
const deductionKardex = new DeductionKardex();
export { deductionKardex };
