import axios from "axios";
import { createa_api } from "./axios_init.ts";

const api = createa_api("catalago");

// Exported API Module (Guarantees payload is wrapped in an object)
export const CatalogApi = {
  addColor: async (colorName: string) => {
    return await api.post("/colors/add", { color_name: colorName });
  },
  getCatalago: async () => {
    return await api.get("all");
  },

  get_optional_attributs_of_fabric: async () => {
    return await api.get("/fabric/optional_table_names_attributes");
  },
  addItem: async (table_name, value) => {
    return await api.post("/add/", {
      table_name: table_name,
      value: value,
    });
  },
};
