import { ItemState } from "../typeObj";

export function render_plain(
  obj: any,
  type,
  row,
  meta,
  column_id,
  cb_format?: (string) => string,
) {
  // log.debug("fabricdata in redenr cell", fabricData);
  if (type === "display") {
    let original_value = obj?.original_fabric?.[column_id] ?? "";
    let modified_value = obj?.modified_fabric?.[column_id] ?? null;

    if (cb_format) {
      original_value = cb_format(original_value);
      modified_value = cb_format(modified_value);
    }

    if (modified_value) {
      return getDiffValue(original_value, modified_value, "");
    }

    return original_value;
  }
}

export function render_plain2(
  obj: any,
  type,
  row,
  meta,
  column_id,
  cb_format?: (string) => string,
) {
  // log.debug("fabricdata in redenr cell", fabricData);
  if (type === "display") {
    let value = obj?.[column_id] ?? "";
    if (cb_format) {
      value = cb_format(value);
    }
    return value;
  }
}

export function format_measurement(value) {
  if (!value) {
    return "";
  }
  return `${value} mts`;
}

export function render_datecell(
  data: Object,
  type,
  row,
  meta,
  column_name: string,
) {
  let value = data[column_name];
  if (type === "display") {
    const date = new Date(value);
    return date.toLocaleString("es-MX", { hour12: true });
  }

  if (type == "sort") {
    return new Date(value).getTime();
  }

  return data;
}

export function getDiffValue(
  original_value,
  modified_value,
  mode: ItemState,
): string {
  if (mode == "normal" || mode == "created") {
    return original_value;
  }

  if (original_value === modified_value) {
    log.debug(`Showing orignal value ${original_value}}`);
    return original_value;
  }

  log.debug(`Render comparison ${original_value} ${original_value}`);
  return `
        <div class="flex flex-col justify-center leading-tight py-0.5 text-xs font-mono">
            <span class="text-red-600 dark:text-red-400 line-through decoration-red-500 decoration-1 opacity-80 select-none">
                ${original_value}
            </span>
            <span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                ${modified_value}
            </span>
        </div>
    `;
}
