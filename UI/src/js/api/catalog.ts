import {sendRequest} from "./api.ts";

// Exported API Module (Guarantees payload is wrapped in an object)
export const CatalogApi = {
  addColor: (colorName: string) =>
    sendRequest("/catalago/colors/add", "POST", { color_name: colorName }),

  removeColor: (colorName: string) =>
    sendRequest("/catalago/colors/remove", "POST", { color_name: colorName }),

  removeBulkColors: (id_colors: Array<number>) =>
    sendRequest("/catalago/colors/bulk-remove", "POST", { id_colors: id_colors }),

  getColors: (filters?: Record<string, unknown>) =>
    sendRequest("/catalago/colors/list", "GET", filters),
};
