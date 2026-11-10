import {
  Fabric,
  ModalState,
  FabricDeduction,
  Tube,
  CatalogItemCount,
  CatalogItem,
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

import { TypedEventEmitter } from "../../emitter";
import { CoreAPI } from "../../api/core";
import { CatalogEditorTable } from "./table";
import { CatalogApi } from "../../api/catalog";
import TomSelect from "tom-select";
import { shortLivedDialog } from "../shortLiveDialog";

const title_catalago_id = "title-catalago-text-id";
const initial_measurement_container_id = "initial-measurement-container";
const fabric_available_percent = "fabric_available_percent";

export interface CatalogEditorEvents {
  "item:updated": (data: CatalogItem, table_name: String) => void;
  "item:deleted": (data: CatalogItem, table_name: String) => void;
  "item:renamed": (data: CatalogItem, table_name: String) => void;
  "item:replaced": (data: CatalogItem, table_name: String) => void;
}

class CatalogEditor {
  table_element: HTMLTableElement;
  table: Api<CatalogItemCount>;
  modalDialog: ModalDialog;
  catalogEditorTable: CatalogEditorTable;

  renameForm: RenameForm;
  replaceForm: ReplaceForm;

  public events = new TypedEventEmitter<CatalogEditorEvents>();

  goback: HTMLButtonElement;
  tom: TomSelect;

  edit_catalog_btn: HTMLButtonElement;

  constructor() {}
  init() {
    this.edit_catalog_btn = document.querySelector("#edit-catalago-btn");

    this.edit_catalog_btn.addEventListener("click", () => {
      log.debug("click burv");
      this.show();
    });

    this.replaceForm = new ReplaceForm();
    this.renameForm = new RenameForm();

    const a_tw = "min-w-7xl min-h-5xl";
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      width: "w-full min-w-7xl", // Custom Tailwind classes
      container_tailwind_class: a_tw,
      height: "h-auto max-h-[80vh]",

      showConfirm: false,
      cancelText: "Cerrar",

      onClose: async () => {
        // this.table.data().clear();
      },
    });

    this.catalogEditorTable = new CatalogEditorTable({
      on_delete: async (data: CatalogItemCount, row) => {
        await this.delete(data, row);
      },
      on_rename: async (data: CatalogItemCount, row) => {
        await this.rename(data, row);
      },
      on_replace: async (data: CatalogItemCount, row) => {
        await this.replace(data, row);
      },
    });

    this.catalogEditorTable.init(this.table_element, {
      searching: true,
    });
    this.table = this.catalogEditorTable.table;
  }

  show() {
    this.modalDialog.show();
  }

  async delete(data: CatalogItemCount, row) {
    //TODO
    shortLivedDialog.titleContainer.textContent = `Seguro que quieres eliminar el articulo ${data.name}?.Las telas vinculadas al articulos seran desvinculadas`;
    let user_confirmed = await shortLivedDialog.open();

    if (user_confirmed == false) {
      return;
    }

    let table_name = this.tom.getValue() as string;
    let res = await CatalogApi.item_delete(data.id, table_name);

    if (!res.success) {
      log.debug(res.data);
      return;
    }

    state.catalagoData.remove_by_id(table_name, data.id);
    row.remove();
    this.table.draw();
    this.events.emit("item:deleted", res.data, table_name);
  }

  async rename(data: CatalogItemCount, row) {
    let table_name = this.tom.getValue() as string;
    let value = await this.renameForm.open(data);

    if (value == null || value == "") {
      return;
    }

    let res = await CatalogApi.item_rename(data.id, value, table_name);

    if (res.status == 409) {
      shortLivedDialog.titleContainer.textContent = `Error: No se pudo renombrar el articulo ya que otro articulo existe con el nombre ${value} `;
      await shortLivedDialog.show();
      return;
    }
    if (!res.success) {
      log.debug(res.data);
      return;
    }
    row.data(res.data);
    this.table.draw(false);

    state.catalagoData.replace_by_id(table_name, data.id, res.data);
    this.events.emit("item:renamed", res.data, table_name);
  }

  async replace(data: CatalogItemCount, row) {
    let table_name = this.tom.getValue() as string;
    let new_item = await this.replaceForm.open(data, table_name);

    if (new_item == null) {
      return;
    }

    log.debug("sending data ", data.id, new_item.id, table_name);

    let previous_id = data.id;
    let res = await CatalogApi.item_replace(
      previous_id,
      new_item.id,
      table_name,
    );

    if (!res.success) {
      log.debug(res.data);
      return;
    }

    state.catalagoData.remove_by_id(table_name, previous_id);

    this.events.emit("item:replaced", res.data, table_name);
    row.remove();
    this.table.draw();
  }

  title(): HTMLElement {
    let el = createElementFromHTML(`

  <div class="flex"> 
   <h2>Editor de catalago</h2>
</div>

`);

    return el;
  }

  body(): HTMLElement {
    let e = createElementFromHTML(`

    <div> 

      <select
        class="w-full"
      ></select>

        <table id='duduction-table' class="display"> 
            <thead></thead>
            <tbody></tbody>
        </table>
    </div>

`);
    this.table_element = e.querySelector("table");
    this.tom = new TomSelect(e.querySelector("select"), {
      onChange: (value) => {
        log.debug("changed to ", value);
        this.update_table_data(value);
      },
    });
    return e;
  }

  update_table_data(table_name: string) {
    if (table_name == "") {
      return;
    }
    this.table.clear();
    this.table.rows.add(state.catalagoData.data[table_name]);
    this.table.draw();
  }

  //TODO implement getting in backedn
  async get_catalago_table_names() {
    let res = await CatalogApi.get_catalago_table_names();
    for (let [table_name, display_name] of Object.entries(res.data)) {
      this.tom.addOption({ value: table_name, text: display_name });
    }

    this.tom.setValue(Object.keys(res.data)[0]);
  }

  async init_table_with_catalago_data() {
    await this.get_catalago_table_names();
    let table_name = this.tom.getValue() as string;
    let data = state.catalagoData.data[table_name];

    this.update_table_data(table_name);
  }

  close() {
    this.catalogEditorTable.clear();
    this.modalDialog.close();
  }
}

