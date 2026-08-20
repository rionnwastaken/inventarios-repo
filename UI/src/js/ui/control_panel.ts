import { CatalogApi } from "../api/catalog.ts";
import { CoreAPI } from "../api/core.ts";
import { TypedEventEmitter } from "../emitter.ts";
import { Fabric, Tube } from "../schema.ts";

import { TableView,ViewMode } from "../typeObj.ts";
import { state } from "../state.ts";

const btn_new_tube = document.querySelector("#btn-new-tube");
const btn_test = document.querySelector("#test");
const view_text = document.querySelector("#tipo-tabla-vista-text");
const view_toggler: HTMLInputElement = document.querySelector(
  "#tipo-tabla-vista-toggler",
);

//TODO EVENT WHEN TUBO IS CREATED




export interface ControlPanelEvents {
  'view:changed': (view:TableView) => void;
}


class ControlPanel {
  public events = new TypedEventEmitter<ControlPanelEvents>();



  constructor() {

    this.init_bindings()
    this.init_state()

  }

  init_state() {

    this.init_state_toggler()

  }

  init_bindings() {
    this.bind_vista_toggler()
    this.bind_new_tube()
  }

  bind_vista_toggler() {
    view_toggler.addEventListener("click", () => {
      let view:TableView
      let previous = state.active_view

      if (state.active_view == "tube")  {
	state.active_view = "fabric"
      } else {
	state.active_view = "tube"
      }

      view_text.textContent = get_view_text(state.active_view)
      view = {
	  previous_view : previous,
	  new_view : state.active_view
	}
      console.log(view)
      this.events.emit("view:changed",view)
    });
  }


  bind_new_tube() {
    btn_new_tube.addEventListener("click", async () => {
      const data = await CoreAPI.newTube();
      console.log(data);
    });
  }

  init_state_toggler() {
    view_toggler.checked = false
    state.active_view = 'tube'
    view_text.textContent = get_view_text(state.active_view)
  }
}


function get_view_text(state:ViewMode) {
  if (state == 'fabric') {
    return "Vista Telas"
  }
  if (state == 'tube') {
    return "Vista Tubos"
  }

  return "Error"
}

const controlPanel = new ControlPanel
export {controlPanel}
