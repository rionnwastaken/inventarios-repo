import { CatalogApi } from "../api/catalog.ts";
import { CoreAPI } from "../api/core.ts";
import { Tube } from "../schema.ts";
import { Fabric } from "../typeObj.ts";

import { Api, ColumnsConfig } from "datatables.net-dt";
import { FabricData, TableView, Tube as Tube, ViewMode } from "../typeObj.ts";
import { TypedEventEmitter } from "../emitter.ts";

import { getLogger } from "loglevel";

import DataTable from "datatables.net-dt";

import "datatables.net-dt/css/dataTables.dataTables.css";

export function column(id: any, title, extra, group?: ViewMode) {
  console.log(`Name is ${group}_${title}`);

  let group_string = "";
  if (group) {
    group_string = `${group}_`;
  }

  let col: ColumnsConfig = {
    data: null,
    name: `${id}` as string, // <--- Add this line!
    title: title,
    group: group,
    // visible: false,
    defaultContent: "",
  };
  if (extra) {
    col = { ...col, ...extra };
  }
  return col;
}

export interface RenderingInfo<TData = any, TRow = any> {
  data: any;
  type: string;
  row: any;
  meta: any;
  column_id: string;
  column_name: string;
  format_func?: (value: any, data: any) => string;
}
export interface ColumnOptions<TData = any> {
  id: string;
  column_name: string;
  rendering_func: (info: RenderingInfo) => string;
  extra?: Record<string, any>;
  group?: ViewMode;
  format_func?: (value: any, data: TData) => string;
}

export function column2(opts: ColumnOptions, block_rendering?: () => boolean) {
  let col: ColumnsConfig = {
    data: null,
    name: `${opts.id}` as string, // <--- Add this line!
    title: opts.column_name,
    group: opts.group,
    defaultContent: "",
    render(data, type, row, meta) {
      if (block_rendering?.()) {
        return;
      }

      return opts.rendering_func({
        data: data,
        type: type,
        row: row,
        meta: meta,
        column_id: opts.id,
        column_name: opts.column_name,
        format_func: opts.format_func,
      });
    },
  };
  if (opts.extra) {
    col = { ...col, ...opts.extra };
  }
  return col;
}
import { state } from "../state.ts";

export function tubeColumn(opts: ColumnOptions) {
  opts.group = "tube";
  return column2(opts, () => {
    return state.active_view != "tube";
  });
}
export function fabricColumn(opts: ColumnOptions) {
  opts.group = "fabric";
  return column2(opts, () => {
    return state.active_view != "fabric";
  });
}

export function fabricDataColumn(data, title, extra?) {
  return column(data, title, extra, "fabric");
}

interface DialogOptions {
  header: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
}

/*
Get only the data that is different from the old object
*/
export function get_partial_data(
  fabric_old: Record<string, any>,
  fabric_new: Record<string, any>,
  options?: {
    omitKeys?: string[];
    onlyKeys?: string[];
  },
) {
  const omitKeys = options?.omitKeys;
  const onlyKeys = options?.onlyKeys;

  // Mutual exclusion check
  if (omitKeys && onlyKeys) {
    throw new Error(
      "Cannot specify both 'omitKeys' and 'onlyKeys' simultaneously.",
    );
  }

  const partial_data: Record<string, any> = {};

  // Determine keys to evaluate
  const keysToProcess = onlyKeys
    ? new Set(onlyKeys)
    : new Set([...Object.keys(fabric_old), ...Object.keys(fabric_new)]);

  for (const key of keysToProcess) {
    if (omitKeys?.includes(key)) {
      continue;
    }

    const oldValue = fabric_old[key];
    const newValue = fabric_new[key];

    if (newValue !== undefined && newValue !== oldValue) {
      partial_data[key] = newValue;
    }
  }

  log.debug("get partial data fabric old is ", fabric_old);
  return partial_data;
}

export function createElementFromHTML<T extends HTMLElement = HTMLElement>(
  htmlString: string,
): T {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString.trim(), "text/html");
  const element = doc.body.firstElementChild;

  if (!element) {
    throw new Error(
      "Failed to create element: Provided string did not contain a valid HTML element.",
    );
  }

  return element as T;
}

export function ObjectChanged(
  original: Object,
  modified: Object,
  ignoredKeys: Set<any>,
): boolean {
  log.debug("Checking  isObjectUnchanged");
  if (!original || !modified) return false;

  const keys = new Set([
    ...Object.keys(original),
    ...Object.keys(modified),
  ]) as Set<any>;

  for (const key of keys) {
    // Skip timestamp/date fields
    if (ignoredKeys.has(key)) continue;

    const origVal = original[key];
    const modVal = modified[key];

    log.debug(
      "Comparing ",
      origVal,
      " and ",
      modVal,
      "and their types are ",
      typeof origVal,
      "and ",
      typeof modVal,
    );

    // Skip comparison if either value is a Date instance
    if (origVal instanceof Date || modVal instanceof Date) continue;

    // Handle nested relationship objects
    if (
      typeof origVal === "object" &&
      origVal !== null &&
      typeof modVal === "object" &&
      modVal !== null
    ) {
      if (JSON.stringify(origVal) !== JSON.stringify(modVal)) {
        return true;
      }
    } else if (origVal !== modVal) {
      return true;
    }
  }

  return false;
}

export function inspect_row(tbody, tbl) {
  tbody.addEventListener("click", (event) => {
    const row = event.target.closest("tr");

    if (row && tbody.contains(row)) {
      const rowData = tbl.row(row).data();
      log.debug(rowData);
    }
  });
}
export function calc_available_cubic_meters(fabric: Fabric) {
  let total = num(fabric.original_width) * num(fabric.original_height);
  log.debug(
    "calc_available_cubic_meters remaining percent " +
      num(fabric.remaining_percent),
    "  total " + total,
  );
  return (num(fabric.remaining_percent) * total) / 100;
}

export function num(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === "number" ? val : parseFloat(val) || 0;
}

export function createPrefixedLogger(name, level = "DEBUG") {
  const logger = getLogger(name);

  const originalFactory = logger.methodFactory;
  logger.methodFactory = function (methodName, logLevel, loggerName) {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);
    return function (...args) {
      rawMethod(`[${loggerName}]`, ...args);
    };
  };

  logger.setLevel(level); // Must re-apply level to rebuild methods with factory
  return logger;
}

export function input_only_allow_numbers(input: HTMLInputElement) {
  input.addEventListener("keydown", (e) => {
    if (["e", "E", "+", "-"].includes(e.key)) {
      e.preventDefault();
    }
  });
}

export function input_allow_numbers_min_max(
  input: HTMLInputElement,
  min: number,
  max: number,
) {
  input.addEventListener("keydown", (e) => {
    // 1. Block standard exponent and sign keys
    if (["e", "E", "+", "-"].includes(e.key)) {
      e.preventDefault();
      return;
    }
    const nextValue = Number(input.value + e.key);
    if (nextValue < min || nextValue > max) {
      e.preventDefault();
    }
  });
}

export class TruthyColorer {
  bg_true: boolean;
  bg_false: boolean;
  el: HTMLElement;

  constructor(bg_true, bg_false, el: HTMLElement) {
    this.bg_true = bg_true;
    this.bg_false = bg_false;
    this.el = el;
  }

  color(state: boolean) {
    let color_add;
    let color_remove;
    if (state) {
      color_add = this.bg_true;
      color_remove = this.bg_false;
    } else {
      color_remove = this.bg_true;
      color_add = this.bg_false;
    }
    this.el.classList.remove(color_remove);
    this.el.classList.add(color_add);
  }
}
