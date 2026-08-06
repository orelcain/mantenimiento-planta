# -*- coding: utf-8 -*-
"""Glosario aleman -> castellano del plano electrico BAADER 142.

Dos diccionarios:
  FRASES   se consulta PRIMERO, para lo que no se puede armar palabra por
           palabra (orden distinto en castellano, o giros idiomaticos).
  GLOSARIO palabra suelta, usado como respaldo.

Al ampliarlo: correr el extractor, que imprime los terminos aun sin traducir
ordenados por frecuencia. Se trabaja de arriba hacia abajo.
"""

# El plano rotula sus tablas en CUATRO idiomas (aleman, ingles, frances, y a
# ratos castellano y noruego). Todo lo que no sea castellano se traduce; aca
# solo quedan los tokens que NO son palabras de ningun idioma: siglas, normas,
# designaciones y nombres propios, que deben quedar tal cual.
IGNORAR = {
    "A.Busch", "CAD/A3", "GND", "TBus", "PMK", "YMK", "GPS", "PCS", "A3C",
    "BAADER", "VDE", "EVU", "RxD-", "TxD-", "Hertil", "komponentliste",
    "Page/Path", "Page/Col.", "Indices", "Raccord.",
    # ya estan en castellano en el propio plano
    "Notas", "lista", "aparatos", "Veanse", "Véanse",
}

# Codigos de color de conductor (IEC 60757). Se combinan de a dos ("BN-GN"),
# asi que se resuelven por patron en vez de listar las ~40 combinaciones.
COLORES = {
    "BK": "negro", "BN": "cafe", "RD": "rojo", "OG": "naranjo", "YE": "amarillo",
    "GN": "verde", "BU": "azul", "VT": "violeta", "GY": "gris", "WH": "blanco",
    "PK": "rosado", "TQ": "turquesa", "SR": "plateado", "GD": "dorado",
}