class ReplaceForm {
  modalDialog: ModalDialog;

  resolve_promise?: (result: CatalogItem | null) => void;
  err_message: HTMLParagraphElement;
  tom: TomSelect;
  catalogItem: CatalogItem;

  constructor() {
    const a_tw = "min-w-7xl min-h-5xl";
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      container_tailwind_class: a_tw,
      cancelText: "No Guardar",
      confirmText: "Guardar",
      confirmClass: "btn",
      footerContainer_tailwind_class: "flex justify-left",

      onCancel: () => {
        this.resolve_promise(null);
        return true;
      },
      onConfirm: () => {
        let id = this.tom.getValue() as string;

        if (id == null) {
          this.err_message.textContent = "El campo no puede estar vacio";
          return false;
        }

        let obj = this.tom.options[id];

        log.debug("id and obj here in replace form", id, obj);
        this.resolve_promise({
          id: obj.value,
          name: obj.text,
          table_name: this.catalogItem.table_name,
        });
        return true;
      },

      onClose: () => {
        this.clear();
      },
    });
  }

  title(): string {
    return `Remplazar Articulo`;
  }

  body(): HTMLElement {
    const e = createElementFromHTML(`
      <div class="flex flex-col gap-4 p-2">
          <p class="err-message text-red-500"> </p>
          <select
            class="w-full input-lowercase"
          ></select>
      </div>
    `);
    this.err_message = e.querySelector(".err-message");
    this.tom = new TomSelect(e.querySelector("select"), {
      maxItems: 1,
      create: false,
      refreshThrottle: 0,

      onBlur: () => {
        this.err_message.textContent = "";
      },
    });

    return e;
  }

  open(catalogItem: CatalogItemCount, table_name: string) {
    return new Promise<CatalogItem | null>((resolve) => {
      this.resolve_promise = resolve;
      this.setTomData(table_name);
      this.modalDialog.show();
      this.catalogItem = catalogItem;

      this.tom.removeOption(catalogItem.id);
    });
  }

  clear() {
    this.tom.clear();
    this.err_message.textContent = "";
  }

  setTomData(table_name: string) {
    log.debug("tablen name ", table_name);
    let data = state.catalagoData.data[table_name];
    data.forEach((item) => {
      let display = item.name ? item.name : item.id;
      this.tom.addOption({ value: item.id, text: display });
    });

    this.tom.refreshOptions();
    this.tom.close();
  }
}

class RenameForm {
  modalDialog: ModalDialog;
  resolve_promise?: (result: String | null) => void;
  err_message: HTMLParagraphElement;
  catalogItem: CatalogItem;
  input: HTMLInputElement;

  item_data_p: HTMLParagraphElement;

  constructor() {
    const a_tw = "w-fit min-h-5xl";
    this.modalDialog = new ModalDialog({
      title: this.title(),
      body: this.body(),
      container_tailwind_class: a_tw,
      cancelText: "No Guardar",
      confirmText: "Guardar",
      confirmClass: "btn",
      footerContainer_tailwind_class: "flex justify-left",

      onCancel: () => {
        this.resolve_promise(null);
        return true;
      },
      onConfirm: () => {
        let value = this.input.value;

        if (value == "" || value == null) {
          this.err_message.textContent = "El campo no puede estar vacio";
          return false;
        }

        this.resolve_promise(value);
        return true;
      },

      onClose: () => {
        this.clear();
      },
    });
  }

  title() {
    let e = createElementFromHTML(`

        <div> 
            <div>Renombrar Articulo </div>
            <p class="item-data"></p>
        </div>
`);

    this.item_data_p = e.querySelector(".item-data");
    return e;
  }

  body(): HTMLElement {
    const e = createElementFromHTML(`
      <div class="flex flex-col gap-4 p-2">
          <p class="err-message text-red-500"> </p>
           <p>Nuevo nombre:</p>
        <input class="input"> </input>

      </div>
    `);
    this.err_message = e.querySelector(".err-message");
    this.input = e.querySelector("input");

    return e;
  }

  open(catalogItem: CatalogItemCount) {
    return new Promise<String | null>((resolve) => {
      this.resolve_promise = resolve;
      this.modalDialog.show();
      this.catalogItem = catalogItem;

      this.item_data_p.textContent = `Nombre actual: ${catalogItem.name}`;
    });
  }

  clear() {
    this.input.value = "";
    this.err_message.textContent = "";
  }
}

const catalogEditor = new CatalogEditor();
export { catalogEditor };
