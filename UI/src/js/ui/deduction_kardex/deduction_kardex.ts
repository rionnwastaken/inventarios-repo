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
import "datatables.net-dt/css/dataTables.dataTables.css";
import {
  format_measurement,
  render_datecell,
  render_plain,
  render_plain2,
} from "../renderUtils";
import { Form } from "./form";
import { TypedEventEmitter } from "../../emitter";
import { column } from "../utils";
import icon from "../../../assets/icons/spare_fabric_symbol.svg";

const title_catalago_id = "title-catalago-text-id";
const initial_measurement_container_id = "initial-measurement-container";
const fabric_available_percent = "fabric_available_percent";

export interface DeductionKardexEvents {
  "deduction:modified": (fabric: Fabric) => void;
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
  public events = new TypedEventEmitter<DeductionKardexEvents>();

  constructor() {}
  init() {
    this.deductionForm = new Form();
    this.init_elements();
    this.init_columns();
    this.init_table();
    this.init_binding();
    this.create_dialog();
  }

  init_binding() {
    this.bind_row_double_click();
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
  <div class="flex flex-col p-2.5 rounded-lg bg-white border  text-xs"> 
    <span class="font-semibold uppercase tracking-wider text-zinc-800 mb-1 flex items-center gap-1">
      Medidas Iniciales
    </span>
    <div id="${initial_measurement_container_id}" class="flex flex-col justify-start font-mono text-zinc-800">
      <span class="font-bold text-black"></span> 
    </div>
  </div>

  <p id="${fabric_available_percent}"></p>



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

  init_elements() {
    this.table_element = createElementFromHTML(
      ` <table id='duduction-table'> 
          <tbody></tbody>
      </table> `,
    );

    this.tbody = this.table_element.querySelector("tbody");
  }

  body(): HTMLElement {
    this.wrapper = createElementFromHTML(`
    <div class="flex   flex-col gap-4">
      <div class="top-container"> 

      </div>
      <div class="table-container w-full overflow-x-auto"></div>
      <div class="bottom-container flex flex-col"> 
      </div>
    </div>
  `);

    // 3. Insert the table node into the slot
    this.wrapper
      .querySelector(".table-container")
      ?.appendChild(this.table_element);

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

  bind_row_double_click() {
    // Listen for clicks
    this.tbody.addEventListener("dblclick", async (event) => {
      const row = event.target.closest("tr");

      if (row && this.tbody.contains(row)) {
        const row_obj = this.table.row(row);
        const deduction = row_obj.data();

        if (deduction == undefined) {
          log.debug("Double click row undefined");
          return;
        }
        await this.open_deduction_form("editing", deduction);

        this.table.draw(false);
      }
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
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      width: "w-full min-w-7xl", // Custom Tailwind classes
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
}
const deductionKardex = new DeductionKardex();
export { deductionKardex };