FRASES = {
    # --- cajetin (se repite en las 44 hojas) --------------------------------
    "Stromlauf- u. Klemmenplan": "Esquema de circuitos y plano de bornes",
    "Ersatz für:": "Sustituye a:", "Ersetzt durch:": "Sustituido por:",
    "Food Processing Machinery": "Maquinaria de proceso de alimentos",
    "kommt vor in Typ/Gr.": "Se usa en tipo/tamano",
    "Not- Aus": "Parada de emergencia",
    "Not-Aus": "Parada de emergencia",
    "Überlast Motore": "Sobrecarga de motores",
    "keine Steuerluft": "Falta aire de mando",
    "Störung A3C": "Falla del PLC A3C",
    "Eingänge 24V": "Entradas 24V",
    "Ausgänge 24V": "Salidas 24V",
    "24V allgem. Versorgung": "Alimentacion general 24V",
    "allgem. Versorgung": "Alimentacion general",
    "obere Kugelhähne": "Valvulas de bola superiores",
    "unterer Kugelhahn": "Valvula de bola inferior",
    "Zulauf Rücklauf": "Ida y retorno",
    "Abschaltung konv. Elektrik": "Desconexion electrica convencional",
    "konv. Elektrik": "Electrica convencional",
    "Haube links": "Campana izquierda",
    "Haube rechts": "Campana derecha",
    "Haube mitte": "Campana central",
    "Haube mitte links": "Campana centro izquierda",
    "Haube mitte rechts": "Campana centro derecha",
    "Kratzer Nullposition": "Rascador en posicion cero",
    "Messer Nullposition": "Cuchillo en posicion cero",
    "Motor Ein": "Motor conectado",
    "Motor Aus": "Motor desconectado",
    "Hauptschalter": "Interruptor general",
    "Netz Ein": "Red conectada",
    "Klemmenleiste": "Regla de bornes",
    "Seite/Pfad": "Hoja/Ruta",
    "Barette de Raccord.": "Regla de bornes",
    "Terminal strip": "Regla de bornes",
    # --- bloque de notas de la hoja 1 (linea por linea, cada una es su caja) --
    "*) Die Maschine muß unter Berücksichtigung de": "*) La maquina debe conectarse a la red segun",
    "örtlichen Bestimmungen des EVU bezüglich": "las normas locales de la distribuidora sobre",
    "Nullung bzw. Erdung gemäß VDE 0100 sowie": "neutralizacion o puesta a tierra (VDE 0100 y",
    "VDE 0113 an das Netz angeschlossen werden.": "VDE 0113).",
    "+) Vor dem Anschluß ist die Netzspannung mit der": "+) Antes de conectar, comparar la tension de red",
    "Spannungsangabe auf dem Leistungsschild zu": "con la indicada en la placa de caracteristicas.",
    "vergleichen.": " ",
    "1) Trennstelle": "1) Punto de corte",
    "Steuerstromkreis ist geerdet. Bei ungeerdetem": "El circuito de mando esta puesto a tierra. Sin",
    "Betrieb muß Isolationsüberwachung vorgesehen": "tierra hay que prever vigilancia de aislacion.",
    "werden.": " ",
    "2) Alle nicht bezeichneten Leitungen 1,5 qmm.": "2) Todo conductor sin rotular es de 1,5 mm2.",
    "5) Eingeklammerte Zahlen sind Ader- Nummern.": "5) Los numeros entre parentesis son n de hilo.",
    "6) Nur vorhanden bei Ausführung mit Siemens": "6) Solo en ejecucion con bomba de vacio",
    "Vakuumpumpe.": "Siemens.",
    "7) Nur vorhanden bei Ausführung mit YMK": "7) Solo en ejecucion con YMK",
    "8) Nur vorhanden bei Ausführung mit PMK (Nachreinigung)": "8) Solo en ejecucion con PMK (limpieza posterior)",
    "9) Nur vorhanden bei Ausführung mit Autofeed": "9) Solo en ejecucion con Autofeed",
    "10) Nur vorhanden bei Ausführung mit Autofeed & zweitem Ausgang": "10) Solo con Autofeed y segunda salida",
    "11) Nur vorhanden bei Ausführung ohne Autofeed": "11) Solo en ejecucion sin Autofeed",
    "12) Nur vorhanden bei Ausführung mit Semi- Automatik": "12) Solo en ejecucion semiautomatica",
    "15) Nur vorhanden bei Ausführung mit Rutsche (Ausgang C)": "15) Solo en ejecucion con canaleta (salida C)",
    "14) Nur vorhanden bei Ausführung mit Pipe-Cleaning-System (PCS)": "14) Solo con sistema limpia-tuberias (PCS)",
    "16) Nur vorhanden bei 7-Klammer Ausführung mit (Eingeweidetrennung) GPS": "16) Solo en ejecucion de 7 grampas con GPS (separacion de visceras)",
    "3) Nur bei Kundenwunsch vorhanden": "3) Solo a pedido del cliente",
    "Druck für": "Presion para",
    "für Druckluft": "para aire comprimido",
    "Spülwasser Klammern": "Agua de enjuague grampas",
    "Maschine läuft": "Maquina en marcha",
}

