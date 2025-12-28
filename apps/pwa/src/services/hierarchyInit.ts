/**
 * Script de inicialización del sistema jerárquico
 * JERARQUIA UBICACION TECNICA PLANTA CHONCHI
 * Versión 2.0.0 - Diciembre 2025
 */

import { doc, Timestamp, writeBatch, getDoc } from 'firebase/firestore'
import { db } from './firebase'
import { HierarchyNode, HierarchyLevel } from '../types/hierarchy'
import { logger } from '../lib/logger'

// Función helper para generar ID seguro
function generateId(codigo: string): string {
  return codigo.toLowerCase().replace(/[^a-z0-9]/g, '-')
}

// Estructura de la jerarquía
interface HierarchyItem {
  codigo: string
  nombre: string
  nivel: HierarchyLevel
  padre: string | null
  descripcion?: string
}

// ==========================================
// JERARQUÍA PLANTA CHONCHI - VERIFICADA
// ==========================================

const JERARQUIA_CHONCHI: HierarchyItem[] = [
  // NIVEL 1 - EMPRESA
  { codigo: 'AQ-IN-CHO', nombre: 'CHONCHI', nivel: HierarchyLevel.EMPRESA, padre: null, descripcion: 'Planta Chonchi - AquaChile' },

  // NIVEL 2 - ÁREAS PRINCIPALES
  { codigo: 'AQ-IN-CHO-ACOP', nombre: 'ACOPIO', nivel: HierarchyLevel.AREA, padre: 'AQ-IN-CHO' },
  { codigo: 'AQ-IN-CHO-EXTE', nombre: 'PATIO Y SERVICIOS EXTERIORES', nivel: HierarchyLevel.AREA, padre: 'AQ-IN-CHO' },
  { codigo: 'AQ-IN-CHO-PCHO', nombre: 'PLANTA CHONCHI', nivel: HierarchyLevel.AREA, padre: 'AQ-IN-CHO' },
  { codigo: 'AQ-IN-CHO-PYAL', nombre: 'PLANTA YAL', nivel: HierarchyLevel.AREA, padre: 'AQ-IN-CHO' },

  // ==========================================
  // ACOPIO - SUB-ÁREAS
  // ==========================================
  { codigo: 'AQ-IN-CHO-ACOP-CAAM', nombre: 'CASETA AGUA MAR', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: 'AQ-IN-CHO-ACOP-JAUL', nombre: 'JAULAS', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: 'AQ-IN-CHO-ACOP-OFIC', nombre: 'OFICINAS ACOPIO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: 'AQ-IN-CHO-ACOP-PONT', nombre: 'PONTON', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-ACOP' },

  // ACOPIO - SISTEMAS/EQUIPOS
  { codigo: '720004340', nombre: 'SISTEMA BOMBEO PECES N1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004341', nombre: 'BOMBA VACIO ANILLO LIQUIDO N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004342', nombre: 'MOTOR ELEC BOMBA VACIO N1 SIST N1', nivel: HierarchyLevel.SECCION, padre: '720004341' },
  { codigo: '720004343', nombre: 'BOMBA VACIO ANILLO LIQUIDO N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004344', nombre: 'MOTOR ELEC BOMBA VACIO N2 SIST N1', nivel: HierarchyLevel.SECCION, padre: '720004343' },
  { codigo: '720004345', nombre: 'ESTANQUE BOMBEO A SISTEMA 1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004346', nombre: 'ESTANQUE BOMBEO B SISTEMA 1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004347', nombre: 'BOMBA FLUJO SISTEMA N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004348', nombre: 'MOTOR ELECTRICO BOMBA FLUJO', nivel: HierarchyLevel.SECCION, padre: '720004347' },
  { codigo: '720004349', nombre: 'TABLERO CONTROL SISTEMA N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004350', nombre: 'CONJUNTO VALVULAS SISTEMA N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004351', nombre: 'COMPRESOR AIRE N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004352', nombre: 'DUCTO SUCCION PECES SISTEMA N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004353', nombre: 'HIDROFORO SISTEMA N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },
  { codigo: '720004354', nombre: 'DUCTO DESCARGA N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004340' },

  { codigo: '720004355', nombre: 'SISTEMA BOMBEO PECES N2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004356', nombre: 'BOMBA VACIO ANILLO LIQUIDO N3', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004357', nombre: 'MOTOR ELEC BOMBA VACIO N3 SIST N2', nivel: HierarchyLevel.SECCION, padre: '720004356' },
  { codigo: '720004358', nombre: 'BOMBA VACIO ANILLO LIQUIDO N4', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004359', nombre: 'MOTOR ELEC BOMBA VACIO N4 SIST N2', nivel: HierarchyLevel.SECCION, padre: '720004358' },
  { codigo: '720004360', nombre: 'ESTANQUE BOMBEO A SISTEMA 2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004361', nombre: 'ESTANQUE BOMBEO B SISTEMA 2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004362', nombre: 'BOMBA FLUJO SISTEMA N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004363', nombre: 'MOTOR ELECTRICO BOMBA FLUJO N2', nivel: HierarchyLevel.SECCION, padre: '720004362' },
  { codigo: '720004364', nombre: 'TABLERO CONTROL SISTEMA N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004365', nombre: 'CONJUNTO VALVULAS SISTEMA N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004366', nombre: 'COMPRESOR AIRE N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004367', nombre: 'DUCTO SUCCION PECES SISTEMA N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004368', nombre: 'HIDROFORO SISTEMA N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },
  { codigo: '720004369', nombre: 'DUCTO DESCARGA N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004355' },

  { codigo: '720004370', nombre: 'BOMBA REFRIGERACION BOMBAS VACIO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004371', nombre: 'ESTANQUE AIRE COMPRIMIDO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  
  { codigo: '720004372', nombre: 'SISTEMA EXTRACCION AIRE CALIENTE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004373', nombre: 'EXTRACTOR AIRE CALIENTE N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004372' },
  { codigo: '720004374', nombre: 'EXTRACTOR AIRE CALIENTE N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004372' },
  { codigo: '720004375', nombre: 'EXTRACTOR AIRE CALIENTE N3', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004372' },

  { codigo: '720004376', nombre: 'SUB ESTACION ACOPIO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004377', nombre: 'TABLERO FUERZA GENERAL', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004376' },
  { codigo: '720004378', nombre: 'TABLERO FUERZA BOMBAS VACIO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004376' },
  { codigo: '720004379', nombre: 'TABLERO FUERZA BOMBAS FLUJO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004376' },
  { codigo: '720004380', nombre: 'TABLERO FUERZA ILUMINACION', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004376' },
  { codigo: '720004381', nombre: 'BANCO CONDENSADORES ACOPIO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004376' },

  { codigo: '720004382', nombre: 'EQUIPO TRATAMIENTO AGUAS NEGRAS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  
  { codigo: '720004383', nombre: 'HUINCHE LEVANTE MALLAS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004384', nombre: 'TABLERO CONTROL WINCHE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004383' },
  { codigo: '720004385', nombre: 'REDUCTOR MECANICO FUERZA', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004383' },
  { codigo: '720004386', nombre: 'MOTOR ELECTRICO WINCHE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004383' },

  { codigo: '720004387', nombre: 'ALARMA HUNDIMIENTO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004388', nombre: 'TERMO ELECTRICO AGUA CALIENTE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004389', nombre: 'MOTOBOMBA AGUA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004390', nombre: 'AIRE ACONDICIONADO COMEDOR 12000 BTU', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  
  { codigo: '720004391', nombre: 'BOTE TRASLADOS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP' },
  { codigo: '720004392', nombre: 'MOTOR FUERA BORDA', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004391' },

  // CASETA AGUA MAR
  { codigo: '720011724', nombre: 'BOMBA AGUA MAR 1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP-CAAM' },
  { codigo: '720011725', nombre: 'BOMBA AGUA MAR 2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-ACOP-CAAM' },

  // ==========================================
  // PATIO Y SERVICIOS EXTERIORES - SUB-ÁREAS
  // ==========================================
  { codigo: 'AQ-IN-CHO-EXTE-ALAG', nombre: 'ALMACENAMIENTO AGUAS', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-CASI', nombre: 'CASINO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-EADM', nombre: 'EDIFICIO ADMINISTRATIVO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-ESTA', nombre: 'ESTACIONAMIENTO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-ESTR', nombre: 'ESTANQUE DE TRANSFERENCIA AM', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-PATI', nombre: 'PATIO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-PORT', nombre: 'PORTERIA INGRESO PLANTA', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-POZO', nombre: 'POZOS PROFUNDOS', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-PRIL', nombre: 'PLANTA RILES', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },
  { codigo: 'AQ-IN-CHO-EXTE-RINC', nombre: 'RED DE INCENDIO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-EXTE' },

  // ALMACENAMIENTO AGUAS
  { codigo: '720004485', nombre: 'CLORADOR AUTOMATICO AGUA DULCE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },
  { codigo: '720004486', nombre: 'BOMBA DOSIFICACION PRECLORACION N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004485' },
  { codigo: '720004487', nombre: 'BOMBA DOSIFICACION PRECLORACION N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004485' },
  { codigo: '720004488', nombre: 'BOMBA DOSIFICACION AJUSTE FINO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004485' },
  { codigo: '720004489', nombre: 'CAUDALIMETRO ENTRADA AGUA DULCE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004485' },
  { codigo: '720004490', nombre: 'BOMBA RECIRCULACION AGUA DULCE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004485' },
  { codigo: '720004491', nombre: 'BOMBA TRASPASO AGUA DULCE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004485' },

  { codigo: '720004492', nombre: 'CLORADOR AUTOMATICO AGUA SALADA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },
  { codigo: '720004493', nombre: 'BOMBA DOSIFICACION PRECLORACION N1 AS', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004492' },
  { codigo: '720004494', nombre: 'BOMBA DOSIFICACION PRECLORACION N2 AS', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004492' },
  { codigo: '720004495', nombre: 'BOMBA DOSIFICACION AJUSTE FINO AS', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004492' },
  { codigo: '720004496', nombre: 'CAUDALIMETRO ENTRADA AGUA SALADA', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004492' },
  { codigo: '720004497', nombre: 'BOMBA RECIRCULACION AGUA SALADA', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004492' },

  { codigo: '720004498', nombre: 'FILTRO UV AGUA DULCE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },
  { codigo: '720004499', nombre: 'FILTRO UV AGUA SALADA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },
  { codigo: '720011857', nombre: 'ESTANQUE AGUA DULCE 1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },
  { codigo: '720011858', nombre: 'ESTANQUE AGUA DULCE 2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },
  { codigo: '720011859', nombre: 'ESTANQUE AGUA MAR', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ALAG' },

  // CASINO
  { codigo: '720004530', nombre: 'EXTRACTOR CASINO N1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-CASI' },
  { codigo: '720004531', nombre: 'EXTRACTOR CASINO N2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-CASI' },

  // EDIFICIO ADMINISTRATIVO
  { codigo: '720004542', nombre: 'AIRE ACONDICIONADO PERSONAS N1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-EADM' },
  { codigo: '720004543', nombre: 'AIRE ACONDICIONADO PERSONAS N2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-EADM' },
  { codigo: '720004544', nombre: 'AIRE ACONDICIONADO CONTROL PRODUCCION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-EADM' },
  { codigo: '720004545', nombre: 'AIRE ACONDICIONADO PREVENCION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-EADM' },
  { codigo: '720004546', nombre: 'AIRE ACONDICIONADO CAPACITACION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-EADM' },

  // ESTANQUE DE TRANSFERENCIA AM
  { codigo: '720004478', nombre: 'BOMBAS AGUA MAR N1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ESTR' },
  { codigo: '720004479', nombre: 'MOTOR ELECTRICO BOMBA AGUA MAR N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004478' },
  { codigo: '720004480', nombre: 'BOMBAS AGUA MAR N2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ESTR' },
  { codigo: '720004481', nombre: 'MOTOR ELECTRICO BOMBA AGUA MAR N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004480' },
  { codigo: '720004482', nombre: 'TABLERO ELECTRICO BOMBAS AGUA MAR', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ESTR' },
  { codigo: '720004500', nombre: 'BOMBA ADUCCION AGUA N1', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ESTR' },
  { codigo: '720004501', nombre: 'MOTOR ELECTRICO BOMBA ADUCCION N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004500' },
  { codigo: '720004502', nombre: 'BOMBA ADUCCION AGUA N2', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ESTR' },
  { codigo: '720004503', nombre: 'MOTOR ELECTRICO BOMBA ADUCCION N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004502' },
  { codigo: '720004504', nombre: 'BOMBA TRANSFERENCIA AGUA MAR', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-ESTR' },

  // PORTERIA
  { codigo: '720004538', nombre: 'AIRE ACONDICIONADO GERENCIA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PORT' },
  { codigo: '720004539', nombre: 'AIRE ACONDICIONADO PRODUCCION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PORT' },

  // RED DE INCENDIO
  { codigo: '720004483', nombre: 'RED DE INCENDIO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-RINC' },
  { codigo: '720004484', nombre: 'MOTOR ELECTRICO BOMBA RED INCENDIO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004483' },

  // PLANTA RILES
  { codigo: '720004549', nombre: 'BOMBA DESALOJO QUIMICOS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004550', nombre: 'ESTANQUE EQUALIZACION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004551', nombre: 'BOMBA AUTOCEBANTE PASILLO N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004550' },
  { codigo: '720004552', nombre: 'BOMBA AUTOCEBANTE PASILLO N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004550' },
  { codigo: '720004553', nombre: 'CAUDALIMETRO INGRESO AL DAF', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004550' },
  { codigo: '720004554', nombre: 'BOMBA HELICOIDAL DOSIFICACION POLIMERO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004550' },
  
  { codigo: '720004555', nombre: 'ESTANQUE ALMACENAMIENTO CLORO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004556', nombre: 'BOMBA MEMBRANA DOSIFICACION CLORO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004555' },
  { codigo: '720004557', nombre: 'BOMBA MEMBRANA DOSIFICACION COAGULANTE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004555' },

  { codigo: '720004558', nombre: 'FILTRO TORNILLO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004559', nombre: 'MOTOREDUCTOR FILTRO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004558' },
  { codigo: '720004560', nombre: 'TABLERO CONTROL FILTRO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004558' },
  { codigo: '720004561', nombre: 'BOMBA LIMPIEZA FILTRO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004558' },
  { codigo: '720004562', nombre: 'TORNILLO SIN FIN FILTRO', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004558' },

  { codigo: '720004563', nombre: 'ESTANQUE LODOS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004572', nombre: 'SIST SEPARACION POR AIRE DISUELTO (DAF)', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004573', nombre: 'BOMBA SATURACION AIRE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004572' },
  { codigo: '720004574', nombre: 'MOTOREDUCTOR PALETAS DESALOJO LODOS', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004572' },
  { codigo: '720004575', nombre: 'BOMBA HELICOIDAL EXTRAC LODOS N1', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004572' },
  { codigo: '720004576', nombre: 'BOMBA HELICOIDAL EXTRAC LODOS N2', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004572' },
  { codigo: '720004577', nombre: 'BOMBA MEMBRANA INYECCION ANTIESPUMANTE', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004572' },

  { codigo: '720004578', nombre: 'ESTANQUE CLORACION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004579', nombre: 'ESTANQUE METABISULFITO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004580', nombre: 'AGITADOR ESTANQUE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004581', nombre: 'MOTOREDUCTOR AGITADOR', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004580' },
  { codigo: '720004582', nombre: 'ESTANQUE DECLORACION', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },
  { codigo: '720004583', nombre: 'BOMBA AUTOCEBANTE RECIRCULACION', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004582' },
  { codigo: '720004584', nombre: 'CAUDALIMETRO SALIDA RIL AL MAR', nivel: HierarchyLevel.SUB_SISTEMA, padre: '720004582' },
  { codigo: '720004585', nombre: 'BOMBA PERISTALTICA INYEC ANTIESPUMANTE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-EXTE-PRIL' },

  // ==========================================
  // PLANTA CHONCHI - SUB-ÁREAS
  // ==========================================
  { codigo: 'AQ-IN-CHO-PCHO-EXTE', nombre: 'EXTERIORES PLANTA PRINCIPAL', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-PCHO' },
  { codigo: 'AQ-IN-CHO-PCHO-FRIG', nombre: 'FRIGORIFICO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-PCHO' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC', nombre: 'PROCESO', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-PCHO' },

  // EXTERIORES PLANTA PRINCIPAL - Sistemas
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-BMAT', nombre: 'BODEGA MATERIALES', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-CCAM', nombre: 'CARGA DE CAMIONES', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-SCAL', nombre: 'SALA CALDERA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-SCBO', nombre: 'SUBESTACION PLANTA PRINCIPAL', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-SMAQ', nombre: 'SALA DE MAQUINAS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-SFRE', nombre: 'SALA DE FREON', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },
  { codigo: 'AQ-IN-CHO-PCHO-EXTE-TMAN', nombre: 'TALLER MANTENIMIENTO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-EXTE' },

  // FRIGORIFICO - Sistemas
  { codigo: 'AQ-IN-CHO-PCHO-FRIG-ANCA', nombre: 'ANTECAMARA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-FRIG' },
  { codigo: 'AQ-IN-CHO-PCHO-FRIG-ANCC', nombre: 'ANDEN CARGA CAMIONES', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-FRIG' },
  { codigo: 'AQ-IN-CHO-PCHO-FRIG-CAMA', nombre: 'CAMARAS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-FRIG' },
  { codigo: 'AQ-IN-CHO-PCHO-FRIG-OFIC', nombre: 'OFICINAS FRIGORIFICO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-FRIG' },

  // PROCESO - Sistemas
  { codigo: 'AQ-IN-CHO-PCHO-PROC-ARMA', nombre: 'ARMADO DE CAJAS', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-EMPA', nombre: 'EMPARRILLADO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-EMPQ', nombre: 'EMPAQUE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-EVIS', nombre: 'EVISCERADO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-FILE', nombre: 'FILETE', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-INMP', nombre: 'INGRESO MATERIA PRIMA', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-LAVA', nombre: 'LAVADO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-OFIC', nombre: 'OFICINAS PROCESO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-SACR', nombre: 'SACRIFICIO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-SELL', nombre: 'SELLADO', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },
  { codigo: 'AQ-IN-CHO-PCHO-PROC-TUNE', nombre: 'TUNELES', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PCHO-PROC' },

  // ==========================================
  // PLANTA YAL - SUB-ÁREAS
  // ==========================================
  { codigo: 'AQ-IN-CHO-PYAL-EXTE', nombre: 'EXTERIOR PLANTA YAL', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-PYAL' },
  { codigo: 'AQ-IN-CHO-PYAL-PROC', nombre: 'PROCESO YAL', nivel: HierarchyLevel.SUB_AREA, padre: 'AQ-IN-CHO-PYAL' },

  // PLANTA YAL EXTERIOR - Sistemas
  { codigo: 'AQ-IN-CHO-PYAL-EXTE-SSMQ', nombre: 'SALA DE MAQUINAS YAL', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PYAL-EXTE' },
  { codigo: 'AQ-IN-CHO-PYAL-EXTE-SYAL', nombre: 'SUBESTACION YAL', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PYAL-EXTE' },

  // PLANTA YAL PROCESO - Sistemas
  { codigo: 'AQ-IN-CHO-PYAL-PROC-CCYA', nombre: 'CASA CAMIONES YAL', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PYAL-PROC' },
  { codigo: 'AQ-IN-CHO-PYAL-PROC-CHIL', nombre: 'CHILLER', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PYAL-PROC' },
  { codigo: 'AQ-IN-CHO-PYAL-PROC-EVIS', nombre: 'EVISCERADO YAL', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PYAL-PROC' },
  { codigo: 'AQ-IN-CHO-PYAL-PROC-OFIC', nombre: 'OFICINAS YAL', nivel: HierarchyLevel.SISTEMA, padre: 'AQ-IN-CHO-PYAL-PROC' },
]

export async function initializeHierarchySystem(userId: string): Promise<void> {
  try {
    console.log('[hierarchyInit] 🚀 Iniciando sistema jerárquico PLANTA CHONCHI para usuario:', userId)
    console.log('[hierarchyInit] 📊 Total de nodos a crear:', JERARQUIA_CHONCHI.length)

    // Crear mapa de IDs para referencias
    const idMap = new Map<string, string>()
    
    // Primero generar todos los IDs
    for (const item of JERARQUIA_CHONCHI) {
      idMap.set(item.codigo, generateId(item.codigo))
    }

    // Procesar en batches de 500 (límite de Firestore)
    const batchSize = 450
    let processedCount = 0
    
    for (let i = 0; i < JERARQUIA_CHONCHI.length; i += batchSize) {
      const batch = writeBatch(db)
      const chunk = JERARQUIA_CHONCHI.slice(i, i + batchSize)
      
      for (const item of chunk) {
        const nodeId = idMap.get(item.codigo)!
        const parentId = item.padre ? idMap.get(item.padre) : null
        
        // Construir path
        const path: string[] = []
        let currentParent = item.padre
        while (currentParent) {
          const parentNodeId = idMap.get(currentParent)
          if (parentNodeId) {
            path.unshift(parentNodeId)
          }
          const parentItem = JERARQUIA_CHONCHI.find(j => j.codigo === currentParent)
          currentParent = parentItem?.padre || null
        }

        // CRÍTICO: Verificar si el nodo YA existe antes de crear
        // Esto evita sobrescribir ediciones del usuario
        const nodeRef = doc(db, 'hierarchy', nodeId)
        const existingDoc = await getDoc(nodeRef)
        
        if (existingDoc.exists()) {
          console.log(`[hierarchyInit] ⚠️ Nodo ${item.codigo} ya existe, se omite (preservando ediciones)`)
          continue // NO sobrescribir nodos existentes
        }

        const node: Omit<HierarchyNode, 'id'> = {
          nombre: item.nombre,
          codigo: item.codigo,
          nivel: item.nivel,
          parentId: parentId,
          path: path,
          orden: processedCount + 1,
          activo: true,
          descripcion: item.descripcion || '',
          metadata: {},
          creadoPor: userId,
          creadoEn: Timestamp.now(),
          actualizadoEn: Timestamp.now(),
        }

        batch.set(nodeRef, node)
        processedCount++
      }
      
      await batch.commit()
      console.log(`[hierarchyInit] ✅ Batch completado: ${processedCount}/${JERARQUIA_CHONCHI.length} nodos`)
    }

    console.log('[hierarchyInit] 🎉 Sistema jerárquico inicializado exitosamente')
    console.log('[hierarchyInit] 📊 Total nodos creados:', processedCount)
    logger.info(`Hierarchy system initialized with ${processedCount} nodes`)
  } catch (error) {
    console.error('[hierarchyInit] ❌ Error durante inicialización:', error)
    logger.error('Failed to initialize hierarchy system', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Verificar si el sistema ya está inicializado
 */
export async function isHierarchyInitialized(): Promise<boolean> {
  try {
    const empresaDoc = await import('firebase/firestore').then(({ getDoc, doc }) =>
      getDoc(doc(db, 'hierarchy', generateId('AQ-IN-CHO')))
    )
    return empresaDoc.exists()
  } catch (error) {
    return false
  }
}
