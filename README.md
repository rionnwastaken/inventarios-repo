

Functionality 
Add row with values
    When inserting row, some values mustn be empty
    Input values like model and color are searchable so you dont duplicate with wrong caps
    If a value is not found , it stops displaying options and its gonna get added to the database once you commit the row
    added_date gets autofill with the current date but it can be modified
    There is a button for hitting create and validates before commiting
    Each row gets assigned an id in the database
    Should row save its date as the one of the input or literally when it was inserted?


Delete row
    Prompts user if he want to delete it
    When deletions, it communicates with  reverse system and history 

History view of Tejigo
<!-- Lets you select tejido in tubo and edit like, if there was trimming -->
Its interactive, it lets you modify the history (I think it might only make sense that the history kept are measurements updations and comments, and date of when the row in history was added)


View of of table with rows
It only displays the latest state of a row, the history of the row is hidden and only
visualized when double clicking a row


Multiple selection of rows
    for multi delete or copy

Save view of how table looks right now (Filters and everything, rows being displayed)
if some rows were deleted, then not displayed those
Being able to load saved view, being able to rename,delete,export 


Revert Action System
    tree or linear?

Search rows by simple filter ()
    multi select (models,colors) (This one use OR behaviour)

    (This ones add "AND" behaviour)
    >= > <= == for measurements (lets you change the symbol select only one) if input empty its not used no more
    after date added button opens calendar to select  and show after that date 

    (Pending to think how reset going be for those)
    

Search rows by advance filter
    There is a button for advance filter 
    Allows "and" and "or"


Button reset filter
A row is an individual with history, changes to the row affect the history  (for example changes in length of blind)
State persist, so refreshing website makes it stay where it was
When a woven fabric is completely used, it stops being searchable and goes to the history table for historic purposes

Maybe database should live in a specific place 
Import database
Export database to a location in filesystem

Extra features
Favorite system
Shortcut system
Export displayed table to excel
Button to copy table and paste in excel
Shortcut for copying selected rows 


Caveats
Logging will be essential
Only one tab of the program can be opened at a time




Tables

color
    id
    color string


blind_model
    id
    model string


ubicacion
    id
    ubicacion

proveedor
    id
    proveedor



Tubo (Un tubo puede tener varios tejidos)
    id
    ubicacion_id foreign nullable (It means that we dont know where it goes or is)

Tejido 
    id
    tubo_id foreign
    blind_model foreign
    color_id foreign
    proveedor_id foreign nullble
    general_comment nullable

measurement_history
    id
    tejido_id foreign
    width float not null 
    height float not null
    comment string nullable
    date_of_appearance date not null 



Documentacion de uso

Existen 2 usuarios
- La persona que corta telas y guarda telas en tubos  (Usuario empacador) (Usuario 1)
- La persona que administra las telas en el software y hace modificaiones cuando sea necesario (Usuario software) (Usuario 2)



En la forma mas basica, como se comunican los usuarios?

1. El usuario 1 le envia al usuario 2 un aproximado de los tubos que va a utilizar

2. El usuario 2, crea en la aplicacion los registros de los tubos para que se genere el ID 
REAL que se va a asignar a los tubos (Por el momento los tubos aqui no tienen telas)

3. El empacador tiene que  mantener un orden en su area de trabajo para que no haya confusiones al medir las telas y asignar los ID REALES,
pero primero lo que  haria el empacador es iniciar con el primer tubo.
Primero tendria que asignar al tubo, un ID numerico temporal que se utilizara despues, luego tiene que medir las telas que van a ir en el tubo,luego se tiene 
que poner esos datos en una libreta para que quede registrada (El ID TEMPORAL,color,modelo,clasificacion,ancho,alto,comentario opcional). Vendria bien unas etiquetas que se peguen facilmente al tubo para poder escribir el ID TEMPORAL).

Ejemplo de lo que escribiria el usuario en la libreta

ID_TEMP 1     <- ID  temporal
azul,Sd-90,1,   1.75m,3.0m
verde,Sd-70,3,  1.75m,3.0m

Nota -> Se puede escoger entre poner la clasificacion como texto o el identificador registrado en la base de datos. 
Si se escoge el ID de la clasificacion, se necesitario impreso el label de la clasificacion junto al ID de identificacion



