import axios from "axios";
import { createa_api } from "./axios_init.ts";
import { Location } from "../typeObj.ts";

const api = createa_api("catalago");

// Exported API Module (Guarantees payload is wrapped in an object)
export const CatalogApi = {
  addColor: async (colorName: string) => {
    return await api.post("/colors/add", { color_name: colorName });
  },
  getCatalago: async () => {
    return await api.get("all");
  },

  location_create: async () => {
    return await api.get("/location/create/");
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
  uploadLocationImage: async (file: File, description?: string) => {
    const formData = new FormData();
    formData.append("image", file);

    if (description) {
      formData.append("description", description);
    }

    return await api.post("/upload-location-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  updateLocationImage: async (
    id: number | string,
    file: File,
    description?: string,
  ) => {
    const formData = new FormData();
    formData.append("id", String(id));
    formData.append("image", file);

    if (description) {
      formData.append("description", description);
    }

    return await api.post("/update/location-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  location_delete: async (location_id: number) => {
    return await api.post("/location/delete/", {
      id: location_id,
    });
  },

  item_rename: async (id: Number, value: String, table_name: String) => {
    return await api.post("/item/rename/", {
      id: id,
      value: value,
      table_name: table_name,
    });
  },

  item_replace: async (
    previous_id: Number,
    new_id: Number,
    table_name: String,
  ) => {
    return await api.post("/item/replace/", {
      previous_id: previous_id,
      new_id: new_id,
      table_name: table_name,
    });
  },

  item_delete: async (id: Number, table_name: String) => {
    return await api.post("/item/delete/", {
      id: id,
      table_name: table_name,
    });
  },

  get_catalago_table_names: async () => {
    return await api.get("/catalago/table_names");
  },

  location_update: async (location_id: number, paylod: Partial<Location>) => {
    return await api.post("/location/update/", {
      id: location_id,
      payload: paylod,
    });
  },
};
