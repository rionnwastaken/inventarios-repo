import { Api, ApiRowMethods } from "datatables.net-dt";
type cb_row_2clicks_type = (
  data: any,
  selected_row: ApiRowMethods<any> | null,
) => Promise<void> | void;
export class ActionOverlay {
  container: HTMLDivElement;
  cb_samerow_2clicks: cb_row_2clicks_type;
  selected_row: ApiRowMethods<any> | null;
  table: Api<any>;
  tbody: HTMLElement;

  constructor(data: {
    container: HTMLDivElement;
    table: Api<any>;
    cb_samerow_2clicks: cb_row_2clicks_type;
  }) {
    this.container = data.container;
    this.table = data.table;
    this.tbody = this.table.table().node().querySelector("tbody");
    this.cb_samerow_2clicks = data.cb_samerow_2clicks;
    this.select_blur_clear_actions_after_clicking_anywhere_else();
  }

  public update_row_actions_overlay(row: ApiRowMethods<any>) {
    this.remove_actions_overlay();
    this.render_actions_overlay(row);
  }

  public render_actions_overlay(row: any) {
    let node = row.node();
    let lastCell = node.cells[node.cells.length - 1];

    if (!lastCell) return;

    lastCell.classList.add("relative");

    lastCell.appendChild(this.container);
  }

  public remove_actions_overlay() {
    if (this.container.parentElement) {
      this.container.parentElement.classList.remove("relative");
      this.container.remove();
    }
  }

  public handle_row_click(event) {
    setTimeout(async () => {
      log.debug("actionOverlay:handle_row_click");
      const row_el = event.target.closest("tr");
      let row: ApiRowMethods<any>;
      let data: any = null;

      if (row_el && this.tbody.contains(row_el)) {
        row = this.table.row(row_el);
        data = row.data();
      }
      if (data == null) {
        log.debug("click row undefined");
        return;
      }

      const hasMoreThanOneSelected = this.table.rows(".selected").count() > 1;
      if (hasMoreThanOneSelected) {
        this.selected_row = null;
        this.remove_actions_overlay();
        log.debug("More than one row is selected.");
        return;
      }

      this.update_row_actions_overlay(row);
      if (this.selected_row == null) {
        log.debug("Assing row", row);
        this.selected_row = row;
        return;
      }

      if (data == this.selected_row.data()) {
        this.selected_row = null;
        log.debug("type of this shit is ", typeof this.cb_samerow_2clicks);
        await this.cb_samerow_2clicks(data, row);
        return;
      }
      this.selected_row = row;
    }, 0);
  }

  select_blur_clear_actions_after_clicking_anywhere_else() {
    this.table.on("select-blur", () => {
      this.remove_actions_overlay();
      this.selected_row = null;
    });
  }

  public clear_selected_row() {
    this.selected_row = null;
  }
}