4. Ya que el usuario 1 haya terminado de empacar los tubos, y se haya guardado el detalle de los tubos, y que claro las telas que van en cada tubo.
E lusuario 1 tiene que enviar el detalle al usuario 2.

5. El usuario tiene que registrar el detalle que recibio en cada tubo que habia creado previamente, si necesita un registro mas de de tubo, solamente tiene que crear
otro tubo, y si creo un tubo demas, solamente se tiene que eliminar el tubo (Los tubos que nunca tuvieron registrados telas son elegibles para ser eliminados completamente de la base de datos). 
Cuando el usuario empieza con un tubo, tiene que registrar la informacion en la aplicacion, y cuando termine de registrarla, lo que tiene que hacer es una libreta u hoja crear la relacion del ID TEMPORAL con el ID DE LA BASE DE DATOS, esto con el proposito que se envie ese detalle al usuario 1 sobre los Identificadores que necesita poner en cada tubo. Para que se vea reflejado la base de datos con la vida real.
El usuario tenie que marcar estos tubos como rectificado ya que se siguio el protocolo rigoroso para asegurar la veracidad de los datos


Creo que para que el usuario de software no mande una relacion equivocda , necesitar reenviar,lo que le paso el usuario 1 , pero para cada tubo anadiendo
 a lado el ID REAL


What if?

Que sucede si por el momento los tubos no tienen una ubicacion confirmada? Tal vez se tendria que buscar un espacio para poner tubos que no se le han asignado
una ubicacion. Yo creo que en el software se deberia seleccionar la opcion Ubicacion temporal, para que luego se pueda filtrar por los que tienen esa dato, y planificarsus proximas destinaciones. 


Que sucede si el usuario 2 manda equivocada la relacion de ID TEMPORAL con ID DE base de datos?
Que significa informacion equivocada? La relacion entre el ID temporal y el de la BASE de datos, significa que el contrato se ha roto y la aplicacion no reflejaria la realidad
Creo que para que el usario 1 pueda preveenir errores, el software tiene que trabajar a su favor, entonces el usuario 2 tendria que agregar al registro el ID temporal,
el software automaticante crearia el mensaje que se tendria que enviar al usuario 1, y el usuario 1 veria si hay discrepancias

Por ejemplo:

    El usuario 1 envia lo siguiente


    T=1
    azul,Sd-90,3,   1.75m,3.0m
    verde,Sd-70,3,  1.75m,3.0m


    T=2
    black,Glork,2,   2.0m,3.5m


    T=3
    yellow,Gloria,1,   1.0m,2.0m


    Si el usuario 2 comente un error asignando el ID temporal se podria ver asi


    T=1  1001
    black,Glork,2,   2.0m,3.5m


    T=2 1002
    azul,Sd-90,3,   1.75m,3.0m
    verde,Sd-70,3,  1.75m,3.0m


    T=3 1003
    yellow,Gloria,1,   1.0m,2.0m


    Si los id temporal estan alienedaos de abajo para arriba, se puede ver claramente que  se asigno mal el ID temporal.
    Esto tambien aplicaria para las medidas que son insertadas en el software, el usuario 1 podria ver una medida que puesta incorrectamente.





Que sucede si el usuario 1 campura mal? Valio queso, se va a guardar informacion incorrecta. El usuario 1 es la primera linea de defensa, si falla esta linea, el 
plan no va a funcionar



Esta manera de comunicacion en el sistema genera friccion porque un usuario consigue la informacion, y ahora tiene que pasar la informacion a otro usuario, como
telefono descompuesto, no es la mas ideal, pero es lo que se iniciar haciendo.


Lo ideal seria que el usuario 1 tenga una tableta en donde pueda registrar los tubos y telas, no hay necesidad de un ID temporal, le pica a un boton submit, y se
envian al server las tubos que no se habian enviado, el server les genera su identificacion, y se devuelve  a la tableta  el ID asignado  al tubo. Bueno talvez el ID temporal no desapareza porque esta bien que el usario pueda ver la relacion del registro que esta en la pantalla, con el tubo de la vida real.


https://www.amazon.com.mx/Hosyond-visualizaci%C3%B3n-Bluetooth-capacitiva-proyectos/dp/B0FKG7WRWV/ref=sr_1_5?sr=8-5#averageCustomerReviewsAnchor



