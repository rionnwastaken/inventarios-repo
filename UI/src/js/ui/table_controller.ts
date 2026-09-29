import { CatalogApi } from "../api/catalog.ts";
import { CoreAPI } from "../api/core.ts";
import { Tube } from "../schema.ts";
import { Fabric } from "../typeObj.ts";

import { Api, ColumnsConfig } from "datatables.net-dt";
import { TableView, Tube as Tube, ViewMode } from "../typeObj.ts";
import { TypedEventEmitter } from "../emitter.ts";

import DataTable from "datatables.net-dt";

import "datatables.net-dt/css/dataTables.dataTables.css";
import {
  column,
  column2,
  fabricColumn,
  fcolumn,
  inspect_row,
  num,
  RenderingInfo,
  tcolumn,
  tubeColumn,
} from "./utils.ts";
import { state } from "../state.ts";
import { render_datecell, render_plain2 } from "./renderUtils.ts";
import { fabric_catalago_title_id, tube_title_id } from "./misc.ts";
//TODO ON TUBO ADD BUTTON, add tube to table and refresh it
//TODO WHEN A NEW FABRIC IS ADDED, MAKE SURE IT IS REFLECTED IN THE VIEW, so it increments in tota lof the tube

const tbody = document.querySelector("#myTable tbody");

type TubeColumns = ColumnsConfig & { data: keyof Tube };

export interface TableControllerEvents {
  // "row:dblclick": (tube_data: TubeExtraD, fabrics: Fabric[]) => void;
  "tube:dblclick": (tube_data: Tube) => void;
  "fabric:dblclick": (fabric: Fabric) => void;
}

class TableController {
  table: Api<Tube | Fabric>;
  columns: (ColumnsConfig & { data: keyof Tube })[];
  public events = new TypedEventEmitter<TableControllerEvents>();

  constructor() {
    this.init_columns();
    this.init_table();
    this.init_visible_group();
    this.init_bindings();
  }

  init_columns() {
    const tube_columns = [
      ...tube_title_id.map(([column_name, id]) =>
        tubeColumn({
          id: id,
          column_name: column_name,
          rendering_func: render_plain2,
        }),
      ),
    ];

    const fabric_columns = [
      ...fabric_catalago_title_id.map(([column_name, schema_column_name]) =>
        fabricColumn({
          id: `${schema_column_name}_id`,
          column_name: column_name,
          rendering_func: render_plain2,
          format_func: (id) => {
            let value = state.catalagoData.catalagoValue(
              schema_column_name,
              id,
            );
            return value;
          },
        }),
      ),

      column2({
        id: "",
        column_name: "Medidas Entrada",
        group: "fabric",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as Fabric;
          return `${data.original_width} x ${data.original_height} mts`;
        },
      }),

      column2({
        id: "",
        column_name: "% Restante",
        group: "fabric",
        rendering_func: (info: RenderingInfo) => {
          let data = info.data as Fabric;
          return `${data.remaining_percent}`;
        },
      }),
    ];

    const shared_columns = [
      column2({
        id: "updated_at",
        column_name: "Ultima actualizacion",
        rendering_func: render_datecell,
        group: "both",
      }),
      column2({
        id: "created_at",
        column_name: "Creado en",
        rendering_func: render_datecell,
        group: "both",
      }),
    ];

    this.columns = [...tube_columns, ...fabric_columns, ...shared_columns];
  }

  init_table() {
    this.table = new DataTable("#myTable", {
      columns: this.columns,
      ajax: this.load_data,
      paging: false,
      autoWidth: true,

      order: { name: "updated_at", dir: "desc" },
      columnDefs: [
        {
          targets: "_all", // Zero-based index of the columns you want to left-align
          className: "dt-left", // Applies left-alignment to both header and body cells
        },
      ],
    });
  }

  async load_data(data, cb, settings) {
    try {
      let res = await CoreAPI.recentTubes();

      if (res.success) {
        state.tableData.tubes = res.data.tubes;
        state.tableData.fabrics = res.data.fabrics;
        state.tableData.size = res.data.size;

        log.debug("Data loaded in main table ", res.data);

        cb({
          data: state.tableData.tubes,
        });
      }
    } catch (error) {
      console.error("Fetch failed:", error);
    }
  }

  init_bindings() {
    inspect_row(tbody, this.table);
    this.bind_row_double_click();
  }

  bind_row_double_click() {
    // Listen for clicks
    tbody.addEventListener("dblclick", (event) => {
      const row = event.target.closest("tr");

      // Ensure click is inside a valid row
      if (row && tbody.contains(row)) {
        // Get row data via DataTables API
        const data = this.table.row(row).data();

        if (data == undefined) {
          log.debug("Double click row undefined");
          return;
        }

        log.debug(`Data of row `, data);
        if (state.active_view == "tube") {
          log.info("Double click on tube");
          let tube = state.tableData.tubes.find((el) => el.id == data.id);
          this.events.emit("tube:dblclick", tube as Tube);
          return;
        }

        if (state.active_view == "fabric") {
          log.info("Double click on Fabric");
          this.events.emit("fabric:dblclick", data as Fabric);
          return;
        }
        log.error(
          `Active view is neither fabric nor tube, that should not have happened, data is ${data}`,
        );
      }
    });
  }

  cb_toggle_group_colums(view: TableView) {
    console.log("called?");
    this.table.columns().every(function () {
      const config = this.init();
      const v =
        config && (config.group === view.new_view || config.group === "both");
      this.visible(v);
    });

    this.table.data().clear();
    this.insert_data_to_table(view.new_view);
    this.table.draw();
  }

  insert_data_to_table(mode: ViewMode) {
    if (mode == "tube") {
      this.table.rows.add(state.tableData.tubes);
    }

    if (mode == "fabric") {
      this.table.rows.add(state.tableData.fabrics);
    }
  }

  init_visible_group() {
    this.table.columns().every(function () {
      const config = this.init();
      const isTubeGroup =
        config && (config.group === "tube" || config.group === "both");
      this.visible(isTubeGroup);
    });
  }

  cb_insert_tube_to_table(tube: Tube) {
    log.debug("cb_insert_tube_to_table(fabric:Tube), data", tube);
    if (!tube) {
      log.error("Tube is undefined ");
      return;
    }
    this.table.row.add(tube);
    this.table.draw();
  }
}

const tableController = new TableController();
export { tableController };