GLOSARIO = {
    # --- cajetin del plano --------------------------------------------------
    "Blatt": "Hoja", "Index": "Indice", "Datum": "Fecha", "erstellt": "creado",
    "bearbeitet": "modificado", "geprüft": "revisado", "Benennung": "Denominacion",
    "Zeichnungs-Nr.": "N de plano", "Klass.-Nr.": "N de clasificacion",
    "Maßstab": "Escala", "Werkstoff": "Material", "Ersatz": "Sustituye",
    "Ersetzt": "Sustituido", "Änderg.-Nr.": "N de modificacion",
    "Feld": "Campo", "kommt": "aparece", "vor": "en", "Typ/Gr.": "Tipo/tamano",
    "Geräteliste": "Lista de aparatos", "Hierzu": "Ver tambien",

    # --- estado / mando -----------------------------------------------------
    "Ein": "Conectado", "Aus": "Desconectado", "Start": "Marcha", "Stop": "Parada",
    "Störung": "Falla", "Störungen": "Fallas", "Meldung": "Aviso",
    "Freigabe": "Habilitacion", "Sperre": "Bloqueo", "Reset": "Reposicion",
    "Quittierung": "Reconocimiento", "Betrieb": "Servicio", "Hand": "Manual",
    "Automatik": "Automatico", "Semi-": "Semi", "Wahlschalter": "Selector",
    "Taster": "Pulsador", "Schalter": "Interruptor", "Endschalter": "Fin de carrera",
    "keine": "Falta", "nicht": "no", "Alle": "Todos", "Nur": "Solo",
    "vorhanden": "presente", "Ausführung": "Ejecucion", "mit": "con", "ohne": "sin",
    "bei": "en", "links": "izquierda", "rechts": "derecha", "mitte": "centro",
    "obere": "superior", "oberer": "superior", "unterer": "inferior", "untere": "inferior",
    "zweitem": "segundo", "Kodierung": "Codificacion", "Select": "Seleccion",

    # --- electrico ----------------------------------------------------------
    "Überlast": "Sobrecarga", "Motor": "Motor", "Motore": "motores",
    "Antrieb": "Accionamiento", "Steuerspannung": "Tension de mando",
    "Netzanschlußspannung": "Tension de red", "Netzspannung": "Tension de red",
    "Netz": "Red", "Einspeisung": "Acometida", "Erdung": "Puesta a tierra",
    "Nullung": "Neutralizacion", "Trennstelle": "Punto de corte",
    "Leitungen": "Conductores", "Leitung": "Conductor", "Kabel": "Cable",
    "Ader": "Hilo", "Ader-": "Hilo", "Klemme": "Borne", "Klemmen": "Bornes",
    "Klemmenleiste": "Regla de bornes", "Ziel": "Destino", "Quelle": "Origen",
    "Bemerkungen": "Observaciones", "Sicherung": "Fusible",
    "Abschaltung": "Desconexion", "Entlastung": "Alivio", "Entregen": "Desexcitacion",
    "Spannung": "Tension", "Strom": "Corriente", "Nennstrom": "Corriente nominal",
    "Frequenz": "Frecuencia", "Widerstand": "Resistencia", "Elektrik": "Electrica", "konv.": "convencional", "konventionell": "convencional",
    "Eingänge": "Entradas", "Eingang": "Entrada", "Eingabe": "Entrada",
    "Ausgänge": "Salidas", "Ausgang": "Salida", "Versorgung": "Alimentacion",
    "Timer": "Temporizador", "Drehwertgeber": "Encoder", "Sensor": "Sensor",
    "Näherungsschalter": "Sensor de proximidad", "Ventil": "Valvula",
    "ventil": "valvula", "Magnetventil": "Electrovalvula", "Relais": "Rele",
    "Schütz": "Contactor", "Umrichter": "Variador", "Trafo": "Transformador",

    # --- mecanica / proceso -------------------------------------------------
    "Maschine": "Maquina", "Grundplatte": "Placa base", "Haube": "Campana",
    "Messer": "Cuchillo", "Schlitzmesser": "Cuchillo ranurador",
    "Kratzer": "Rascador", "Ausschieber": "Expulsor", "Schlitten": "Carro",
    "Klammer": "Grampa", "Klammern": "Grampas", "Zentrierung": "Centrado",
    "Sauger": "Ventosa", "Sauger": "Ventosa", "Klappe": "Compuerta",
    "Rutsche": "Canaleta", "Kanal": "Canal", "Kontrollband": "Cinta de control",
    "Band": "Cinta", "Förderband": "Cinta transportadora", "Zyklon": "Ciclon",
    "Exzenter-": "Bomba de", "schneckenpumpe": "cavidad progresiva",
    "Pumpe": "Bomba", "Vakuum": "Vacio", "Vakuumpumpe": "Bomba de vacio",
    "Nullposition": "Posicion cero", "Rückenhöhe": "Altura de lomo",
    "Anuskontrolle": "Control de ano", "Kontrolle": "Control",
    "Stichel-": "Control de", "kontrolle": "punzon",
    "Sortierung": "Clasificacion", "Reinigung": "Limpieza",
    "Nachreinigung": "Limpieza posterior", "schwenken": "girar",
    "Schwenken": "Giro", "Drehung": "Giro", "Hub": "Carrera",
    "Zulauf": "Alimentacion", "Rücklauf": "Retorno", "Ablauf": "Descarga",
    "Kugelhahn": "Valvula de bola", "Kugelhähne": "Valvulas de bola",
    "Wasser": "Agua", "Kühlwasser": "Agua de refrigeracion",
    "Wasser-": "Agua", "Druck": "Presion", "Luft": "Aire",
    "Steuerluft": "Aire de mando", "Druckluft": "Aire comprimido",
    "Autofeed": "Autofeed", "Fisch": "Pescado", "ehem.": "ex",
    "leitung": "conductor", "Rohrreinigungs": "Limpia-tuberias",
    "Nachreinigungs": "Limpieza posterior", "Ausrüstung": "Equipamiento",
    "gerader": "recto", "Fischauslauf": "Salida de pescado",
    "Eingeweidetrennung": "Separacion de visceras", "gebogener": "curvo",
    "Maschinenkörper": "Cuerpo de la maquina", "Messerantrieb": "Accionamiento del cuchillo",
    "Exzenterschneckenpumpe": "Bomba de cavidad progresiva", "Nachlaufzeit": "Tiempo de marcha en inercia",
    "Fehlermeldungen": "Avisos de falla", "Tippen": "Marcha a impulsos",
    "Netzanschluß-": "Conexion de", "spannung": "red",
    "Spülwasser": "Agua de enjuague", "läuft": "en marcha", "für": "para",
    "bzw.": "o", "sowie": "y", "unter": "bajo", "die": "la", "der": "el",
}

