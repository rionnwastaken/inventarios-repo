import { ItemState } from "../typeObj";
import { RenderingInfo } from "./utils";

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

export function render_plain2(info: RenderingInfo) {
  if (info.type === "display") {
    let value = info.data?.[info.column_id] ?? "";
    if (info.format_func) {
      value = info.format_func(value, info.data);
      // log.debug("value here is ", value);
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

const get = (obj: Object, path: string): string => {
  if (!path) {
    log.debug(`Path is undefined and data passes id `, obj, path);
    return "";
  }
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
};

export function render_datecell(info: RenderingInfo) {
  let value = get(info.data, info.column_id);

  // return "h"
  if (info.type === "display") {
    const date = new Date(value);
    // log.debug("data here is ", date);
    return date.toLocaleString("es-MX", { hour12: true });
  }

  if (info.type == "sort") {
    return new Date(value).getTime();
  }

  return info.data;
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

export interface IconOptions {
  src: string;
  id?: string;
  title: string;
  btnClass?: string;
  imgClass?: string;
  svg?: unknown;
}
export function createIconHTML(options: IconOptions): string {
  const {
    src,
    id,
    title,
    btnClass = "w-14 h-14 bg-white hover:bg-slate-200",
    imgClass = "w-4 h-4",
  } = options;

  const idAttr = id ? `id="${id}"` : "";

  // Base layout styles mixed with your custom/override classes
  const fullBtnClasses =
    `flex items-center justify-center rounded-full transition-colors shadow-md active:scale-95 shrink-0 ${btnClass} text-black`.trim();
  const fullImgClasses =
    `pointer-events-none object-contain ${imgClass}`.trim();

  if (options.svg != null) {
    return `
    <button type="button" title="${title}" aria-label="${title}" class="${fullBtnClasses} flex items-center justify-center" ${idAttr}>

    <span class="w-6 h-6">
      ${options.svg}
    </span
    </button>
  `;
  }
  return `
    <button type="button" title="${title}" aria-label="${title}" class="${fullBtnClasses}" ${idAttr}>
      <img src="${src}" alt="" class="" />
    </button>
  `;
}
