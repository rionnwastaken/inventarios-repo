import { CatalogApi } from "./api/catalog.ts";
import { CoreAPI } from "./api/core.ts";

import '../css/input.css';


const btn_new_tube = document.querySelector("#btn-new-tube")


btn_new_tube.addEventListener("click", async () => {
   const data = await CoreAPI.newTube()
   console.log(data)
})



document.addEventListener("DOMContentLoaded", () => {
});

import DataTable from "datatables.net-dt";
import "datatables.net-dt/css/dataTables.dataTables.css";

// Initialize DataTable

function Employee ( name, position, salary, office ) {
    this.name = name;
    this.position = position;
    this.salary = salary;
    this._office = office;

    this.office = function () {
        return this._office;
    }
};


function money(data, type, setVal, meta) {
    // 1. SETTER MODE: DataTables is writing a new value

    let salary = data

    if (type === 'set') {
        // Strip '$' or commas if passed as string, save raw number to row
        salary = typeof setVal === 'string' 
            ? parseFloat(setVal.replace(/[^0-9.-]+/g, '')) 
            : setVal;
        return;
    }

    // 2. DISPLAY MODE: What the user sees on screen
    if (type === 'display') {
        // Formats 3120 as "$3,120"
        return '$' + Number(salary).toLocaleString();
    }

    // 3. SORT / FILTER / TYPE MODE: Return raw number
    // Returning 3120 here ensures DataTables sorts numerically ($500 comes before $3,120)
    return salary;
}

const table = new DataTable('#myTable', {
    // data: [
    //     new Employee( "Tiger Nixon", "System Architect", 3120, "Edinburgh" ),
    //     new Employee( "Tiger Nixon", "System Architect", 3120, "Edinburgh" ),
    //     new Employee( "Tiger Nixon", "System Architect", 3120, "Edinburgh" ),
    //     new Employee( "Garrett Winters", "Director", 5300, "Edinburgh" )
    // ],
    columns: [
        { data: 'name', title:"color",width:"0.4" },
	  //      { data: 'salary', title:"salary",render(data, type, row, meta) {
	  // return money(data,type,row,meta)
	  //
	  //      },},
	  //      { data: 'office', title:"office"  },
	  //      { data: 'position', title:"position"  }
    ],
    ajax: async function (data,cb,settings) {
      try {
            let res = await CatalogApi.getColors()

	    console.log("Ajasx")
	    console.log(res)
	    console.log(res.data)

	    if (res.success) {
	      cb({
		  data: res.data.data
	      });

	    }

        } catch (error) {
            console.error("Fetch failed:", error);
        }

    },
    paging:false,
    autoWidth:true,

});



let rows = table.rows((idx,data) => data.salary <= 4000)
let data = rows.data()


data.each((value,index,dt) => {
  console.log(value)
})