# --- ingles ---------------------------------------------------------------
# El plano repite cada rotulo de tabla en ingles debajo del aleman.
INGLES = {
    "Destination": "Destino", "Source": "Origen", "Terminal": "Regla",
    "strip": "de bornes", "Notes": "Observaciones", "Page/Path": "Hoja/Ruta",
    "list": "lista", "implements": "de aparatos", "this": "para", "effect": "esto",
    "see": "ver", "cleaning": "limpieza", "cover": "campana", "left": "izquierda",
    "right": "derecha", "middle": "centro", "channel": "canal",
    "conventional": "convencional", "electrics": "electrica", "current": "corriente",
    "different": "distinto", "flap": "compuerta", "scraper": "rascador",
    "sensor": "sensor", "pipe": "tuberia", "mains": "red", "connection": "conexion",
    "cable": "cable", "Cable": "Cable", "start": "marcha", "short": "corto",
    "clean": "limpieza", "fish": "pescado", "autofeed": "autofeed",
    "system": "sistema", "Select": "Seleccion", "outlet": "salida",
}

# --- frances --------------------------------------------------------------
FRANCES = {
    "Terme": "Destino", "Barette": "Regla de bornes", "voir": "ver",
    "liste": "lista", "ustensiles": "de aparatos", "cet": "este", "effet": "efecto",
    "Remarques": "Observaciones", "Page/Col.": "Hoja/Col.",
}

# Un solo diccionario de consulta. El orden importa poco porque las colisiones
# entre idiomas (start/Start, cable/Kabel) significan lo mismo.
PALABRAS = {**INGLES, **FRANCES, **GLOSARIO}
