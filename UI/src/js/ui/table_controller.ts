import { CatalogApi } from "../api/catalog.ts";
import { CoreAPI } from "../api/core.ts";
import { Fabric, Tube } from "../schema.ts";

import { Api, ColumnsConfig } from "datatables.net-dt";
import { TableView, TubeExtraD as TubeExtraD, ViewMode } from "../typeObj.ts";
import { TypedEventEmitter } from "../emitter.ts";

import DataTable from "datatables.net-dt";

import "datatables.net-dt/css/dataTables.dataTables.css";
import { column, fcolumn, tcolumn } from "./utils.ts";
import { state } from "../state.ts";
import { render_datecell, render_plain2 } from "./renderUtils.ts";
//TODO ON TUBO ADD BUTTON, add tube to table and refresh it
//TODO WHEN A NEW FABRIC IS ADDED, MAKE SURE IT IS REFLECTED IN THE VIEW, so it increments in tota lof the tube

const tbody = document.querySelector("#myTable tbody");

type TubeColumns = ColumnsConfig & { data: keyof Tube };

export interface TableControllerEvents {
  // "row:dblclick": (tube_data: TubeExtraD, fabrics: Fabric[]) => void;
  "tube:dblclick": (tube_data: TubeExtraD) => void;
  "fabric:dblclick": (fabric: Fabric) => void;
}

class TableController {
  table: Api<TubeExtraD | Fabric>;
  fabricColumns: (ColumnsConfig & { data: keyof Tube })[];
  public events = new TypedEventEmitter<TableControllerEvents>();

  constructor() {
    this.init_columns();
    this.init_table();
    this.init_visible_group();
    this.init_bindings();
  }

  init_columns() {
    let tubeColumns = [
      ["id", "Tubo ID"],
      ["fabric_count", "Cantidad Telas"],
      ["location_id", "Ubicacion ID"],
      ["rectified", "Retificado"],
    ];

    this.fabricColumns = [
      ...tubeColumns.map(([id, title]) =>
        column(
          id,
          title,
          {
            render: (data, type, row, meta) =>
              render_plain2(data, type, row, meta, id),
          },
          "tube",
        ),
      ),
      column(
        "updated_at",
        "Ultima actualizacion",
        {
          render: (data, type, row, meta) =>
            render_datecell(data, type, row, meta, "updated_at"),
        },
        "tube",
      ),

      // Fabric columns
      fcolumn("id", "Fabric"),
    ];
  }

  init_table() {
    this.table = new DataTable("#myTable", {
      columns: this.fabricColumns,
      ajax: this.load_data,
      paging: false,
      autoWidth: true,

      order: { name: "tube_updated_at", dir: "desc" },
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
    this.bind_row_click();
    this.bind_row_double_click();
  }

  bind_row_click() {
    // Listen for clicks
    tbody.addEventListener("click", (event) => {
      const row = event.target.closest("tr");

      // Ensure click is inside a valid row
      if (row && tbody.contains(row)) {
        // Get row data via DataTables API
        const rowData = this.table.row(row).data();
        // console.log("Clicked row data:", rowData);
      }
    });
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
          this.events.emit("tube:dblclick", data as TubeExtraD);
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
      const v = config && config.group === view.new_view;
      this.visible(v);
    });
  }

  init_visible_group() {
    this.table.columns().every(function () {
      const config = this.init();
      const isTubeGroup = config && config.group === "tube";
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
