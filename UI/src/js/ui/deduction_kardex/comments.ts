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
import { FabricComment } from "../../schema";
import { DeductionKardexEvents } from "./deduction_kardex";

export class Comments {
  columns: (ColumnsConfig & { data: keyof FabricDeduction })[];
  table_element: HTMLTableElement;
  table: Api<FabricComment>;
  fabric: Fabric;
  modalDialog: ModalDialog;

  edit_action_btn: HTMLButtonElement;
  delete_action_btn: HTMLButtonElement;

  actionOverlay: ActionOverlay;
  overlay_action_container: HTMLDivElement;

  commentForm: CommentForm;

  resolve_promise?: (result: { fabric?: Fabric }) => void;

  events: TypedEventEmitter<DeductionKardexEvents>;

  // public events = new TypedEventEmitter<DeductionKardexEvents>();

  constructor(events: TypedEventEmitter<DeductionKardexEvents>) {
    this.events = events;
    this.create_dialog();
    this.init_columns();
    this.init_table();
    this.commentForm = new CommentForm();
  }

  body(): HTMLElement {
    let wrapper = createElementFromHTML(`
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

    this.table_element = wrapper.querySelector("table");
    // this.tbody = this.table_element.querySelector("tbody");

    return wrapper;
  }

  title() {
    return createElementFromHTML(`

  <div class="flex justify-between"> 

  <h2>Comentarios</h2>

  </div>
				 `);
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

  init_columns() {
    //@ts-ignore
    this.columns = [
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
      confirmText: "Nuevo Comentario",
      confirmClass: "btn",
      footerContainer_tailwind_class: "flex justify-left",

      onCancel: () => {
        this.close();
      },
      onConfirm: () => {
        this.openFormCreating();
      },

      onClose: () => {},
    });
  }

  async openFormCreating() {
    let data: { comment: FabricComment; fabric: Fabric } | null =
      await this.commentForm.open(this.fabric, "creating");
    if (data == null) {
      return;
    }

    this.events.emit("comment:edited", data.fabric, data.comment);
    this.table.row.add(data.comment);
    this.table.draw(false);
  }

  async OpenFormEditing() {
    await this.commentForm.open(this.fabric, "editing");
  }

  async show(fabric: Fabric) {
    return new Promise<{
      fabric?: Fabric;
    }>((resolve) => {
      this.fabric = fabric;
      this.resolve_promise = resolve;
      this.modalDialog.show();

      this.table.rows.add(fabric.comments);
      this.table.draw(false);
    });
  }

  close() {
    this.modalDialog.close();
    this.table.data().clear();
    this.table.draw();
  }
}

class CommentForm {
  fabric: Fabric;
  mode: ModalState;
  modalDialog: ModalDialog;

  header: HTMLHeadingElement;
  comment_input: HTMLInputElement;
  err_message: HTMLParagraphElement;

  fabricComment?: FabricComment;
  resolve_promise?: (
    result: { comment: FabricComment; fabric: Fabric } | null,
  ) => void;

  constructor() {
    this.create_dialog();
  }

  title(): string {
    return `Comentarios`;
  }

  body(): HTMLElement {
    const htmlString = `
      <div class="flex flex-col gap-4 p-2">
        <h3 id="comment-header" class="text-lg font-bold text-gray-800">
          Agregar un nuevo comentario
        </h3>
        <input 
          id="comment-input" 
          type="text" 
          placeholder="Escribe tu comentario aquí..." 
          class="input input-bordered w-full p-2 border rounded-md"
        />
	<p class="err-message text-red-500"></p>
      </div>
    `;

    // Render template and query internal elements
    const container = createElementFromHTML(htmlString) as HTMLElement;
    this.header = container.querySelector(
      "#comment-header",
    ) as HTMLHeadingElement;
    this.comment_input = container.querySelector(
      "#comment-input",
    ) as HTMLInputElement;
    this.err_message = container.querySelector(
      ".err-message",
    ) as HTMLInputElement;

    this.comment_input.addEventListener("focus", () => {
      this.err_message.textContent = "";
    });

    return container;
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
      confirmText: "Nuevo Comentario",
      confirmClass: "btn",
      footerContainer_tailwind_class: "flex justify-left",

      onCancel: () => {
        this.close();
      },
      onConfirm: () => {
        this.submit();
      },

      onClose: () => {
        this.clear();
      },
    });
  }

  open(fabric: Fabric, mode: ModalState, fabricComment?: FabricComment) {
    return new Promise<{ comment: FabricComment; fabric: Fabric } | null>(
      (resolve) => {
        this.fabric = fabric;
        this.mode = mode;
        this.fabricComment = fabricComment;
        this.resolve_promise = resolve;

        if (mode == "editing") {
          this.comment_input.value = fabricComment.comment;
        }

        this.modalDialog.show();
      },
    );
  }

  close() {
    this.modalDialog.close();
    this.comment_input.value = "";
  }

  clear() {
    this.comment_input.value = "";
    this.err_message.textContent = "";
  }

  validate() {
    const value = this.comment_input.value.trim();
    if (value === "") {
      this.err_message.textContent = "El comentario no puede estar vacio";
      return null;
    }

    if (this.mode == "editing" && value == this.fabricComment.comment) {
      this.err_message.textContent = "El comentario no ha cambiado";
      return null;
    }

    if (value === "") {
      this.err_message.textContent = "El comentario no puede estar vacio";
      return null;
    }

    return value;
  }

  submit() {
    let value = this.validate();
    if (value == null) {
      return;
    }

    if (this.mode == "creating") {
      this.new_comment();
    }

    if (this.mode == "editing") {
      // this.
    }
  }
  async new_comment() {
    let value = this.validate();
    if (!value) {
      return;
    }

    let fabricComment: FabricComment = {
      comment: value,
      fabric_id: this.fabric.id,
    };

    let res = await CoreAPI.fabricComment_new(fabricComment);

    if (res.success) {
      this.close();
      this.resolve_promise(res.data);
    }
  }
  async update_comment() {
    let value = this.validate();
    if (!value) {
      return;
    }

    let partial_payload: FabricComment = {
      comment: value,
    };

    let res = await CoreAPI.fabricComment_update(
      partial_payload,
      this.fabric.id,
    );

    if (res.success) {
      this.close();
    }
  }
}
