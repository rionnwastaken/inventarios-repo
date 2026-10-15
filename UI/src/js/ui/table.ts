import { Api, ColumnsConfig, Options } from "datatables.net-dt";

import DataTable from "datatables.net-dt";
import "datatables.net-select-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";
import "datatables.net-select-dt/css/select.dataTables.css";
import { ActionOverlay } from "./misc/ActionOverlay";

export abstract class Table {
  table_element: HTMLTableElement;
  table: Api<unknown>;
  tbody: HTMLTableElement;

  overlay_container: HTMLDivElement;
  actionOverlay: ActionOverlay;

  constructor() {
    this.actionOverlay = new ActionOverlay({
      container: this.create_action_overlay(),
    });
  }

  default_options(): Options {
    return {
      columns: this.init_columns(),
      paging: false,
      autoWidth: true,
      info: false,
      searching: true,
      order: { name: "updated_at", dir: "desc" },
      select: {
        blurable: true,
      },
      columnDefs: [
        {
          targets: "_all",
          className: "dt-left",
        },
      ],
    };
  }

  init(tbl_element: HTMLElement | string, userOptions: Options = {}): void {
    const baseOptions = this.default_options();

    const finalOptions: Options = {
      ...baseOptions,
      ...userOptions,
      // For arrays/objects that need explicit merging rather than replacement:
      columnDefs: [
        ...(baseOptions.columnDefs || []),
        ...(userOptions.columnDefs || []),
      ],
    };

    this.table = new DataTable(tbl_element, finalOptions);

    this.actionOverlay.init(this.table);
    this.bind_row_click();
  }

  bind_row_click() {
    this.table
      .table()
      .body()
      .addEventListener("click", async (event) => {
        this.actionOverlay.handle_row_click(event);
      });
  }

  clear() {
    this.table.data().clear();
    this.table.draw();
  }

  abstract create_action_overlay(): HTMLDivElement;
  abstract init_columns(): ColumnsConfig[];
}
