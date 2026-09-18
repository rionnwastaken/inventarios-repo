// import { FabricDeduction } from "../../schema";
import { FabricData, Fabric, ModalState, FabricDeduction } from "../../typeObj";
import { ModalDialog } from "../dialogs/modalDialog";
import {
  column2,
  createElementFromHTML,
  inspect_row,
  RenderingInfo,
} from "../utils";
import { state } from "../../state";
import { Api, ColumnsConfig } from "datatables.net-dt";

import DataTable from "datatables.net-dt";
import "datatables.net-select-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";
import "datatables.net-select-dt/css/select.dataTables.css";
// import "datatables.net-dt/css/dataTables.dataTables.css";
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
import { ActionOverlay } from "../misc/ActionOverlay";
import { CoreAPI } from "../../api/core";

const title_catalago_id = "title-catalago-text-id";
const initial_measurement_container_id = "initial-measurement-container";
const fabric_available_percent = "fabric_available_percent";

export interface DeductionKardexEvents {
  "deduction:modified": (fabric: Fabric) => void;
  "deduction:deleted": (fabric: Fabric, deduction_id) => void;
}

class DeductionKardex {
  columns: (ColumnsConfig & { data: keyof FabricDeduction })[];
  table_element: HTMLTableElement;
  table: Api<FabricDeduction>;
  tbody: HTMLTableElement;
  fabric: Fabric;
  modalDialog: ModalDialog;
  title_el: HTMLElement;

  title_catalago_p: HTMLParagraphElement;
  initial_measurement_span: HTMLSpanElement;
  fabric_available_percent_p: HTMLSpanElement;
  remaining_measurement_span: HTMLSpanElement;

  deductionForm: Form;
  wrapper: HTMLElement;

  overlay_action_container: HTMLDivElement;
  delete_action_btn: HTMLButtonElement;
  actionOverlay: ActionOverlay;
  public events = new TypedEventEmitter<DeductionKardexEvents>();

  constructor() {}
  init() {
    this.deductionForm = new Form();
    this.init_columns();
    this.create_dialog();
    this.init_table(); //MAKE SURE TO INIT TABLE AFTER TABLE ELEMENT HAS BEEN LAYED SOMEWHERE
    this.init_binding();
    this.actionOverlay = new ActionOverlay({
      table: this.table,
      container: this.create_action_overlay(),
      cb_samerow_2clicks: async (deduction, selected_row) => {
        log.debug("deleting deductionn");
        await this.open_deduction_form("editing", deduction);
        this.table.draw(false);
      },
    });
  }

  init_binding() {
    this.bind_row_click();
    inspect_row(this.tbody, this.table);
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

  init_columns() {
    //@ts-ignore
    this.columns = [
      //@ts-ignore
      column2({
        id: "",
        column_name: "Salidas",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as FabricDeduction;
          let width = data.removed_width;
          let height = data.removed_height;
          return `${width} x ${height} mts`;
        },
        // format_func: format_measurement,
      }),

      //@ts-ignore
      column2({
        id: "comment",
        column_name: "Comentario",
        rendering_func: render_plain2,
      }),

      //@ts-ignore
      column2({
        id: "updated_at",
        column_name: "Ultima actualizacion",
        rendering_func: render_datecell,
      }),

      //@ts-ignore
      column2({
        id: "created_at",
        column_name: "Creado",
        rendering_func: render_datecell,
      }),
    ];
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
      </div>
    </div>
  `);

    this.table_element = this.wrapper.querySelector("table");
    this.tbody = this.table_element.querySelector("tbody");

    return this.wrapper;
  }

  update_display_initial_measurements() {
    let original_width = this.fabric.original_width;
    let original_height = this.fabric.original_height;
    this.initial_measurement_span.textContent = `${original_width} x ${original_height} mts`;
    this.fabric_available_percent_p.textContent = `${this.fabric.remaining_percent}%`;
  }

  init_table() {
    this.table = new DataTable(this.table_element, {
      columns: this.columns,
      paging: false,
      autoWidth: true,

      select: {
        blurable: true,
      },
      searching: false,
      // order: { name: "original_fabric.updated_at", dir: "desc" },
      // rowCallback: this.render_row,
      columnDefs: [
        {
          targets: "_all", // Zero-based index of the columns you want to left-align
          className: "dt-left", // Applies left-alignment to both header and body cells
        },
      ],
    });
  }

  bind_row_click() {
    this.tbody.addEventListener("click", async (event) => {
      this.actionOverlay.handle_row_click(event);
    });
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

  close() {
    this.table.data().clear();
    this.table.draw();
    this.modalDialog.close();
  }

  create_dialog() {
    const a_tw = "min-w-7xl min-h-5xl";
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      width: "w-full min-w-7xl", // Custom Tailwind classes
      container_tailwind_class: a_tw,
      height: "h-auto max-h-[80vh]",
      cancelText: "Volver",
      cancelClass: "btn",
      confirmText: "Deducir",
      confirmClass: "btn-error",
      footerContainer_tailwind_class: "flex justify-left",

      onConfirm: async () => {
        await this.open_deduction_form("creating");
      },
      onCancel: () => {
        this.close();
      },
      onClose: () => {
        this.table.data().clear();
      },
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

  cb_show_kardex(fabric: Fabric) {
    this.fabric = fabric;
    this.update_title(fabric);
    this.update_display_initial_measurements();
    log.debug("Fabric received in kardex", fabric);

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

  private create_action_overlay() {
    this.overlay_action_container = createElementFromHTML(`
      <div class="dt-row-overlay absolute left-full top-0 z-[9999]  flex flex-col gap-2    border border-slate-700 whitespace-nowrap">
      ${createIconHTML({
        src: edit_icon,
        id: "delete-action",
        title: "Eliminar Deduccion",
      })}
      </div>
`);

    this.delete_action_btn =
      this.overlay_action_container.querySelector("#delete-action");

    this.delete_action_btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      log.debug("Deleting deduction");

      let row = this.actionOverlay.selected_row;
      let deduction = row.data() as FabricDeduction;

      const res = await CoreAPI.delete_deduction(this.fabric.id, deduction.id);
      if (!res.success) {
        log.debug(res.data);
        return;
      }
      this.fabric = res.data.fabric;
      row.remove();
      this.table.draw();

      this.update_display_initial_measurements();
      this.events.emit("deduction:deleted", this.fabric, res.data.deduction_id);
      log.debug(`Deduction removed ${res.data.deduction_id}`);
    });
    return this.overlay_action_container;
  }
}
const deductionKardex = new DeductionKardex();
export { deductionKardex };
