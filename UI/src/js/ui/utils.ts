import { CatalogApi } from "../api/catalog.ts";
import { CoreAPI } from "../api/core.ts";
import { Fabric, Tube } from "../schema.ts";

import { Api, ColumnsConfig } from "datatables.net-dt";
import { FabricData, TableView, TubeExtraD as TubeExtraD, ViewMode } from "../typeObj.ts";
import { TypedEventEmitter } from "../emitter.ts";

import DataTable from "datatables.net-dt";

import "datatables.net-dt/css/dataTables.dataTables.css";


export function column<T>(data:keyof T, title, extra, group:ViewMode) {
  let col: ColumnsConfig & { data: keyof T } = {
    data: data,
    name: data as string, // <--- Add this line!
    title: title,
    group: group,
    visible: false,
    defaultContent: "",
  };
  if (extra) {
    col = { ...col, ...extra };
  }
  return col;
}

export function tcolumn(data, title, extra?) {
  return column<Tube>(data, title, extra, "tube");
}

export function fcolumn(data, title, extra?) {
  return column<Fabric>(data, title, extra, "fabric");
}

export function fabricDataColumn(data, title, extra?) {
  return column<FabricData>(data, title, extra, "fabric");
}


interface DialogOptions {
  header: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
}

/**
 * Displays the confirmation dialog and resolves with `true` on confirm or `false` on cancel.
 */
export function showRecycleDialog(options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // 1. Get element references
    const dialog = document.getElementById("dialog-recycle") as HTMLDialogElement | null;
    const headerEl = document.getElementById("dialog-header");
    const messageEl = document.getElementById("dialog-recycle-message");
    const cancelBtn = document.getElementById("dialog-recycle-cancel-btn");
    const confirmBtn = document.getElementById("dialog-recycle-accept-btn");

    if (!dialog || !headerEl || !messageEl || !cancelBtn || !confirmBtn) {
      console.error("Dialog elements not found in the DOM.");
      resolve(false);
      return;
    }

    // 2. Populate text content
    headerEl.textContent = options.header;
    messageEl.textContent = options.message;

    if (options.cancelText) {
      cancelBtn.textContent = options.cancelText;
    }
    if (options.confirmText) {
      confirmBtn.textContent = options.confirmText;
    }

    // 3. Event handlers
    const handleConfirm = (e: MouseEvent) => {
      e.preventDefault(); // Prevent form default behavior if needed
      cleanup();
      dialog.close();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      dialog.close();
      resolve(false);
    };

    // Handle closing via ESC key or backdrop click
    const handleClose = () => {
      cleanup();
      resolve(false);
    };

    // 4. Attach temporary listeners
    confirmBtn.addEventListener("click", handleConfirm);
    cancelBtn.addEventListener("click", handleCancel);
    dialog.addEventListener("close", handleClose, { once: true });

    function cleanup() {
      confirmBtn?.removeEventListener("click", handleConfirm);
      cancelBtn?.removeEventListener("click", handleCancel);
    }

    // 5. Open native modal dialog
    dialog.showModal();
  });
}
