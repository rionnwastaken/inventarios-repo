import {sendRequest} from "./api.ts";

// Exported API Module (Guarantees payload is wrapped in an object)
export const CoreAPI = {
  newTube: () =>
    sendRequest("/core/new/tube", "POST", {}),

};
